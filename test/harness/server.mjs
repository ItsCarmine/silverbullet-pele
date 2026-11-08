// Serves the harness page, the bundled host script, and the built plug at the
// path SilverBullet's WorkerSandbox loads plugs from (/.fs/<space path>).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");

export const PLUG_PATH = "Library/shorecxopg/pele.plug.js";

// worker_sandbox.ts imports this module, which the npm package doesn't ship.
const spacesConstants = {
  name: "spaces-constants",
  setup(build) {
    build.onResolve({ filter: /spaces\/constants\.ts$/ }, () => ({
      path: "spaces-constants",
      namespace: "shim",
    }));
    build.onLoad({ filter: /.*/, namespace: "shim" }, () => ({
      contents: 'export const fsEndpoint = "/.fs";',
      loader: "js",
    }));
  },
};

async function bundleHost() {
  const result = await esbuild.build({
    entryPoints: [join(here, "host.ts")],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    plugins: [spacesConstants],
  });
  return result.outputFiles[0].text;
}

/**
 * @param {{ plugFile?: string }} [options]
 * @returns {Promise<{ url: string, requests: string[], close: () => Promise<void> }>}
 */
export async function startServer(options = {}) {
  const plugFile = options.plugFile ?? join(repo, "pele.plug.js");
  const hostJs = await bundleHost();
  const requests = [];
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    requests.push(path);
    try {
      if (path === "/" || path === "/index.html") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(await readFile(join(here, "index.html")));
      } else if (path === "/host.js") {
        res.writeHead(200, { "content-type": "text/javascript" });
        res.end(hostJs);
      } else if (path === `/.fs/${PLUG_PATH}`) {
        res.writeHead(200, { "content-type": "text/javascript" });
        res.end(await readFile(plugFile));
      } else {
        res.writeHead(404).end();
      }
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await startServer();
  console.log(`Harness running at ${url}`);
}
