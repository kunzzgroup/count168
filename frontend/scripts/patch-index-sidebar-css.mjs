/**
 * Ensure production index.html loads /frontend/dist/css/sidebar.css AFTER the Vite CSS bundle
 * so sidebar fixes apply without redeploying hash-renamed JS/CSS assets.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const indexPath = resolve(repoRoot, "frontend/dist/index.html");
const SIDEBAR_LINK =
  '<link rel="stylesheet" href="/frontend/dist/css/sidebar.css?v=20260703-sidebar-scroll" />';

let html = readFileSync(indexPath, "utf8");

if (html.includes("css/sidebar.css")) {
  console.log("[patch-index-sidebar-css] sidebar.css link already present");
  process.exit(0);
}

const bundleCss = html.match(
  /<link rel="stylesheet" crossorigin href="\/frontend\/dist\/assets\/index-[^"]+\.css">/,
);

if (bundleCss) {
  html = html.replace(bundleCss[0], `${bundleCss[0]}\n    ${SIDEBAR_LINK}`);
} else {
  html = html.replace("</head>", `    ${SIDEBAR_LINK}\n  </head>`);
}

writeFileSync(indexPath, html, "utf8");
console.log("[patch-index-sidebar-css] injected sidebar.css link into dist/index.html");
