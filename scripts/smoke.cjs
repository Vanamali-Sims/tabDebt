// Loads the built extension in Chromium and checks the tracker records real tabs.
// Usage: node scripts/smoke.cjs [baseUrl]   (serve pages a.html, b.html, c.html at baseUrl)
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8765';
  const ext = path.resolve(__dirname, '../.output/chrome-mv3');
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabdebt-'));
  const ctx = await chromium.launchPersistentContext(userDir, {
    headless: false,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--headless=new'],
  });
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  console.log('extension id', extId);

  const a = await ctx.newPage(); await a.goto(`${base}/a.html`);
  await a.waitForTimeout(1500);
  const b = await ctx.newPage(); await b.goto(`${base}/b.html`);
  await b.waitForTimeout(1500);
  await a.bringToFront(); await a.waitForTimeout(1500);

  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
  const rows = await panel.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('tab-debt'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    return await new Promise((res) => { const r = db.transaction('tabs').objectStore('tabs').getAll(); r.onsuccess = () => res(r.result); });
  });
  console.table(rows.map((r) => ({ title: r.title, ms: r.activeMs, visits: r.visits, open: r.closedAt === undefined })));
  const ok = rows.some((r) => r.title === 'Page a' && r.visits >= 1) && rows.some((r) => r.title === 'Page b');
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED');
  await ctx.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
