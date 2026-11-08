// End-to-end tests: the built plug, loaded by SilverBullet's plugos runtime in
// Chromium, rendering into SilverBullet's widget iframe (see harness/host.ts).
//
//   npm run build && npm run test:e2e
//
// Needs Playwright with Chromium. Set SHOTS=<dir> to save screenshots.
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { links, invalid, samples, wide } from "./samples.mjs";
import { PLUG_PATH, startServer } from "./harness/server.mjs";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error(
    "Playwright is required: npm i -D playwright && npx playwright install chromium",
  );
  process.exit(2);
}

const shots = process.env.SHOTS;
if (shots) await mkdir(shots, { recursive: true });

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) console.log("      ", JSON.stringify(detail));
  }
}

const server = await startServer();
const browser = await chromium.launch();
const external = [];

async function newPage(width = 900) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  // Anything not served by the harness counts as reaching for the network.
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(server.url) || url.startsWith("about:") || url.startsWith("data:")) {
      return route.continue();
    }
    external.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => check(`no page errors (${e.message})`, false));
  await page.goto(server.url);
  await page.waitForFunction(() => globalThis.harness);
  return page;
}

/** Adds a ```mermaid block to the page; resolves to its iframe's Frame once rendered. */
async function addBlock(page, source, { parent = "#content", id } = {}) {
  const blockId = id ?? `b${Math.random().toString(36).slice(2)}`;
  await page.evaluate(
    ([source, parent, blockId]) => {
      const line = document.createElement("div");
      line.id = blockId;
      line.className = "cm-line sb-fenced-code-iframe";
      // The closing fence (hidden; the iframe's negative margin overlaps it) and a blank line
      const after = [1, 2].map(() => {
        const spacer = document.createElement("div");
        spacer.className = "cm-line";
        spacer.innerHTML = "<br>";
        return spacer;
      });
      document.querySelector(parent).append(line, ...after);
      globalThis.harness.renderBlock("mermaid", source, line);
    },
    [source, parent, blockId],
  );
  const handle = await page.waitForSelector(`#${blockId} iframe`);
  const frame = await handle.contentFrame();
  await frame.waitForSelector(".pele-sb svg, .pele-sb-error", { timeout: 15000 });
  return { frame, iframe: handle, id: blockId };
}

const settle = (page, ms = 400) => page.waitForTimeout(ms);
const workers = (page) => page.evaluate(() => globalThis.harness.workerUrls.length);

try {
  // ---------------------------------------------------------------------------
  {
    console.log("\n# Lazy loading");
    const page = await newPage();
    await page.evaluate((p) => globalThis.harness.boot(p, 1), PLUG_PATH);
    check("first load of a new plug version boots the worker once, to read its manifest",
      (await workers(page)) === 1);

    const manifest = await page.evaluate(() => globalThis.harness.manifest("pele"));
    const hooks = Object.values(manifest.functions).flatMap((fn) =>
      Object.keys(fn).filter((k) => k !== "path"));
    check("manifest hooks nothing but the mermaid code widget",
      JSON.stringify(hooks) === '["codeWidget"]', hooks);

    await page.evaluate((p) => globalThis.harness.boot(p, 1), PLUG_PATH);
    check("later SilverBullet loads use the cached manifest: no worker",
      (await workers(page)) === 1);
    check("the mermaid widget is registered without the worker running",
      JSON.stringify(await page.evaluate(() => globalThis.harness.codeWidgetLanguages())) === '["mermaid"]');

    await addBlock(page, samples.flowchart);
    check("the first diagram on a page boots the worker", (await workers(page)) === 2);
    for (const name of ["sequence", "class", "state"]) await addBlock(page, samples[name]);
    check("further diagrams reuse it", (await workers(page)) === 2);

    await page.evaluate((p) => globalThis.harness.boot(p, 2), PLUG_PATH);
    check("an updated plug file is read once for its new manifest", (await workers(page)) === 3);
    await page.context().close();
  }

  // ---------------------------------------------------------------------------
  {
    console.log("\n# Rendering every diagram type");
    const page = await newPage();
    await page.evaluate((p) => globalThis.harness.boot(p, 1), PLUG_PATH);
    const blocks = [];
    for (const [name, source] of Object.entries(samples)) {
      blocks.push([name, await addBlock(page, source, { id: `t-${name}` })]);
    }
    await settle(page, 800);
    for (const [name, { frame, iframe }] of blocks) {
      const info = await frame.evaluate(() => ({
        error: document.querySelector(".pele-sb-error")?.textContent ?? null,
        svg: !!document.querySelector(".pele-sb svg.pele"),
        svgHeight: document.querySelector(".pele-sb svg")?.getBoundingClientRect().height ?? 0,
      }));
      const frameHeight = (await iframe.boundingBox()).height;
      check(`${name} renders, and its frame fits it`,
        info.svg && !info.error && Math.abs(frameHeight - 2 - info.svgHeight) <= 2,
        { ...info, frameHeight });
    }

    // Labels are measured in the worker (OffscreenCanvas) and drawn in the
    // iframe; they only fit their shapes if both agree on the font.
    const fit = await blocks[0][1].frame.evaluate(() =>
      [...document.querySelectorAll(".pele-node")].map((node) => ({
        id: node.getAttribute("data-id"),
        text: node.querySelector("text").getBBox().width,
        shape: node.querySelector("rect, polygon, path").getBBox().width,
      })));
    check("flowchart labels fit inside their nodes",
      fit.length === 5 && fit.every((n) => n.text + 8 <= n.shape), fit);

    if (shots) await page.screenshot({ path: join(shots, "gallery-light.png"), fullPage: true });
    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await settle(page);
    if (shots) await page.screenshot({ path: join(shots, "gallery-dark.png"), fullPage: true });
    await page.context().close();
  }

  // ---------------------------------------------------------------------------
  {
    console.log("\n# Theme");
    const page = await newPage();
    await page.evaluate((p) => globalThis.harness.boot(p, 1), PLUG_PATH);
    const { frame } = await addBlock(page, samples.flowchart);
    const colors = () => frame.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        theme: document.documentElement.dataset.theme,
        bg: root.getPropertyValue("--sb-bg").trim(),
        fg: root.getPropertyValue("--sb-fg").trim(),
        accent: root.getPropertyValue("--sb-accent").trim(),
        text: getComputedStyle(document.querySelector(".pele-label")).fill,
      };
    });
    const light = await colors();
    check("picks up the editor's light colors",
      light.theme === "light" && light.bg === "rgb(255, 255, 255)" &&
        light.fg === "rgb(32, 37, 45)" && light.accent === "#3569b8", light);
    if (shots) await page.screenshot({ path: join(shots, "light.png") });

    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await frame.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    const dark = await colors();
    check("follows the editor into dark mode without re-rendering",
      dark.bg === "rgb(17, 17, 17)" && dark.fg === "rgb(233, 237, 242)" &&
        dark.accent === "#79a9f2" && dark.text !== light.text, dark);
    if (shots) await page.screenshot({ path: join(shots, "dark.png") });

    await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
    await frame.waitForFunction(() => document.documentElement.dataset.theme === "light");
    check("and back", JSON.stringify(await colors()) === JSON.stringify(light));

    await page.evaluate(() => {
      const quote = document.createElement("div");
      quote.className = "quote";
      quote.id = "quote";
      document.querySelector("#content").appendChild(quote);
    });
    const quoted = await addBlock(page, samples.flowchart, { parent: "#quote" });
    const bg = await quoted.frame.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--sb-bg").trim());
    // rgba(72, 72, 72, 0.1) over white; canvas compositing may round either way
    const [r, g, b] = (bg.match(/\d+/g) ?? []).map(Number);
    check("edge label backgrounds match a translucent blockquote background",
      [r, g, b].every((c) => Math.abs(c - 236.7) <= 1), bg);
    await page.context().close();
  }

  // ---------------------------------------------------------------------------
  {
    console.log("\n# Errors");
    const page = await newPage();
    await page.evaluate((p) => globalThis.harness.boot(p, 1), PLUG_PATH);
    const { frame } = await addBlock(page, invalid);
    const error = await frame.evaluate(() => ({
      title: document.querySelector(".pele-sb-error strong")?.textContent,
      message: document.querySelector(".pele-sb-error pre")?.textContent,
    }));
    check("syntax errors show where they are",
      error.title === "Syntax error on line 2, column 8" && error.message?.includes("^"), error);

    await page.evaluate(() => (globalThis.pwned = false));
    const xss = await addBlock(page,
      'flowchart LR\n  A --> B\n  <img src=x onerror="parent.pwned=true"> -->');
    const unsupported = await addBlock(page, "hello <b>world</b>");
    await settle(page);
    check("error messages quoting the diagram are escaped",
      (await xss.frame.$$("img")).length === 0 && (await unsupported.frame.$$("b")).length === 0 &&
        !(await page.evaluate(() => globalThis.pwned)));
    check("unknown diagram types say so",
      (await unsupported.frame.textContent(".pele-sb-error strong")) === "Unsupported diagram");
    if (shots) await page.screenshot({ path: join(shots, "errors.png") });
    await page.context().close();
  }

  // ---------------------------------------------------------------------------
  {
    console.log("\n# Clicks and links");
    const page = await newPage();
    await page.evaluate((p) => globalThis.harness.boot(p, 1), PLUG_PATH);
    const { frame } = await addBlock(page, links);
    await frame.evaluate(() => {
      globalThis.opened = [];
      globalThis.open = (...args) => (globalThis.opened.push(args), null);
    });
    const blurs = () => page.evaluate(() => globalThis.harness.state.blurs);

    await frame.click("svg.pele", { position: { x: 3, y: 3 } });
    await settle(page, 200);
    check("clicking the diagram puts the cursor into its code block", (await blurs()) === 1);

    await frame.click('.pele-node[data-id="A"] a');
    await settle(page, 200);
    const opened = await frame.evaluate(() => globalThis.opened);
    check("web links open in a new tab, not in place of SilverBullet",
      opened.length === 1 && opened[0][0] === "https://example.com/docs" && opened[0][1] === "_blank",
      opened);

    await frame.click('.pele-node[data-id="B"] a');
    await settle(page, 200);
    const nav = await page.evaluate(() => globalThis.harness.state.navigations);
    check("internal-link nodes navigate to the page", JSON.stringify(nav) === '["Wiki"]', nav);
    check("link clicks don't enter edit mode", (await blurs()) === 1);

    // codeWidget.refreshAll posts the same HTML and script into the same iframe.
    const content = await page.evaluate((s) => globalThis.harness.invoke("pele.mermaidWidget", s), links);
    await frame.evaluate((c) => window.postMessage({ type: "html", ...c, theme: "light" }, "*"), content);
    await settle(page);
    await frame.click("svg.pele", { position: { x: 3, y: 3 } });
    await settle(page, 200);
    check("a refreshed widget doesn't double up its listeners", (await blurs()) === 2);
    await page.context().close();
  }

  // ---------------------------------------------------------------------------
  {
    console.log("\n# Adaptive layout");
    const page = await newPage();
    await page.evaluate((p) => globalThis.harness.boot(p, 1), PLUG_PATH);
    const size = (frame) => frame.evaluate(() => {
      const svg = document.querySelector(".pele-sb svg");
      return { width: Number(svg.getAttribute("width")), height: Number(svg.getAttribute("height")) };
    });

    const natural = await page.evaluate((s) => globalThis.harness.invoke("pele.renderSvg", s, 0), wide);
    const desktop = await addBlock(page, wide);
    await desktop.frame.waitForFunction(
      (w) => Number(document.querySelector(".pele-sb svg").getAttribute("width")) < w,
      natural.width);
    const laidOut = await size(desktop.frame);
    const shown = await desktop.frame.evaluate(() => ({
      svg: document.querySelector(".pele-sb svg").getBoundingClientRect().width,
      frame: document.documentElement.clientWidth,
    }));
    // Above Pele's 640px direction breakpoint a left-to-right chain stays
    // horizontal, so Pele can only tighten it; CSS scales the rest.
    check("a diagram wider than the editor is laid out again for the editor's width",
      laidOut.width < natural.width && shown.svg <= shown.frame,
      { natural: natural.width, laidOut, shown });

    await page.evaluate(() => {
      const box = document.createElement("div");
      box.className = "narrow";
      box.id = "narrow";
      document.querySelector("#content").appendChild(box);
    });
    const phone = await addBlock(page, wide, { parent: "#narrow" });
    await phone.frame.waitForFunction(() => {
      const svg = document.querySelector(".pele-sb svg");
      return Number(svg.getAttribute("height")) > Number(svg.getAttribute("width"));
    });
    const vertical = await size(phone.frame);
    check("on a phone-width editor it turns vertical", vertical.width <= 360, vertical);
    if (shots) await page.screenshot({ path: join(shots, "narrow.png"), fullPage: true });

    await page.evaluate(() => (document.querySelector("#narrow").style.width = "1600px"));
    await phone.frame.waitForFunction(
      (w) => Number(document.querySelector(".pele-sb svg").getAttribute("width")) === w,
      natural.width);
    check("and goes back to its natural layout when there's room", true);
    const iframeHeight = (await phone.iframe.boundingBox()).height;
    check("the frame's height follows the layout", Math.abs(iframeHeight - 2 - natural.height) <= 2,
      { iframeHeight, natural: natural.height });
    await page.context().close();
  }

  // ---------------------------------------------------------------------------
  {
    console.log("\n# Configuration");
    const page = await newPage();
    await page.evaluate((p) => {
      globalThis.harness.state.config.pele = {
        links: false,
        fontFamily: "monospace",
        fontSize: "huge",
        css: ".pele { --pele-accent: rgb(255, 0, 0); } </style><b>escaped</b>",
      };
      return globalThis.harness.boot(p, 1);
    }, PLUG_PATH);
    const { frame } = await addBlock(page, links);
    const info = await frame.evaluate(() => {
      const svg = document.querySelector("svg.pele");
      return {
        anchors: document.querySelectorAll("a").length,
        accent: getComputedStyle(svg).getPropertyValue("--pele-accent").trim(),
        font: svg.style.fontFamily,
        bold: document.querySelectorAll("b").length,
      };
    });
    check("links: false leaves no links", info.anchors === 0, info);
    check("css is applied, and can't break out of its <style>",
      info.accent === "rgb(255, 0, 0)" && info.bold === 0, info);
    check("fontFamily is used (and a bad fontSize is ignored)", info.font.includes("monospace"), info);
    await page.context().close();
  }

  // ---------------------------------------------------------------------------
  console.log("\n# Network");
  check("never requests anything but the plug itself (no CDN)", external.length === 0, external);
  const served = [...new Set(server.requests)].sort();
  check("server only served the page, harness and plug file",
    JSON.stringify(served) === JSON.stringify(["/", `/.fs/${PLUG_PATH}`, "/host.js"]), served);
} finally {
  await browser.close();
  await server.close();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
