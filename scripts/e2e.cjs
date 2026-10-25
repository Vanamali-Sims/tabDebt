// End-to-end check of the whole flow in real Chromium, in built-in mode (no AI key needed):
// open duplicate and error tabs, run the review from the side panel, apply it, then undo it.
// Usage: serve a.html b.html c.html on baseUrl, build the extension, then: node scripts/e2e.cjs [baseUrl]
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg); console.log('ok  -', msg); };

(async () => {
  const base = process.argv[2] || 'http://localhost:8765';
  const ext = path.resolve(__dirname, '../.output/chrome-mv3');
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'tabdebt-e2e-')), {
    headless: false,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--headless=new'],
  });
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];

  const open = async (url) => { const p = await ctx.newPage(); await p.goto(url); await p.waitForTimeout(400); return p; };
  await open(`${base}/a.html`);
  await open(`${base}/b.html`);
  await open(`${base}/a.html`); // duplicate
  await open(`${base}/nope-404.html`); // error page
  await open(`${base}/c.html`);

  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
  await panel.waitForSelector('text=Review my tabs');
  const webTabs = () => ctx.pages().filter((p) => p.url().startsWith(base)).length;
  assert(webTabs() === 5, 'five web tabs are open');

  await panel.click('text=Review my tabs');
  await panel.waitForSelector('text=End of day');
  const doneRows = await panel.locator('.group-done .plan-row').count();
  assert(doneRows === 2, `plan proposes closing 2 tabs as done (got ${doneRows})`);
  await panel.screenshot({ path: path.resolve(__dirname, '../context/e2e-review.png') }).catch(() => {});

  await panel.click('text=Apply plan');
  await panel.waitForSelector('text=All clear');
  await panel.waitForTimeout(500);
  assert(webTabs() === 3, `two tabs were closed (now ${webTabs()})`);

  await panel.click('button:has-text("Undo")');
  await panel.waitForSelector('text=Put everything back');
  await panel.waitForTimeout(800);
  assert(webTabs() === 5, `undo reopened them (now ${webTabs()})`);

  await panel.click('button:has-text("Done")');
  await panel.click('nav >> text=Settings');
  await panel.waitForSelector('text=How should it think?');
  assert(await panel.locator('.chip-tag', { hasText: 'bank' }).count() === 1, 'settings list the never-look sites');

  console.log('E2E OK');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
