import { ESLint } from "eslint";

const header = `// ==UserScript==
// @name         E-Hentai Clean Reader
// @namespace    https://e-hentai.org/
// @version      2.3.0
// @match        https://e-hentai.org/s/*/*
// @match        https://exhentai.org/s/*/*
// @grant        GM_addStyle
// ==/UserScript==\n\n`;

const result = await Bun.build({
  entrypoints: ["./src/main.ts"],
  outdir: "./dist",
  naming: "ehentai_clean_reader.user.js",
  minify: false, // Keep it false so ESLint has something to work with
});

if (result.success) {
  const bundlePath = "./dist/ehentai_clean_reader.user.js";
  let code = await Bun.file(bundlePath).text();

  // Initialize ESLint API
  const eslint = new ESLint({ fix: true });

  // Format the bundled code
  const results = await eslint.lintText(code, { filePath: "src/main.ts" });

  // Use the fixed output if available, otherwise keep original
  const formattedCode = results[0]?.output || code;

  // Prepend header and save
  await Bun.write(bundlePath, header + formattedCode);

  console.log("✅ Build complete: Bundled, ESLint-formatted, and Header added.");
} else {
  console.error("❌ Build failed", result.logs);
}
