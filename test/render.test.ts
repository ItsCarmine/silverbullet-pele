import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, resolveConfig } from "../src/config.ts";
import { diagramHtml, escapeHtml, failureHtml, widgetHtml } from "../src/html.ts";
import { describeFailure, renderDiagram } from "../src/render.ts";
import { frameMain } from "../src/frame.ts";

const flowchart = "flowchart LR\n  A[Hard] -->|Text| B(Round)";

test("resolveConfig fills in defaults", () => {
  assert.deepEqual(resolveConfig(undefined), defaults);
  assert.deepEqual(resolveConfig(null), defaults);
  assert.deepEqual(resolveConfig([]), defaults);
});

test("resolveConfig keeps valid values and drops invalid ones", () => {
  const cfg = resolveConfig({
    fontFamily: "Helvetica, sans-serif",
    fontSize: 20,
    adaptive: false,
    links: false,
    images: "no",
    mermaid: { flowchart: { curve: "linear" } },
    css: ".pele { --pele-accent: red; }",
  });
  assert.equal(cfg.fontFamily, "Helvetica, sans-serif");
  assert.equal(cfg.fontSize, 20);
  assert.equal(cfg.adaptive, false);
  assert.equal(cfg.links, false);
  assert.equal(cfg.images, true);
  assert.deepEqual(cfg.mermaid, { flowchart: { curve: "linear" } });
  assert.equal(cfg.css, ".pele { --pele-accent: red; }");

  const bad = resolveConfig({ fontFamily: "  ", fontSize: 1000, mermaid: ["x"] });
  assert.equal(bad.fontFamily, defaults.fontFamily);
  assert.equal(bad.fontSize, defaults.fontSize);
  assert.equal(bad.mermaid, undefined);
});

test("renderDiagram renders SVG with the configured font", () => {
  const result = renderDiagram(flowchart, resolveConfig({ fontFamily: "Georgia, serif" }));
  assert.match(result.svg, /^<svg[^>]*class="pele pele-flowchart"/);
  assert.match(result.svg, /font-family:var\(--pele-font,Georgia, serif\)/);
  assert.ok(result.width > 0 && result.height > 0);
});

test("renderDiagram lays out for a narrower width when asked", () => {
  const wide = "flowchart LR\n  A[One step] --> B[Two steps] --> C[Three steps] --> D[Four steps]";
  const natural = renderDiagram(wide, defaults);
  const narrow = renderDiagram(wide, defaults, 320);
  assert.ok(narrow.width < natural.width);
  assert.ok(narrow.height > natural.height, "turns vertical below Pele's breakpoint");
});

test("describeFailure explains Pele errors", () => {
  const syntax = (() => {
    try {
      renderDiagram("flowchart LR\n  A --> ", defaults);
    } catch (e) {
      return describeFailure(e);
    }
  })();
  assert.equal(syntax?.title, "Syntax error on line 2, column 8");
  assert.match(syntax!.message, /Parse error on line 2/);

  const unsupported = (() => {
    try {
      renderDiagram("hello", defaults);
    } catch (e) {
      return describeFailure(e);
    }
  })();
  assert.equal(unsupported?.title, "Unsupported diagram");

  assert.deepEqual(describeFailure(new Error("boom")), {
    title: "Pele failed to render this diagram",
    message: "boom",
  });
});

test("failureHtml escapes everything it shows", () => {
  const html = failureHtml({ title: "<b>t</b>", message: `<img src=x onerror="x()"> & '` });
  assert.ok(!html.includes("<img") && !html.includes("<b>"));
  assert.ok(html.includes("&lt;img src=x onerror=&quot;x()&quot;&gt; &amp; &#39;"));
  assert.equal(escapeHtml(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
});

test("widgetHtml keeps user CSS inside its <style>", () => {
  const html = widgetHtml(diagramHtml("<svg></svg>"), "a{} </STYLE><b>x</b>");
  assert.equal(html.match(/<\/style>/gi)?.length, 2);
  assert.ok(html.includes("<\\/STYLE><b>x</b></style>"));
  assert.ok(!widgetHtml("x", "   ").includes("</style><style>"), "no empty user style");
});

test("frameMain's source parses as a standalone function", () => {
  // It's sent to the iframe as text. Running it there, from the minified
  // bundle, is covered by the end-to-end tests.
  const source = frameMain.toString();
  const fn = new Function(`return (${source});`)();
  assert.equal(typeof fn, "function");
  assert.ok(!/\bimport\b|\brequire\(/.test(source));
});
