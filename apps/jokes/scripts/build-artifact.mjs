// Builds a single self-contained HTML page for publishing as a claude.ai Artifact.
// React is loaded from cdnjs (UMD globals); the app code and CSS are inlined.
// Usage: npm run build:artifact -w @gmb/jokes  ->  apps/jokes/dist-artifact/hasya-wheel.html
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shim = (f) => resolve(root, "scripts", f);

const result = await build({
  entryPoints: [resolve(root, "src/main.jsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  write: false,
  jsx: "automatic",
  loader: { ".css": "empty" },
  alias: {
    react: shim("react-global.js"),
    "react/jsx-runtime": shim("react-global.js"),
    "react-dom/client": shim("react-dom-global.js"),
  },
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = readFileSync(resolve(root, "src/styles.css"), "utf8");

const html = `<title>Hasya Wheel</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Spin the wheel for a random joke in English, Hindi, Telugu or Tamil.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;700;800&family=Noto+Sans+Devanagari:wght@400;600&family=Noto+Sans+Telugu:wght@400;600&family=Noto+Sans+Tamil:wght@400;600&display=swap">
<style>
${css}
</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>window.HASYA_NO_SHARE = true;</script>
<script>
${js}
</script>
`;
mkdirSync(resolve(root, "dist-artifact"), { recursive: true });
const out = resolve(root, "dist-artifact/hasya-wheel.html");
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} KB)`);
