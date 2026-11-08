import { system } from "@silverbulletmd/silverbullet/syscalls";
import type { CodeWidgetContent } from "@silverbulletmd/silverbullet/type/client";
import { type ResolvedConfig, resolveConfig } from "./config.ts";
import { type FrameOptions, frameMain } from "./frame.ts";
import { diagramHtml, failureHtml, widgetHtml } from "./html.ts";
import { describeFailure, type Rendered, renderDiagram } from "./render.ts";

const RENDER_FUNCTION = "pele.renderSvg";
const FRAME_SCRIPT = frameMain.toString();

async function loadConfig(): Promise<ResolvedConfig> {
  return resolveConfig(await system.getConfig("pele", {}));
}

/** Code widget for ```mermaid blocks. Renders in this worker; the iframe only gets SVG. */
export async function mermaidWidget(
  bodyText: string,
): Promise<CodeWidgetContent> {
  const cfg = await loadConfig();
  let content: string;
  let width = 0;
  try {
    const rendered = renderDiagram(bodyText, cfg);
    content = diagramHtml(rendered.svg);
    width = rendered.width;
  } catch (e) {
    content = failureHtml(describeFailure(e));
  }
  const options: FrameOptions = {
    source: bodyText,
    width,
    adaptive: cfg.adaptive,
    renderFunction: RENDER_FUNCTION,
  };
  return {
    html: widgetHtml(content, cfg.css),
    script: `(${FRAME_SCRIPT})(${JSON.stringify(options)});`,
  };
}

/** Lays a diagram out for `maxWidth` pixels (0 = natural size), for the frame script. */
export async function renderSvg(
  source: string,
  maxWidth: number,
): Promise<Rendered | null> {
  const cfg = await loadConfig();
  try {
    return renderDiagram(source, cfg, Number(maxWidth) || 0);
  } catch (e) {
    console.warn("Can't render diagram for width", maxWidth, e);
    return null;
  }
}
