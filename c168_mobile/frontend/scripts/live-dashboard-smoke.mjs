/**
 * Live mobile dashboard smoke (Playwright).
 *
 * Usage:
 *   set MOBILE_COMPANY=... MOBILE_USER=... MOBILE_PASS=...
 *   node scripts/live-dashboard-smoke.mjs
 *
 * Optional:
 *   MOBILE_BASE=https://count168.site/c168_mobile
 *   MOBILE_STORAGE=.auth/mobile-storage.json
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPlaywright() {
  const candidates = [
    path.resolve(__dirname, "../node_modules/playwright"),
    path.resolve(__dirname, "../../../frontend/node_modules/playwright"),
    path.resolve(__dirname, "../../../node_modules/playwright"),
  ];
  for (const dir of candidates) {
    try {
      return require(dir);
    } catch {
      /* next */
    }
  }
  throw new Error("playwright not found — npm i -D playwright in c168_mobile/frontend or use main frontend install");
}

const { chromium, devices } = loadPlaywright();
const BASE = process.env.MOBILE_BASE || "https://count168.site/c168_mobile";
const STORAGE = process.env.MOBILE_STORAGE
  ? path.resolve(process.env.MOBILE_STORAGE)
  : path.resolve(__dirname, "../.auth/mobile-storage.json");

const company = process.env.MOBILE_COMPANY || "";
const user = process.env.MOBILE_USER || "";
const pass = process.env.MOBILE_PASS || "";

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  console.error(`  ✗ ${msg}`);
  throw new Error(msg);
}

async function ensureLoggedIn(page, context) {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (!page.url().includes("/login")) {
    ok("session reused");
    return;
  }
  if (!company || !user || !pass) {
    fail("Not logged in. Set MOBILE_COMPANY / MOBILE_USER / MOBILE_PASS or provide storage state.");
  }
  ok("logging in…");
  await page.getByRole("button", { name: "Admin" }).click();
  await page.getByPlaceholder(/Company|Group/i).fill(company);
  await page.getByPlaceholder(/Username|User/i).fill(user);
  await page.getByPlaceholder(/Password/i).fill(pass);
  await page.getByRole("button", { name: /^Login$|^登录$/ }).click();
  await page.waitForURL(/\/(dashboard|owner-secondary|user-secondary)/, { timeout: 45000 });
  if (page.url().includes("secondary")) {
    fail("Secondary password required — complete once and save storage state.");
  }
  fs.mkdirSync(path.dirname(STORAGE), { recursive: true });
  await context.storageState({ path: STORAGE });
  ok(`storage saved → ${STORAGE}`);
}

async function main() {
  console.log("Live mobile dashboard smoke");
  console.log(`  base: ${BASE}`);

  const launchOpts = { headless: true };
  const contextOpts = {
    ...devices["iPhone 14"],
    locale: "en-US",
  };
  if (fs.existsSync(STORAGE)) {
    contextOpts.storageState = STORAGE;
    ok(`using storage ${STORAGE}`);
  }

  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();

  const apiHits = [];
  page.on("response", (res) => {
    const u = res.url();
    if (u.includes("/api/")) {
      apiHits.push({ status: res.status(), path: u.replace(/^https?:\/\/[^/]+/, "").split("?")[0] });
    }
  });

  try {
    await ensureLoggedIn(page, context);
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 90000 });

    // Wait for hero or error
    await page.waitForTimeout(2500);

    const title = page.getByRole("heading", { name: /Dashboard|仪表盘/i });
    if (!(await title.count())) fail("Dashboard title missing");
    ok("Dashboard title visible");

    const filter = page.getByRole("button", { name: /Filter|筛选/i }).first();
    if (!(await filter.count())) fail("Filter button missing");
    ok("Filter control present");

    const hero = page.locator("section").filter({ hasText: /NET PROFIT|净利|Net Profit/i }).first();
    if (!(await hero.count())) fail("Hero net profit card missing");
    ok("Hero card present");

    const bootstrap = apiHits.find((h) => h.path.includes("dashboard_bootstrap_api.php"));
    if (!bootstrap) fail("dashboard_bootstrap_api never called");
    if (bootstrap.status >= 400) fail(`bootstrap HTTP ${bootstrap.status}`);
    ok(`bootstrap HTTP ${bootstrap.status}`);

    const currenciesHit = apiHits.find((h) => h.path.includes("get_company_currencies_api.php"));
    if (currenciesHit && currenciesHit.status >= 400) {
      fail(`currencies API HTTP ${currenciesHit.status}`);
    }
    if (currenciesHit) ok(`currencies API HTTP ${currenciesHit.status}`);

    // Filter sheet open/close
    await filter.click();
    await page.waitForTimeout(400);
    const dialog = page.getByRole("dialog");
    if (!(await dialog.isVisible().catch(() => false))) fail("Filter sheet did not open");
    ok("Filter sheet opens");
    await page.getByRole("button", { name: /This Year|今年/i }).click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: /Apply|应用|Close/i }).first().click().catch(async () => {
      await page.locator('[aria-label="Close filter"], [aria-label="Close"]').first().click();
    });
    await page.waitForTimeout(1500);

    const bootstrapAfter = apiHits.filter((h) => h.path.includes("dashboard_bootstrap_api.php"));
    if (bootstrapAfter.length < 2) {
      console.warn("  ! expected second bootstrap after preset change (may be cached)");
    } else {
      ok(`bootstrap refetch x${bootstrapAfter.length}`);
    }

    const failed = apiHits.filter((h) => h.status >= 500);
    if (failed.length) fail(`API 5xx: ${failed.map((f) => f.path).join(", ")}`);
    ok("no API 5xx");

    console.log("\nAll Playwright paste cases green — dashboard smoke PASS");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("\nSMOKE FAILED:", err.message || err);
  process.exit(1);
});
