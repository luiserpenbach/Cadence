import { chromium } from "playwright-core";
import fs from "node:fs";
import assert from "node:assert/strict";

const out = "/tmp/cadence-verify";
fs.mkdirSync(out, { recursive: true });
const errors = [];

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});

async function go(path) {
  const res = await page.goto(`http://localhost:3000${path}`, {
    waitUntil: "networkidle",
  });
  assert.equal(res?.status(), 200, `${path} status`);
  return res;
}

async function shot(name) {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}

async function selectByText(selector, needle) {
  const value = await page.locator(`${selector} option`).evaluateAll((opts, n) => {
    const match = opts.find((o) => (o.textContent || "").includes(n));
    return match ? match.value : "";
  }, needle);
  assert.ok(value, `option containing ${needle}`);
  await page.locator(selector).selectOption(value);
}

// 1. Inventory
await go("/inventory");
assert.match(await page.locator("h1").innerText(), /Inventory/);
const inv0 = await page.locator("main").innerText();
assert.match(inv0, /LOT-V50B/);
assert.match(inv0, /LOT-MNF/);
await shot("01-inventory");

const lotCode = `LOT-VFY-${Date.now().toString(36).toUpperCase()}`;
const createForm = page.getByTestId("create-lot-form");
await createForm.locator('input[placeholder="Filter parts…"]').fill("ORF-085");
await page.waitForTimeout(200);
await createForm.locator('input[name="lotCode"]').fill(lotCode);
await createForm.locator('input[name="qty"]').fill("7");
await createForm.getByRole("button", { name: "Create lot" }).click();
await page.getByRole("link", { name: lotCode }).first().waitFor({ timeout: 15000 });
await shot("02-inventory-created");

// 2. Procurement receive
await go("/procurement");
assert.match(await page.locator("main").innerText(), /PO-2026-0142/);
const procMain = await page.locator("main").innerText();
if (/ordered/i.test(procMain) && !/received/i.test(procMain)) {
  await page.getByRole("button", { name: "Receive into stock" }).click();
}
await page.getByText("received", { exact: true }).waitFor({ timeout: 15000 });
await shot("03-procurement-received");

await go("/inventory");
assert.match(await page.locator("main").innerText(), /PO-2026-0142-VLV-CRYO-050@B/);

// 3. Change impact
await go("/change");
const changeText = await page.locator("main").innerText();
assert.match(changeText, /TP-014/);
assert.match(changeText, /2 kit/);
assert.match(changeText, /Avail/);
await shot("04-change");

// 4. Floor
await go("/floor");
const floorText = await page.locator("main").innerText();
assert.match(floorText, /Avail/);
assert.match(floorText, /Stand recipe/);
await shot("05-floor");

await selectByText('select[name="article"]', "TP-017");
await page.getByRole("button", { name: "Show recipe" }).click();
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Kit this recipe" }).click();
await page.waitForURL(/\/kits\//, { timeout: 15000 });
await page.waitForLoadState("networkidle");
await shot("06-kit-open");

await page.getByRole("button", { name: "Allocate remaining" }).click();
await page.getByRole("button", { name: "Unallocate" }).first().waitFor({ timeout: 15000 });
await shot("07-kit-allocated");

await page.getByRole("button", { name: /Issue kit/ }).click();
await page.locator("main").getByText("issued", { exact: true }).waitFor({ timeout: 15000 });
await shot("08-kit-issued");

// 5. Article as-built without run (TP-014)
await go("/articles");
await Promise.all([
  page.waitForURL(/\/articles\/.+/),
  page.getByRole("link", { name: "TP-014", exact: true }).click(),
]);
await page.waitForLoadState("networkidle");
const art = await page.locator("main").innerText();
assert.match(art, /As-designed vs as-built|matches/);
assert.doesNotMatch(art, /Bind a run to compare/);
await shot("09-article-014");

// 6. Catalog search
await go("/catalog?q=valve");
assert.match(await page.locator("main").innerText(), /VLV-CRYO-050/);
await shot("10-catalog-search");

// 7. Draft BoM editor via cut
await go("/configs");
const cutForm = page.locator("form").filter({ hasText: "Based on" });
await cutForm.locator('input[name="key"]').fill("CH4-FEED-VERIFY");
await cutForm.locator('input[name="name"]').fill("Verify draft");
await Promise.all([
  page.waitForURL(/\/configs\//),
  cutForm.getByRole("button", { name: "Create draft" }).click(),
]);
await page.waitForLoadState("networkidle");
assert.match(await page.locator("main").innerText(), /Export CSV/);
assert.match(await page.locator("main").innerText(), /Import CSV/);
assert.match(await page.locator("main").innerText(), /Allow alternate/);
await shot("11-draft-bom");

const csvRes = await page.request.get(page.url().replace(/\/$/, "") + "/bom.csv");
assert.equal(csvRes.status(), 200);
assert.match(await csvRes.text(), /find,part,rev,qty/);

await browser.close();

if (errors.length) {
  console.error("JS errors", errors);
  process.exit(1);
}
console.log("ok", fs.readdirSync(out));
