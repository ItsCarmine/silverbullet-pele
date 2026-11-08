import type { Failure } from "./render.ts";

/**
 * Styles for the widget iframe. SilverBullet's own stylesheets aren't loaded
 * there, so this carries light and dark palettes matching SilverBullet's
 * default theme. The frame script replaces them with the editor's live colors
 * (`--sb-*`), and Pele's `--pele-*` variables are derived from those.
 */
const BASE_CSS = `
:root {
  color-scheme: light;
  --sb-bg: #fff;
  --sb-fg: #20252d;
  --sb-muted: #676767;
  --sb-accent: #3569b8;
  --sb-danger: #dc3545;
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --sb-bg: #111;
  --sb-fg: #e9edf2;
  --sb-muted: #959595;
  --sb-accent: #79a9f2;
  --sb-danger: #f87171;
}
html, body {
  margin: 0;
  padding: 0;
  background: transparent;
  overflow: hidden;
}
.pele-sb > svg {
  display: block;
  margin: 0 auto;
}
.pele {
  --pele-bg: var(--sb-bg);
  --pele-fg: var(--sb-fg);
  --pele-muted: var(--sb-muted);
  --pele-line: color-mix(in srgb, var(--sb-fg) 80%, var(--sb-bg));
  --pele-surface: color-mix(in srgb, var(--sb-fg) 6%, var(--sb-bg));
  --pele-surface-alt: color-mix(in srgb, var(--sb-fg) 3%, var(--sb-bg));
  --pele-border: color-mix(in srgb, var(--sb-fg) 35%, var(--sb-bg));
  --pele-accent: var(--sb-accent);
  --pele-critical: var(--sb-danger);
  --pele-error: var(--sb-danger);
}
.pele a {
  cursor: pointer;
}
.pele-sb-error {
  box-sizing: border-box;
  padding: 8px 12px;
  border-left: 4px solid var(--sb-danger);
  border-radius: 4px;
  background: color-mix(in srgb, var(--sb-danger) 9%, transparent);
  color: var(--sb-fg);
  font: 14px/1.45 system-ui, sans-serif;
}
.pele-sb-error strong {
  color: var(--sb-danger);
}
.pele-sb-error pre {
  margin: 6px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: 12.5px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
`;

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

/** Keeps user CSS from closing the <style> element it's placed in. */
function cssText(css: string): string {
  return css.replace(/<\/(style)/gi, "<\\/$1");
}

export function diagramHtml(svg: string): string {
  return `<div class="pele-sb">${svg}</div>`;
}

export function failureHtml(failure: Failure): string {
  return `<div class="pele-sb-error" role="alert"><strong>${
    escapeHtml(failure.title)
  }</strong><pre>${escapeHtml(failure.message)}</pre></div>`;
}

export function widgetHtml(content: string, userCss = ""): string {
  const extra = userCss.trim() ? `<style>${cssText(userCss)}</style>` : "";
  return `<style>${BASE_CSS}</style>${extra}${content}`;
}
