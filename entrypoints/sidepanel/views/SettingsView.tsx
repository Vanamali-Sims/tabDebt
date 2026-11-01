import { generateText } from 'ai';
import { useMemo, useState } from 'react';
import { Autocomplete } from '../Autocomplete';
import { Switch } from '../Switch';
import { ConfigError, createModel, endpointOf, originPattern } from '@/src/lib/agent/models';
import { notifyChanged } from '@/src/lib/channel';
import { friendlyError } from '@/src/lib/review';
import { DEFAULT_MODELS, type Provider, type Settings } from '@/src/lib/settings';
import { repos } from '@/src/lib/services';
import { hostOf } from '@/src/lib/format';
import { buildVocabulary } from '@/src/lib/suggest';
import { useOpenTabs } from '@/src/lib/useTabs';
import { useLive, useSettings } from '@/src/lib/useAsync';

const MODES: { id: Settings['mode']; name: string; hint: string; badge: string; free: boolean }[] = [
  { id: 'key', name: 'Your API key', hint: 'Claude, ChatGPT, Gemini or any provider', badge: '~$1/mo', free: false },
  { id: 'local', name: 'Local model', hint: 'Ollama or LM Studio on this computer', badge: 'Private', free: true },
  { id: 'builtin', name: 'Rules only', hint: 'No AI. Obvious tabs only, the rest stay open', badge: 'Free', free: true },
];

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'openrouter', label: 'OpenRouter (one key, many models)' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'google', label: 'Google Gemini' },
  { id: 'custom', label: 'Custom endpoint' },
];

export function SettingsView() {
  const { settings: s, update } = useSettings();
  const memory = useLive(() => repos.memory.list());
  const openTabs = useOpenTabs();
  const closedTabs = useLive(() => repos.tabs.listClosed());
  const siteVocabulary = useMemo(() => buildVocabulary([...(openTabs ?? []), ...(closedTabs ?? [])].map((t) => hostOf(t.url))), [openTabs, closedTabs]);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error' | 'busy'; text: string } | null>(null);
  const [newSite, setNewSite] = useState('');

  const test = async () => {
    setStatus({ kind: 'busy', text: 'Testing…' });
    try {
      const endpoint = endpointOf(s);
      const pattern = endpoint ? originPattern(endpoint) : null;
      // Asking for access to this one address lets requests go straight to your provider.
      if (pattern && !(await chrome.permissions.contains({ origins: [pattern] }))) {
        const granted = await chrome.permissions.request({ origins: [pattern] });
        if (!granted) throw new Error(`Permission to reach ${new URL(endpoint!).host} was not granted`);
      }
      await generateText({ model: createModel(s), prompt: 'Reply with the single word OK.', maxOutputTokens: 8 });
      setStatus({ kind: 'ok', text: 'Connected. You can run a review now.' });
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof ConfigError ? err.message : friendlyError(err).replace(' Showing the built-in suggestions only.', '') });
    }
  };

  const togglePageText = async (on: boolean) => {
    if (on) {
      const granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
      if (!granted) return;
    } else {
      await chrome.permissions.remove({ origins: ['<all_urls>'] }).catch(() => {});
    }
    await update({ readPageText: on });
  };

  const addSite = async () => {
    const v = newSite.trim().toLowerCase();
    if (!v || s.exclusions.includes(v)) return;
    await update({ exclusions: [...s.exclusions, v] });
    setNewSite('');
  };

  const providerForm = s.mode === 'key' && (
    <div className="sub-form">
      <label>Provider
        <select className="field" value={s.provider} onChange={(e) => update({ provider: e.target.value as Provider, model: DEFAULT_MODELS[e.target.value as Provider] })}>
          {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <label>Model
        <input className="field" type="text" value={s.model} onChange={(e) => update({ model: e.target.value })} placeholder="A small, cheap model works well" />
      </label>
      {s.provider === 'custom' && (
        <label>Endpoint address
          <input className="field" type="url" value={s.baseUrl} onChange={(e) => update({ baseUrl: e.target.value })} placeholder="https://api.example.com/v1" />
        </label>
      )}
      <label>API key
        <input className="field" type="password" autoComplete="off" value={s.apiKey} onChange={(e) => update({ apiKey: e.target.value })} placeholder="Paste your key" />
      </label>
      <p className="note">Stays in this browser. Only sent to {endpointOf(s) ? new URL(endpointOf(s)!).host : 'your provider'}.</p>
      <TestRow onTest={test} status={status} />
    </div>
  );

  const localForm = s.mode === 'local' && (
    <div className="sub-form">
      <label>Server address
        <input className="field" type="url" value={s.baseUrl} onChange={(e) => update({ baseUrl: e.target.value })} />
      </label>
      <label>Model
        <input className="field" type="text" value={s.model} onChange={(e) => update({ model: e.target.value })} placeholder="llama3.2" />
      </label>
      <p className="note">Nothing leaves your computer. For Ollama, set OLLAMA_ORIGINS=chrome-extension://*.</p>
      <TestRow onTest={test} status={status} />
    </div>
  );

  return (
    <section className="view">
      <div className="section-head"><h2 className="section-label">AI</h2></div>
      <div className="card" role="radiogroup" aria-label="How tabDebt thinks">
        {MODES.map((m) => (
          <div key={m.id}>
            <label className="settings-row">
              <input type="radio" name="ai-mode" checked={s.mode === m.id} onChange={() => { setStatus(null); void update({ mode: m.id }); }} />
              <span className="grow"><strong>{m.name}</strong><span className="hint">{m.hint}</span></span>
              <span className={m.free ? 'badge badge-free' : 'badge badge-neutral'}>{m.badge}</span>
            </label>
            {m.id === 'key' && providerForm}
            {m.id === 'local' && localForm}
          </div>
        ))}
      </div>

      <div className="section-head" style={{ marginTop: 8 }}><h2 className="section-label">What it can see</h2></div>
      <div className="card">
        <div className="settings-row">
          <span className="grow"><strong>Tab titles and addresses</strong><span className="hint">Needed to sort anything</span></span>
          <Switch checked disabled label="Tab titles and addresses" onChange={() => {}} />
        </div>
        <div className="settings-row">
          <span className="grow"><strong>Page text</strong><span className="hint">First few paragraphs, for unclear tabs</span></span>
          <Switch checked={s.readPageText} disabled={s.mode === 'builtin'} label="Page text" onChange={(on) => void togglePageText(on)} />
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 8 }}><h2 className="section-label">Never look at</h2></div>
      <ul className="chips">
        {s.exclusions.map((e) => (
          <li key={e} className="chip">
            {e}
            <button aria-label={`Remove ${e}`} onClick={() => update({ exclusions: s.exclusions.filter((x) => x !== e) })}>×</button>
          </li>
        ))}
      </ul>
      <form className="add-row" onSubmit={(e) => { e.preventDefault(); void addSite(); }}>
        <Autocomplete label="Add a site or word" value={newSite} onChange={setNewSite} vocabulary={siteVocabulary} placeholder="Add a site" />
        <button className="pill pill-quiet pill-sm" type="submit">Add</button>
      </form>

      <div className="section-head" style={{ marginTop: 8 }}><h2 className="section-label">Sites you kept</h2></div>
      {memory && memory.length > 0 ? (
        <ul className="chips">
          {memory.map((m) => (
            <li key={m.host} className="chip">
              {m.host}
              <button aria-label={`Forget ${m.host}`} onClick={async () => { await repos.memory.delete(m.host); notifyChanged(); }}>×</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" style={{ padding: '0 20px' }}>Untick a suggestion and the site shows up here, kept open next time.</p>
      )}
    </section>
  );
}

function TestRow({ onTest, status }: { onTest: () => void; status: { kind: 'ok' | 'error' | 'busy'; text: string } | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <button className="pill pill-quiet pill-sm" type="button" onClick={onTest}>Test connection</button>
      {status && <span className={`status ${status.kind}`} role="status">{status.text}</span>}
    </div>
  );
}
