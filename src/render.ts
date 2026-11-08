import { PeleError, render, type RenderOptions } from "pele";
import type { ResolvedConfig } from "./config.ts";

export type Rendered = {
  svg: string;
  /** Natural width of the diagram in pixels. */
  width: number;
  height: number;
};

export type Failure = {
  title: string;
  /** Pele's message. It can quote the diagram, so it must be escaped before display. */
  message: string;
};

/**
 * Renders Mermaid source to SVG. Pele is synchronous and never touches the DOM,
 * which is what lets this run inside the plug's Web Worker: labels are measured
 * with an OffscreenCanvas there.
 *
 * @param maxWidth lay the diagram out for this many pixels, or 0 for its natural size
 */
export function renderDiagram(
  source: string,
  cfg: ResolvedConfig,
  maxWidth = 0,
): Rendered {
  const result = render(source, {
    fontFamily: cfg.fontFamily,
    fontFamilyMono: cfg.fontFamilyMono,
    fontSize: cfg.fontSize,
    links: cfg.links,
    images: cfg.images,
    // Plain data from the user's config; Pele validates what it reads.
    config: cfg.mermaid as RenderOptions["config"],
    maxWidth: maxWidth > 0 ? maxWidth : undefined,
  });
  return { svg: result.svg, width: result.width, height: result.height };
}

export function describeFailure(error: unknown): Failure {
  if (error instanceof PeleError) {
    switch (error.code) {
      case "syntax":
        return {
          title: error.line > 0
            ? `Syntax error on line ${error.line}${error.column > 0 ? `, column ${error.column}` : ""}`
            : "Syntax error",
          message: error.message,
        };
      case "unsupported-diagram":
        return { title: "Unsupported diagram", message: error.message };
      case "limit":
        return { title: "Diagram too large", message: error.message };
      default:
        return { title: "Invalid diagram", message: error.message };
    }
  }
  return {
    title: "Pele failed to render this diagram",
    message: error instanceof Error ? error.message : String(error),
  };
}
