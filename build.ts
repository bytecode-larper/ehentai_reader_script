import { ESLint } from "eslint";
import { watch } from "fs";
import { join } from "path";

const header = `// ==UserScript==
// @name         E-Hentai Clean Reader
// @namespace    https://e-hentai.org/
// @version      2.3.0
// @icon         https://api.iconify.design/ph/book-open-bold.svg
// @match        https://e-hentai.org/s/*/*
// @match        https://exhentai.org/s/*/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==\n\n`;

async function build() {
  const result = await Bun.build({
    entrypoints: ["./src/main.ts"],
    outdir: "./dist",
    naming: "ehentai_clean_reader.user.js",
    minify: false,
    target: "browser",
  });

  if (result.success) {
    const bundlePath = "./dist/ehentai_clean_reader.user.js";
    // result.outputs[0] is the primary bundle
    let code = await result.outputs[0].text();
    console.log(`[${new Date().toLocaleTimeString()}] 📦 Bundled size: ${code.length} bytes`);

    const eslint = new ESLint({ fix: true });
    const results = await eslint.lintText(code, { filePath: "src/main.ts" });
    const formattedCode = results[0]?.output || code;
    
    if (results[0]?.output) {
        console.log(`[${new Date().toLocaleTimeString()}] ✨ ESLint formatted (size: ${formattedCode.length} bytes)`);
    } else {
        console.log(`[${new Date().toLocaleTimeString()}] ℹ️ ESLint made no changes`);
    }

    await Bun.write(bundlePath, header + formattedCode);
    console.log(`[${new Date().toLocaleTimeString()}] ✅ Build complete.`);
  } else {
    console.error("❌ Build failed", result.logs);
  }
}

// Initial build
await build();

// Handle flags
const args = process.argv.slice(2);
const shouldWatch = args.includes("--watch");
const shouldServe = args.includes("--serve");

if (shouldWatch) {
  console.log("👀 Watching for changes in src/...");
  watch(join(import.meta.dir, "src"), { recursive: true }, async (event, filename) => {
    if (filename) {
      await build();
    }
  });
}

if (shouldServe) {
  const port = 8080;
  Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/ehentai_clean_reader.user.js") {
        console.log(
          `[${new Date().toLocaleTimeString()}] 📦 Serving script to ${req.headers.get("user-agent")?.split(" ")[0]}`,
        );
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
  console.log(`🚀 Server running at http://localhost:${port}/ehentai_clean_reader.user.js`);
}
