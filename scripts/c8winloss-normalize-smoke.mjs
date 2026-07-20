/**
 * Red/green smoke: C8 Kendo k-group-footer must normalize to 3 rows
 * with money not crushed into col1.
 *
 * Usage (from count168 or with sibling count168test playwright):
 *   node scripts/c8winloss-normalize-smoke.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

function loadPlaywright() {
  const candidates = [
    path.resolve(root, "node_modules/playwright"),
    path.resolve(root, "../count168test/frontend/node_modules/playwright"),
    path.resolve(root, "../count168test/node_modules/playwright"),
  ];
  for (const dir of candidates) {
    try {
      return require(dir);
    } catch {
      /* next */
    }
  }
  throw new Error("playwright not found — npm i -D playwright or use count168test frontend");
}

const { chromium } = loadPlaywright();

const AGENT1 = [
  "CKZ03",
  "87",
  "AGENT",
  "85,423.66",
  "19,004.16",
  "0.00",
  "19,004.16",
  "0.00",
  "16,254.51",
  "-2,749.65",
];
const AGENT2 = [
  "CKZ16",
  "8",
  "AGENT",
  "175,530.04",
  "21,939.77",
  "0.00",
  "21,939.77",
  "0.00",
  "20,031.45",
  "-1,908.32",
];
const FOOTER_MONEY = [
  "40,943.93",
  "40,943.93",
  "0.00",
  "40,943.93",
  "0.00",
  "35,285.96",
  "-4,657.97",
];

function buildKendoGroupFooterHtml() {
  const agentTr = (cells, alt = false) => {
    const cls = alt ? ' class="k-alt"' : "";
    const dataTds = cells
      .map((v) => `<td role="gridcell">${v === "" ? "&nbsp;" : v}</td>`)
      .join("");
    return `<tr role="row"${cls}><td class="k-group-cell">&nbsp;</td>${dataTds}</tr>`;
  };
  // Footer: indent + empty Account/Count/Level + money from Turn Over
  const footerCells = ["", "", "", "", ...FOOTER_MONEY];
  const footerTds = footerCells
    .map((v, i) => {
      const cls = i === 0 ? ' class="k-group-cell"' : "";
      return `<td${cls}>${v === "" ? "&nbsp;" : v}</td>`;
    })
    .join("");
  return `<table role="grid"><tbody>
  ${agentTr(AGENT1)}
  ${agentTr(AGENT2, true)}
  <tr class="k-group-footer">${footerTds}</tr>
</tbody></table>`;
}

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  throw new Error(msg);
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

async function main() {
  console.log("C8 Kendo normalize smoke (com PHP datacapture)");

  const normalizeJs = fs.readFileSync(
    path.join(root, "js/datacapture-clipboard-normalize.js"),
    "utf8",
  );

  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url?.startsWith("/?")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<!DOCTYPE html><html><body></body></html>");
      return;
    }
    if (req.url === "/normalize.js") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(normalizeJs);
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(origin);
    await page.addScriptTag({ url: `${origin}/normalize.js` });

    const html = buildKendoGroupFooterHtml();
    const result = await page.evaluate((fixtureHtml) => {
      const api = window.DataCaptureClipboardNormalize;
      const out = api.normalizeClipboardHtmlToTable(fixtureHtml);
      const root = document.createElement("div");
      root.innerHTML = out;
      const table = root.querySelector("table");
      if (!table) return { rows: 0, cols: 0, sample: [], footerFirstFilled: -1 };
      const trs = Array.from(table.querySelectorAll("tr"));
      const matrix = trs.map((tr) =>
        Array.from(tr.querySelectorAll("td, th")).map((td) =>
          String(td.textContent || "")
            .replace(/\u00a0/g, " ")
            .trim(),
        ),
      );
      const footer = matrix[matrix.length - 1] || [];
      let footerFirstFilled = -1;
      for (let i = 0; i < footer.length; i += 1) {
        if (footer[i]) {
          footerFirstFilled = i;
          break;
        }
      }
      return {
        rows: matrix.length,
        cols: Math.max(...matrix.map((r) => r.length), 0),
        sample: matrix.map((r) => r.slice(0, 5)),
        footerFirstFilled,
        footerMoney: footer[footerFirstFilled] || "",
      };
    }, html);

    console.log("  · result", JSON.stringify(result));

    if (result.rows !== 3) fail(`expected 3 rows (2 agents + footer), got ${result.rows}`);
    ok("Kendo normalize keeps 3 rows");

    if (result.cols < 8) fail(`expected wide cols, got ${result.cols}`);
    ok(`wide matrix (${result.cols} cols)`);

    // After stripping k-group-cell: id, count, level empty → money at col >= 3
    if (result.footerFirstFilled < 3) {
      fail(
        `footer money must not sit in col0-2 (got col ${result.footerFirstFilled}): ${JSON.stringify(result.sample[2])}`,
      );
    }
    ok(`footer money aligned at col ${result.footerFirstFilled}`);

    if (!/40,943\.93/.test(result.footerMoney)) {
      fail(`footer money missing: ${result.footerMoney}`);
    }
    ok("footer Turn Over value present");

    console.log("\nSMOKE GREEN");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
