/**
 * The `pele` configuration key, as set from Space Lua:
 *
 *     config.set("pele", { fontFamily = "Helvetica, sans-serif" })
 */
export type PeleConfig = {
  /** Label font. Measured inside the plug's worker, so use a font installed on the device. */
  fontFamily?: string;
  /** Monospace label font. */
  fontFamilyMono?: string;
  /** Base font size in pixels. */
  fontSize?: number;
  /** Lay diagrams out again when they're wider than the editor. */
  adaptive?: boolean;
  /** Make `click` links and `internal-link` nodes clickable. */
  links?: boolean;
  /** Allow images in diagrams. These are fetched from the network when shown. */
  images?: boolean;
  /** Default Mermaid configuration; a diagram's frontmatter and directives override it. */
  mermaid?: Record<string, unknown>;
  /** Extra CSS for the diagram frame, e.g. `.pele { --pele-accent: #c00; }`. */
  css?: string;
};

export type ResolvedConfig = {
  fontFamily: string;
  fontFamilyMono: string;
  fontSize: number;
  adaptive: boolean;
  links: boolean;
  images: boolean;
  mermaid: Record<string, unknown> | undefined;
  css: string;
};

export const defaults: ResolvedConfig = {
  fontFamily: "sans-serif",
  fontFamilyMono: "monospace",
  fontSize: 16,
  adaptive: true,
  links: true,
  images: true,
  mermaid: undefined,
  css: "",
};

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Fills in defaults and ignores values of the wrong type rather than failing the render. */
export function resolveConfig(raw: unknown): ResolvedConfig {
  const cfg: PeleConfig = isRecord(raw) ? raw : {};
  const fontSize = Number(cfg.fontSize);
  return {
    fontFamily: str(cfg.fontFamily, defaults.fontFamily),
    fontFamilyMono: str(cfg.fontFamilyMono, defaults.fontFamilyMono),
    fontSize: Number.isFinite(fontSize) && fontSize >= 6 && fontSize <= 72
      ? fontSize
      : defaults.fontSize,
    adaptive: bool(cfg.adaptive, defaults.adaptive),
    links: bool(cfg.links, defaults.links),
    images: bool(cfg.images, defaults.images),
    mermaid: isRecord(cfg.mermaid) ? cfg.mermaid : undefined,
    css: typeof cfg.css === "string" ? cfg.css : defaults.css,
  };
}
