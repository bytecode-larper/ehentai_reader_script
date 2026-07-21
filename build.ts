import { ESLint } from "eslint";
import { watch } from "fs";
import { join } from "path";

const pkg = await Bun.file("./package.json").json();

const USERSCRIPT_NAME = "E-Hentai Clean Reader";
const USERSCRIPT_ICON = "https://api.iconify.design/ph/book-open-bold.svg";
const USERSCRIPT_NAMESPACE = "https://github.com/bytecode-larper/";

function makeHeader(): string {
  return [
    "// ==UserScript==",
    `// @name         ${USERSCRIPT_NAME}`,
    `// @namespace    ${USERSCRIPT_NAMESPACE}`,
    `// @version      ${pkg.version}`,
    `// @description  ${pkg.description}`,
    "// @author       bytecode-larper",
    `// @icon         ${USERSCRIPT_ICON}`,
    "// @match        https://e-hentai.org/s/*/*",
    "// @match        https://exhentai.org/s/*/*",
    "// @grant        GM_addStyle",
    "// @grant        GM_getValue",
    "// @grant        GM_setValue",
    "// @grant        GM_registerMenuCommand",
    "// @run-at       document-start",
    "// @license      MIT",
    "// ==/UserScript==",
  ].join("\n") + "\n\n";
}

async function build(header: string): Promise<void> {
  const result = await Bun.build({
    entrypoints: ["./src/main.ts"],
    outdir: "./dist",
    naming: "ehentai_clean_reader.user.js",
    minify: false,
    target: "browser",
  });

  if (!result.success) {
    console.error("Build failed", result.logs);
    process.exit(1);
  }

  const bundlePath = "./dist/ehentai_clean_reader.user.js";
  let code = await result.outputs[0].text();
  console.log(`[${new Date().toLocaleTimeString()}] Bundled size: ${code.length} bytes`);

  const eslint = new ESLint({ fix: true });
  const results = await eslint.lintText(code, { filePath: "src/main.ts" });
  const formattedCode = results[0]?.output || code;

  if (results[0]?.output) {
    console.log(`[${new Date().toLocaleTimeString()}] ESLint formatted (size: ${formattedCode.length} bytes)`);
  } else {
    console.log(`[${new Date().toLocaleTimeString()}] ESLint made no changes`);
  }

  await Bun.write(bundlePath, header + formattedCode);
  console.log(`[${new Date().toLocaleTimeString()}] Build complete.`);
}

const header = makeHeader();
const args = process.argv.slice(2);
const shouldWatch = args.includes("--watch");
const shouldServe = args.includes("--serve");

await build(header);

if (shouldWatch) {
  console.log("Watching for changes in src/...");
  let buildTimeout: ReturnType<typeof setTimeout> | null = null;
  watch(join(import.meta.dir, "src"), { recursive: true }, (event, filename) => {
    if (!filename) return;
    if (buildTimeout) clearTimeout(buildTimeout);
    buildTimeout = setTimeout(async () => {
      console.log(`[${new Date().toLocaleTimeString()}] Change: ${filename}`);
      await build(header);
    }, 150);
  });
}

if (shouldServe) {
  const port = 8080;
  Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/ehentai_clean_reader.user.js") {
        return new Response(Bun.file("./dist/ehentai_clean_reader.user.js"), {
          headers: {
            "Content-Type": "application/javascript",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
      return new Response("Not Found", { status: 404 });
    },
  });
  console.log(`Server running at http://localhost:${port}/ehentai_clean_reader.user.js`);
}
