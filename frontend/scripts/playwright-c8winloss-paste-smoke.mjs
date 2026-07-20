/**
 * Repro smoke: C8Play Win Loss Detail (3 rows: 2 agents + Subtotal)
 * paste into Data Capture 1.TEXT / 2.FORMAT.
 *
 * Source site (agbc.i8win.com) requires login — fixtures mimic Material clipboard.
 *
 * Usage:
 *   node scripts/playwright-c8winloss-paste-smoke.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  dropTrailingJunkRows,
  sanitizePasteMatrix,
} from "../src/pages/datacapture/paste/core/dataCapturePasteMatrixSanitize.js";
import { parsePlainTextMatrix } from "../src/pages/datacapture/paste/core/dataCaptureTextPaste.js";
import { detectVerticalFieldDump } from "../src/pages/datacapture/paste/core/dataCaptureVerticalDumpDetect.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");

function loadPlaywright() {
  const candidates = [
    path.resolve(__dirname, "../node_modules/playwright"),
    path.resolve(__dirname, "../../node_modules/playwright"),
  ];
  for (const dir of candidates) {
    try {
      return require(dir);
    } catch {
      /* next */
    }
  }
  throw new Error("playwright not found — run npm i -D playwright in frontend/");
}

const { chromium } = loadPlaywright();

/** Values from user screenshot (Turn Over / Downline totals). */
const AGENT1 = [
  "CK203",
  "87",
  "AGENT",
  "85,423.66",
  "19,004.16",
  "0.00",
  "19,004.16",
  "0.00",
  "16,254.51",
  "-2,749.65",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "19,004.16",
  "0.00",
  "16,254.51",
  "-2,749.65",
];
const AGENT2 = [
  "CXZ15",
  "8",
  "AGENT",
  "175,530.04",
  "40,500.00",
  "0.00",
  "40,500.00",
  "0.00",
  "34,200.00",
  "-6,300.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "40,500.00",
  "0.00",
  "34,200.00",
  "-6,300.00",
];
const SUBTOTAL = [
  "",
  "",
  "Subtotal",
  "260,953.70",
  "59,504.16",
  "0.00",
  "59,504.16",
  "0.00",
  "50,454.51",
  "-9,049.65",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "59,504.16",
  "0.00",
  "50,454.51",
  "-9,049.65",
];

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  throw new Error(msg);
}

function assertRowCount(label, matrix, expected) {
  const n = matrix?.length ?? 0;
  if (n !== expected) {
    fail(`${label}: expected ${expected} rows, got ${n}\n${JSON.stringify(matrix?.map((r) => r.slice(0, 4)), null, 2)}`);
  }
  ok(`${label}: ${n} rows`);
}

function buildTsv() {
  return [AGENT1, AGENT2, SUBTOTAL].map((row) => row.join("\t")).join("\n");
}

function buildVerticalDump() {
  return [AGENT1, AGENT2, SUBTOTAL].flat().filter((c) => c !== "").join("\n");
}

/** Angular Material-style clipboard (Chrome often rewrites tags → div.mat-*). */
function buildMatRowHtml() {
  const rowHtml = (cells, { footer = false } = {}) => {
    const rowClass = footer ? "mat-mdc-footer-row mat-footer-row" : "mat-mdc-row mat-row";
    const cellClass = footer ? "mat-mdc-footer-cell mat-footer-cell" : "mat-mdc-cell mat-cell";
    const inner = cells
      .map((v) => `<div class="${cellClass}" role="gridcell">${v === "" ? "&nbsp;" : v}</div>`)
      .join("");
    return `<div class="${rowClass}" role="row">${inner}</div>`;
  };
  return `<div class="mat-mdc-table mat-table" role="table">
  ${rowHtml(AGENT1)}
  ${rowHtml(AGENT2)}
  ${rowHtml(SUBTOTAL, { footer: true })}
</div>`;
}

/** Collapsed clipboard: each logical row is one cell with newline-separated fields. */
function buildCollapsedMatHtml() {
  const pack = (cells) =>
    cells
      .filter((c) => c !== "")
      .join("\n");
  return `<div class="mat-table">
  <div class="mat-row" role="row"><div class="mat-cell">${pack(AGENT1)}</div></div>
  <div class="mat-row" role="row"><div class="mat-cell">${pack(AGENT2)}</div></div>
  <div class="mat-footer-row" role="row"><div class="mat-footer-cell">${pack(SUBTOTAL)}</div></div>
</div>`;
}

/** N×1 failure mode: one <tr><td> per field (fig3 symptom). */
function buildVerticalNx1TableHtml() {
  const fields = [...AGENT1, ...AGENT2, ...SUBTOTAL.filter(Boolean)];
  const rows = fields.map((f) => `<tr><td>${f}</td></tr>`).join("");
  return `<table><tbody>${rows}</tbody></table>`;
}

async function runNodePureChecks() {
  console.log("\n[1] Node pure parsers (sanitize / plain / vertical dump)");

  const tsvMatrix = parsePlainTextMatrix(buildTsv());
  assertRowCount("TSV parsePlainTextMatrix", tsvMatrix, 3);
  if (!/subtotal/i.test(String(tsvMatrix[2]?.[2] ?? tsvMatrix[2]?.[0] ?? ""))) {
    fail(`TSV row2 label missing Subtotal: ${JSON.stringify(tsvMatrix[2]?.slice(0, 4))}`);
  }
  ok("TSV keeps Subtotal label");

  const sanitizedTsv = sanitizePasteMatrix(tsvMatrix);
  assertRowCount("TSV after sanitizePasteMatrix", sanitizedTsv, 3);

  const narrowSubtotal = sanitizePasteMatrix([
    AGENT1,
    AGENT2,
    ["Subtotal", "260,953.70", "59,504.16", "0.00", "59,504.16"],
  ]);
  assertRowCount("narrow Subtotal kept by sanitize", narrowTsvOr(narrowSubtotal), 3);

  const moneyFirstSubtotal = dropTrailingJunkRows([
    AGENT1,
    AGENT2,
    ["260,953.70", "59,504.16", "0.00", "59,504.16", "0.00", "50,454.51", "-9,049.65"],
  ]);
  // May or may not keep — log for diagnosis
  console.log(
    `  · money-first footer rows after dropTrailingJunkRows: ${moneyFirstSubtotal.length}`,
  );

  const vertical = buildVerticalDump();
  const lines = vertical.split("\n");
  const dump = detectVerticalFieldDump(lines);
  console.log(
    `  · detectVerticalFieldDump → ${dump?.rows?.length ?? 0} rows x ${dump?.rows?.[0]?.length ?? 0} cols`,
  );
  const verticalMatrix = parsePlainTextMatrix(vertical);
  console.log(
    `  · parsePlainTextMatrix(vertical) → ${verticalMatrix.length} rows x ${verticalMatrix[0]?.length ?? 0} cols`,
  );
  if (verticalMatrix.length < 3 || (verticalMatrix[0]?.length ?? 0) < 2) {
    fail(
      `vertical dump reshape failed (fig3 root): ${verticalMatrix.length}x${verticalMatrix[0]?.length ?? 0}`,
    );
  }
  assertRowCount("vertical dump reshape", verticalMatrix, 3);
}

function narrowTsvOr(m) {
  return m;
}

async function runPlaywrightHtmlChecks() {
  console.log("\n[2] Playwright DOM: normalizeClipboardHtmlToTable");

  const { formatBodyMatrixLooksCollapsed } = await import(
    pathToFileURL(
      path.join(frontendRoot, "src/pages/datacapture/paste/core/dataCaptureFormatHtmlPaste.js"),
    ).href
  );

  const fs = await import("node:fs/promises");
  const http = await import("node:http");
  const coreDir = path.join(frontendRoot, "src/pages/datacapture/paste/core");

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === "/" || req.url?.startsWith("/?")) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<!DOCTYPE html><html><body></body></html>");
        return;
      }
      if (req.url?.startsWith("/paste-mod/")) {
        const base = path.basename(decodeURIComponent(req.url.slice("/paste-mod/".length)));
        let body = await fs.readFile(path.join(coreDir, base), "utf8");
        body = body.replace(
          /from\s+["'](\.\/[^"']+)["']/g,
          (_m, spec) => `from "/paste-mod/${path.basename(spec)}"`,
        );
        // Bridge imports that leave paste/core (../../lib, ../vendors, etc.)
        body = body.replace(
          /from\s+["']((?:\.\.\/)+[^"']+)["']/g,
          (_m, spec) => {
            const resolved = path.resolve(coreDir, spec);
            const rel = path.relative(frontendRoot, resolved).replace(/\\/g, "/");
            return `from "/src/${rel}"`;
          },
        );
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(body);
        return;
      }
      if (req.url?.startsWith("/src/")) {
        const rel = decodeURIComponent(req.url.slice("/src/".length));
        const filePath = path.join(frontendRoot, rel);
        let body = await fs.readFile(filePath, "utf8");
        const dir = path.dirname(filePath);
        body = body.replace(/from\s+["'](\.[^"']+)["']/g, (_m, spec) => {
          const resolved = path.resolve(dir, spec);
          const out = path.relative(frontendRoot, resolved).replace(/\\/g, "/");
          return `from "/src/${out}"`;
        });
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(body);
        return;
      }
      res.writeHead(404);
      res.end("not found");
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(origin);

    const cases = [
      { name: "mat-row + footer-row", html: buildMatRowHtml(), expectRows: 3, expectColsMin: 10 },
      { name: "collapsed mat-row", html: buildCollapsedMatHtml(), expectRows: 3, expectColsMin: 10 },
      { name: "vertical N×1 table", html: buildVerticalNx1TableHtml(), expectRows: null, expectColsMin: 1 },
    ];

    for (const c of cases) {
      const result = await page.evaluate(async (html) => {
        const normalizeMod = await import("/paste-mod/dataCaptureFormatClipboardNormalize.js");
        const matrixMod = await import("/paste-mod/dataCaptureFormatHtmlMatrix.js");
        const normalized = normalizeMod.normalizeClipboardHtmlToTable(html);
        const structure = matrixMod.parseFormatHtmlTableStructure(normalized || html);
        if (!structure) {
          return { rows: 0, cols: 0, sample: [], labels: [] };
        }
        const body = matrixMod.buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
        return {
          rows: body.length,
          cols: structure.maxCols,
          sample: body.slice(0, 3).map((row) =>
            (row || []).slice(0, 4).map((cell) => String(cell?.value ?? "")),
          ),
          labels: body.map((row) => {
            const vals = (row || []).map((cell) => String(cell?.value ?? "").trim()).filter(Boolean);
            return vals[0] || "";
          }),
        };
      }, c.html);

      console.log(
        `  · ${c.name}: ${result.rows} rows x ${result.cols} cols labels=${JSON.stringify(result.labels)} sample=${JSON.stringify(result.sample)}`,
      );

      if (c.expectRows != null) {
        if (result.rows !== c.expectRows) {
          fail(`${c.name}: expected ${c.expectRows} body rows, got ${result.rows}`);
        }
        if (result.cols < c.expectColsMin) {
          fail(`${c.name}: expected >=${c.expectColsMin} cols, got ${result.cols}`);
        }
        const hasSub = result.labels.some((l) => /subtotal/i.test(l));
        if (!hasSub) fail(`${c.name}: Subtotal row missing from body labels`);
        ok(`${c.name}: ${result.rows}x${result.cols} (Subtotal kept)`);
      } else {
        const looksNx1 = result.cols <= 1 && result.rows >= 3;
        console.log(`  · vertical N×1 shape (cols<=1, rows>=3): ${looksNx1}`);
        if (!looksNx1) {
          fail("vertical N×1 HTML not detected — Format may accept bad matrix (fig3)");
        }
        ok("vertical N×1 flagged");
      }
    }

    const fig3Matrix = [
      [{ value: "CK203" }],
      [{ value: "87" }, { value: "AGENT" }],
      ...AGENT1.slice(3).map((v) => [{ value: v }]),
    ];
    const collapsed = formatBodyMatrixLooksCollapsed(fig3Matrix, null);
    console.log(`  · fig3-like matrix formatBodyMatrixLooksCollapsed: ${collapsed}`);
    if (!collapsed) {
      fail("fig3-like near-vertical matrix not rejected by formatBodyMatrixLooksCollapsed");
    }
    ok("fig3-like matrix rejected as collapsed");

    // Full-width Subtotal (realistic) must survive sanitize — baseline.
    const fullSanitized = sanitizePasteMatrix([AGENT1, AGENT2, SUBTOTAL]);
    assertRowCount("full-width Subtotal sanitize", fullSanitized, 3);
  } finally {
    await browser.close();
    server.close();
  }
}

async function main() {
  console.log("C8 WinLoss Detail → Data Capture paste smoke");
  console.log("(source site login-walled; using Material clipboard fixtures)");

  let failed = false;
  try {
    await runNodePureChecks();
  } catch (err) {
    failed = true;
    console.error(err.message || err);
  }

  try {
    await runPlaywrightHtmlChecks();
  } catch (err) {
    failed = true;
    console.error(err.message || err);
  }

  if (failed) {
    console.error("\nSMOKE RED — paste bug reproduced / regression gap found");
    process.exit(1);
  }
  console.log("\nSMOKE GREEN — fixtures pass current parsers");
  process.exit(0);
}

main();
