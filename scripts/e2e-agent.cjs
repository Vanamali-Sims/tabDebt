// End-to-end check of the agent path with a fake OpenAI-compatible server standing in for a provider.
// Verifies real HTTP, tool-calling, bring-your-own-endpoint settings, and the review UI together.
// Usage: serve a.html b.html c.html on baseUrl, build the extension, then: node scripts/e2e-agent.cjs [baseUrl]
const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg); console.log('ok  -', msg); };

function startFakeProvider() {
  const seen = [];
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const json = JSON.parse(body || '{}');
      seen.push({ url: req.url, auth: req.headers.authorization, json });
      const text = JSON.stringify(json.messages);
      const refs = [...text.matchAll(/\\n(t\d+) \| \\"([^"\\]*)\\"/g)].map((m) => ({ ref: m[1], title: m[2] }));
      const decisions = refs.map(({ ref, title }) =>
        /page b/i.test(title)
          ? { ref, action: 'task', reason: 'Looks like something to do', confidence: 0.9, task: { title: 'Do the thing from page B', due: 'Friday' } }
          : { ref, action: 'read', reason: 'Save to read later', confidence: 0.85, summary: 'A page to read' });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        id: 'chatcmpl-fake', object: 'chat.completion', created: 1, model: json.model,
        choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: null,
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'submit_plan', arguments: JSON.stringify({ decisions }) } }] } }],
        usage: { prompt_tokens: 321, completion_tokens: 45, total_tokens: 366 },
      }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, port: server.address().port })));
}

(async () => {
  const base = process.argv[2] || 'http://localhost:8765';
  const { server, seen, port } = await startFakeProvider();
  const ext = path.resolve(__dirname, '../.output/chrome-mv3');
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'tabdebt-agent-')), {
    headless: false,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--headless=new'],
  });
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];

  const open = async (url) => { const p = await ctx.newPage(); await p.goto(url); await p.waitForTimeout(400); };
  await open(`${base}/a.html`);
  await open(`${base}/b.html`);
  await open(`${base}/c.html`);

  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
  await panel.waitForSelector('text=Review tabs');

  // Point the extension at the fake provider through the Settings screen, as a user would.
  await panel.click('nav >> text=Settings');
  await panel.click('text=Local model');
  await panel.fill('input[type=url]', `http://127.0.0.1:${port}/v1`);
  await panel.fill('input[placeholder="llama3.2"]', 'fake-model');
  await panel.waitForTimeout(300);

  await panel.click('nav >> text=Tabs');
  await panel.click('text=Review tabs');
  await panel.waitForSelector('text=End of day', { timeout: 15000 });

  assert(seen.length === 1 && seen[0].url === '/v1/chat/completions', 'one request reached the provider');
  const sent = JSON.stringify(seen[0].json);
  assert(sent.includes('submit_plan') && sent.includes('read_page') && sent.includes('find_related'), 'request offered the three tools');
  assert(sent.includes('Page a') && sent.includes('Page b') && sent.includes('Page c'), 'request listed the tabs');
  assert(!sent.includes('chrome-extension'), 'request never mentions extension pages');

  assert(await panel.locator('.group-task .plan-row', { hasText: 'Do the thing from page B' }).count() === 1, 'agent task shows in the Tasks group');
  assert(await panel.locator('.group-read .plan-row').count() === 2, 'agent read-later tabs show in To read');
  assert(await panel.locator('text=/Used 366 tokens/').count() === 1, 'token usage is shown');

  await panel.screenshot({ path: path.resolve(__dirname, '../context/e2e-agent-review.png') }).catch(() => {});
  await panel.click('text=Apply plan');
  await panel.waitForSelector('text=All clear');
  await panel.click('button:has-text("Done")');
  await panel.click('nav >> text=Saved');
  await panel.waitForSelector('text=Do the thing from page B');
  assert(await panel.locator('text=Do the thing from page B').count() >= 1, 'the task landed in Saved');

  console.log('E2E AGENT OK');
  await ctx.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
