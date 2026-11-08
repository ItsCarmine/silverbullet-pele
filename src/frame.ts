/**
 * Runs inside the widget's iframe, which SilverBullet builds from its sandbox
 * template: that template provides `syscall()` and `updateHeight()` and sets
 * `data-theme` on <html> when it receives the widget's HTML.
 *
 * The plug sends this function as source text (Function.prototype.toString), so
 * it must not refer to anything outside its own body.
 */
export type FrameOptions = {
  /** The diagram source, to lay it out again for another width. */
  source: string;
  /** Natural width of the rendered diagram, or 0 when it didn't render. */
  width: number;
  /** Lay the diagram out again when the frame is narrower than `width`. */
  adaptive: boolean;
  /** Plug function that renders `source` for a width: "plug.function". */
  renderFunction: string;
};

export function frameMain(opts: FrameOptions): void {
  const win = window;
  const doc = document;
  const root = doc.documentElement;
  const g = globalThis as unknown as {
    syscall?: (name: string, ...args: unknown[]) => Promise<any>;
    updateHeight?: () => void;
    __peleDispose?: () => void;
  };

  // SilverBullet posts the HTML and script into the same iframe again when
  // widgets are refreshed. Undo the previous run first.
  g.__peleDispose?.();
  const cleanups: (() => void)[] = [];
  g.__peleDispose = () => cleanups.splice(0).forEach((cleanup) => cleanup());

  const fitHeight = () => {
    if (typeof g.updateHeight === "function") g.updateHeight();
  };

  // ---------------------------------------------------------------------------
  // Theme. SilverBullet tells the iframe whether it's light or dark when the
  // widget loads, but not when that changes, and passes none of its colors.
  // The iframe is same-origin, so follow the editor directly. Without access,
  // the stylesheet's built-in light and dark palettes apply.
  let host: HTMLElement | null = null;
  try {
    host = win.frameElement as HTMLElement | null;
  } catch {
    host = null;
  }
  const hostDoc = host?.ownerDocument;
  const hostWin = hostDoc?.defaultView;

  // The color painted behind the widget, so edge labels' backgrounds match it
  // inside blockquotes, callouts and custom themes too. Backgrounds can be
  // translucent and in any CSS color syntax, so composite them on a canvas.
  const backdrop = (from: Element): string | null => {
    if (!hostWin) return null;
    const canvas = doc.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const alpha = (color: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgba(0, 0, 0, 0)";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return ctx.getImageData(0, 0, 1, 1).data[3];
    };
    const layers: string[] = [];
    for (let el: Element | null = from; el; el = el.parentElement) {
      const color = hostWin.getComputedStyle(el).backgroundColor;
      const a = color ? alpha(color) : 0;
      if (a > 0) layers.push(color);
      if (a === 255) break;
    }
    if (layers.length === 0) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = root.getAttribute("data-theme") === "dark" ? "#111" : "#fff";
    ctx.fillRect(0, 0, 1, 1);
    for (let i = layers.length - 1; i >= 0; i--) {
      ctx.fillStyle = layers[i];
      ctx.fillRect(0, 0, 1, 1);
    }
    const [r, gr, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${r}, ${gr}, ${b})`;
  };

  const setVar = (name: string, value: string | null | undefined) => {
    if (value) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  };

  const followTheme = () => {
    if (!host || !hostDoc || !hostWin) return;
    if (!host.isConnected) {
      g.__peleDispose?.();
      return;
    }
    const theme = hostDoc.documentElement.getAttribute("data-theme");
    if (theme) root.setAttribute("data-theme", theme);
    const style = hostWin.getComputedStyle(host);
    setVar("--sb-fg", style.color);
    setVar("--sb-bg", backdrop(host));
    setVar("--sb-muted", style.getPropertyValue("--subtle-color").trim());
    setVar("--sb-accent", style.getPropertyValue("--ui-accent-color").trim());
    setVar("--sb-danger", style.getPropertyValue("--danger-color").trim());
  };

  try {
    followTheme();
    if (hostDoc) {
      const observer = new MutationObserver(() => {
        try {
          followTheme();
        } catch {
          // The editor went away mid-update; the next change will try again.
        }
      });
      observer.observe(hostDoc.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      cleanups.push(() => observer.disconnect());
    }
  } catch (e) {
    console.warn("[pele] Can't follow the editor theme:", e);
  }
  // Removing the iframe unloads it; don't leave an observer on the editor behind.
  const onPageHide = () => g.__peleDispose?.();
  win.addEventListener("pagehide", onPageHide);
  cleanups.push(() => win.removeEventListener("pagehide", onPageHide));

  // ---------------------------------------------------------------------------
  // Clicks. Links open like SilverBullet's own links; anywhere else puts the
  // cursor into the code block so the diagram can be edited.
  const openLink = (link: Element) => {
    const href = (
      link.getAttribute("data-href") ??
      link.getAttribute("href") ??
      link.getAttributeNS("http://www.w3.org/1999/xlink", "href") ??
      ""
    ).trim();
    if (!href) return;
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1]?.toLowerCase();
    if (!scheme || link.classList.contains("internal-link")) {
      // A note name (`class A internal-link`) or a relative link: a page.
      g.syscall?.("editor.navigate", href).catch((e: unknown) =>
        console.warn("[pele] Can't open", href, e),
      );
    } else if (scheme === "http" || scheme === "https") {
      win.open(href, "_blank", "noopener,noreferrer");
    } else {
      // mailto:, tel:, or a scheme allowed through Pele's linkSchemes.
      win.top!.location.href = href;
    }
  };

  const onClick = (event: MouseEvent) => {
    const target = event.target as Element | null;
    const link = target?.closest?.("a");
    if (link) {
      event.preventDefault();
      openLink(link);
      return;
    }
    win.parent.postMessage({ type: "blur" }, "*");
  };
  doc.addEventListener("click", onClick);
  cleanups.push(() => doc.removeEventListener("click", onClick));

  // ---------------------------------------------------------------------------
  // Size. Pele's SVG scales down to fit the frame. Keep the frame's height in
  // step with it, and when there's room for less than the diagram's natural
  // width, have Pele lay it out for the space there is (wrapping labels, or
  // turning a wide flowchart vertical on a phone) instead of just shrinking it.
  let laidOutFor = 0; // width the shown SVG was laid out for; 0 = natural
  let request = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const adapt = () => {
    if (!opts.adaptive || opts.width <= 0 || typeof g.syscall !== "function") {
      return;
    }
    const available = Math.floor(root.clientWidth);
    if (available <= 0) return;
    const target = opts.width > available ? available : 0;
    if (target === laidOutFor) return;
    const id = ++request;
    g.syscall("system.invokeFunction", opts.renderFunction, opts.source, target)
      .then((result: { svg?: unknown } | null) => {
        const box = doc.querySelector(".pele-sb");
        if (id !== request || !box || typeof result?.svg !== "string") return;
        box.innerHTML = result.svg;
        laidOutFor = target;
        fitHeight();
      })
      .catch((e: unknown) =>
        console.warn("[pele] Can't lay the diagram out for this width:", e),
      );
  };

  const resizeObserver = new ResizeObserver(() => {
    fitHeight();
    clearTimeout(timer);
    timer = setTimeout(adapt, 100);
  });
  resizeObserver.observe(root);
  cleanups.push(() => {
    resizeObserver.disconnect();
    clearTimeout(timer);
    request++;
  });

  adapt();
}
