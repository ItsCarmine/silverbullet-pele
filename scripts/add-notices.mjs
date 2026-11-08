// Appends the licenses of the bundled code to pele.plug.js. Pele's MIT license
// asks for its notice in every copy, and the plug *is* a copy of Pele, so the
// notice ships inside the file people install, not just in this repository.
//
// Appended rather than prepended (like esbuild's legalComments: "eof"), so the
// positions in the source map stay valid.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const plugFile = join(repo, "pele.plug.js");

const peleDir = dirname(require.resolve("pele/package.json"));
const sbDir = join(repo, "node_modules", "@silverbulletmd", "silverbullet");
const pele = JSON.parse(await readFile(join(peleDir, "package.json"), "utf8"));
const sb = JSON.parse(await readFile(join(sbDir, "package.json"), "utf8"));

const comment = (text) => text.trim().replaceAll("*/", "* /");
const notices = `/*! Bundled third-party code:

Pele ${pele.version} (https://pele.run, https://github.com/obsidianmd/pele)

${comment(await readFile(join(peleDir, "LICENSE"), "utf8"))}

---

SilverBullet ${sb.version} plug runtime (https://silverbullet.md)

${comment(await readFile(join(sbDir, "LICENSE.md"), "utf8"))}
*/
`;

const MARKER = "/*! Bundled third-party code:";
const SOURCE_MAP = /\n\/\/# sourceMappingURL=[^\n]*\n?$/;

const code = await readFile(plugFile, "utf8");
const map = code.match(SOURCE_MAP)?.[0] ?? "";
let body = map ? code.slice(0, -map.length) : code;
// Running twice replaces the notices instead of adding them again.
if (body.includes(MARKER)) body = body.slice(0, body.indexOf(MARKER));
await writeFile(plugFile, `${body.trimEnd()}\n${notices}${map.replace(/^\n/, "")}`);
console.log(`Added license notices for Pele ${pele.version} to ${plugFile}`);
