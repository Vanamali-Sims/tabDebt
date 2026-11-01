// End-to-end check of the page checks in real Chromium: video progress and unsent text.
// Build with TABDEBT_E2E=1 (grants site access, since a test can't click the permission prompt), serve
// the pages in scripts/pages on baseUrl, then: node scripts/e2e-pages.cjs [baseUrl]
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg); console.log('ok  -', msg); };

(async () => {
  const base = process.argv[2] || 'http://localhost:8765';
  const ext = path.resolve(__dirname, '../.output/chrome-mv3');
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'tabdebt-pages-')), {
    headless: false,
    executablePath: process.env.CHROME || undefined,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--headless=new', '--autoplay-policy=no-user-gesture-required'],
  });
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];

  const open = async (p) => { const pg = await ctx.newPage(); await pg.goto(`${base}/${p}`); await pg.waitForTimeout(500); return pg; };
  await open('video.html');
  await new Promise((r) => setTimeout(r, 3000)); // let it play to halfway
  const draft = await open('post.html');
  await draft.fill('#post', 'Excited to share tabDebt, a side project I built');
  const chat = await open('chat.html');
  await chat.click('#composer');
  await chat.keyboard.type('Hey, quick question about');
  await open('search.html');
  await open('doc.html');

  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
  await panel.waitForSelector('text=Review tabs');
  // Rules only, with both page checks on.
  await panel.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings || {}), mode: 'builtin', checkVideo: true, checkTyping: true } });
  });
  await panel.reload();
  await panel.click('text=Review tabs');
  await panel.waitForSelector('.counters');

  const row = (title) => panel.locator('li', { hasText: title }).first();
  const actionOf = async (title) => row(title).getAttribute('data-action');
  const textOf = async (title) => row(title).innerText();

  assert(await actionOf('Draft a post') === 'keep', 'a text box with a draft keeps its tab');
  assert((await textOf('Draft a post')).includes('You were typing here'), 'and says why');
  assert(await actionOf('Chat composer') === 'keep', 'a chat composer with text keeps its tab');
  assert(await actionOf('How caching works') === 'read', 'a half-watched video is saved, not closed');
  assert(/Stopped at 0:1[5-6] of 0:30/.test(await textOf('How caching works')), 'with where you stopped');
  assert(!/typing/.test(await textOf('Results for caching')), 'a filled search box does not count as typing');
  assert(!/typing/.test(await textOf('Team handbook')), 'a whole editable document does not count as typing');

  // Apply: the video lands in Saved, the drafts stay open.
  const pages = () => ctx.pages().filter((p) => p.url().startsWith(base)).map((p) => p.url().split('/').pop());
  await panel.click('.review-foot .pill');
  await panel.waitForSelector('.toast');
  await panel.waitForTimeout(500);
  assert(pages().includes('post.html') && pages().includes('chat.html'), 'both drafts are still open');
  assert(!pages().includes('video.html'), 'the video tab was closed after saving');
  await panel.click('nav >> text=Saved');
  await panel.click('[role=tab]:has-text("Read")');
  assert(await panel.locator('.item-row', { hasText: 'How caching works' }).count() === 1, 'the video is in Saved, Read');

  console.log('E2E PAGES OK');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
