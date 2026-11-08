/**
 * A stand-in for SilverBullet's client, for testing the plug in a real browser.
 *
 * Plug loading uses SilverBullet's own plugos runtime from the npm package —
 * System, Plug, WorkerSandbox, the KV manifest cache and the CodeWidgetHook —
 * wired up the way client/client_system.ts does it. Widgets are shown the way
 * SilverBullet's IFrameWidget shows them: in an about:blank iframe that gets
 * SilverBullet's sandbox template written into it (see panel_html.ts), then the
 * widget's HTML and script posted to it.
 */
import { System } from "../../node_modules/@silverbulletmd/silverbullet/client/plugos/system.ts";
import { WorkerSandbox } from "../../node_modules/@silverbulletmd/silverbullet/client/plugos/sandboxes/worker_sandbox.ts";
import { KVPrimitivesManifestCache } from "../../node_modules/@silverbulletmd/silverbullet/client/plugos/manifest_cache.ts";
import { CodeWidgetHook } from "../../node_modules/@silverbulletmd/silverbullet/client/plugos/hooks/code_widget.ts";
import { panelHtml } from "./panel_html.ts";

type KvKey = string[];

// Count every Worker the page starts, before anything can start one.
const NativeWorker = globalThis.Worker;
const workerUrls: string[] = [];
globalThis.Worker = class extends NativeWorker {
  constructor(url: string | URL, options?: WorkerOptions) {
    workerUrls.push(String(url));
    super(url, options);
  }
} as typeof Worker;

/** The two KvPrimitives methods the manifest cache uses, kept in memory. */
class MemoryKv {
  store = new Map<string, unknown>();
  batchGet(keys: KvKey[]): Promise<unknown[]> {
    return Promise.resolve(keys.map((k) => this.store.get(JSON.stringify(k))));
  }
  batchSet(entries: { key: KvKey; value: unknown }[]): Promise<void> {
    for (const { key, value } of entries) {
      this.store.set(JSON.stringify(key), value);
    }
    return Promise.resolve();
  }
}

// Survives "page reloads" (new System instances), like IndexedDB does.
const manifestKv = new MemoryKv();

const state = {
  config: {} as Record<string, unknown>,
  navigations: [] as unknown[],
  blurs: 0,
  syscalls: [] as string[],
};

let system: System<any>;
let codeWidgetHook: CodeWidgetHook;

/** Simulates a SilverBullet page load: a fresh System that loads the plug. */
async function boot(plugPath: string, lastModified: number) {
  if (system) await system.unloadAll();
  system = new System(undefined, {
    manifestCache: new KVPrimitivesManifestCache(manifestKv as any, "manifest"),
  });
  codeWidgetHook = new CodeWidgetHook();
  system.addHook(codeWidgetHook);
  system.registerSyscalls([], {
    "system.getConfig": (_ctx: unknown, key: string, defaultValue: unknown) => {
      state.syscalls.push("system.getConfig");
      return key in state.config ? state.config[key] : defaultValue;
    },
    // Same lookup as SilverBullet's client/plugos/syscalls/system.ts
    "system.invokeFunction": (_ctx: unknown, fullName: string, ...args: unknown[]) => {
      state.syscalls.push(`system.invokeFunction:${fullName}`);
      const [plugName, functionName] = fullName.split(".");
      const plug = system.loadedPlugs.get(plugName);
      if (!plug) throw Error(`Plug ${plugName} not found`);
      if (!plug.manifest!.functions[functionName]) {
        throw Error(`Function ${functionName} not found`);
      }
      return plug.invoke(functionName, args);
    },
    "editor.navigate": (_ctx: unknown, ref: unknown) => {
      state.syscalls.push("editor.navigate");
      state.navigations.push(ref);
    },
  });
  // As client_system.ts loadPlugFromPath does
  await system.loadPlug(WorkerSandbox.forPath(plugPath), plugPath, lastModified);
}

/** SilverBullet's prepareSandboxIFrame + mountIFrame, minus pooling and caching. */
function mountWidget(
  container: HTMLElement,
  content: Promise<{ html?: string; script?: string } | null>,
): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.src = "about:blank";
  iframe.style.visibility = "hidden";
  const ready = new Promise<void>((resolve) => {
    iframe.onload = () => {
      iframe.contentDocument!.write(panelHtml);
      iframe.style.visibility = "visible";
      resolve();
    };
  });
  container.appendChild(iframe);
  iframe.style.height = "150px"; // IFrameWidget's estimated height

  void ready.then(async () => {
    globalThis.addEventListener("message", (evt: MessageEvent) => {
      if (evt.source !== iframe.contentWindow || !evt.data) return;
      const data = evt.data;
      switch (data.type) {
        case "syscall": {
          const { id, name, args } = data;
          system.localSyscall(name, args).then(
            (result) =>
              iframe.contentWindow?.postMessage({ type: "syscall-response", id, result }),
            (e: Error) =>
              iframe.contentWindow?.postMessage({ type: "syscall-response", id, error: e.message }),
          );
          break;
        }
        case "setHeight":
          iframe.style.height = `${data.height}px`;
          break;
        case "blur": // IFrameWidget moves the cursor into the code block
          state.blurs++;
          break;
      }
    });
    iframe.onload = null;
    const resolved = await content;
    if (resolved?.html) {
      iframe.contentWindow!.postMessage({
        type: "html",
        html: resolved.html,
        script: resolved.script,
        theme: document.documentElement.dataset.theme,
      });
    }
  });
  return iframe;
}

/** What fenced_code.ts + IFrameWidget do for a ```lang block. */
function renderBlock(lang: string, body: string, container: HTMLElement) {
  const callback = codeWidgetHook.codeWidgetCallbacks.get(lang);
  if (!callback) throw new Error(`No code widget for ${lang}`);
  const iframe = mountWidget(container, callback(body, "Test Page"));
  container.dataset.lang = lang;
  return iframe;
}

(globalThis as any).harness = {
  boot,
  renderBlock,
  state,
  workerUrls,
  codeWidgetLanguages: () => [...codeWidgetHook.codeWidgetCallbacks.keys()],
  manifest: (name: string) => system.loadedPlugs.get(name)?.manifest,
  invoke: (fullName: string, ...args: unknown[]) => system.invokeFunction(fullName, args),
};
