import { generateText } from 'ai';
import { useMemo, useState } from 'react';
import { Autocomplete } from '../Autocomplete';
import { ConfigError, createModel, endpointOf, originPattern } from '@/src/lib/agent/models';
import { notifyChanged } from '@/src/lib/channel';
import { friendlyError } from '@/src/lib/review';
import { DEFAULT_MODELS, type Provider, type Settings } from '@/src/lib/settings';
import { repos } from '@/src/lib/services';
import { hostOf } from '@/src/lib/format';
import { buildVocabulary } from '@/src/lib/suggest';
import { useOpenTabs } from '@/src/lib/useTabs';
import { useLive, useSettings } from '@/src/lib/useAsync';

const MODES: { id: Settings['mode']; name: string; tag: string; desc: string }[] = [
  { id: 'builtin', name: 'Built in', tag: 'Free', desc: 'No key, no account. Everything stays in your browser.' },
  { id: 'key', name: 'Your own key', tag: 'Smartest', desc: 'Any provider you already use.' },
  { id: 'local', name: 'Local model', tag: 'Most private', desc: 'Ollama or LM Studio on your computer.' },
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

  return (
    <section className="panel-body">
      <h2>How should it think?</h2>
      <div className="modes" role="radiogroup" aria-label="AI mode">
        {MODES.map((m) => (
          <button key={m.id} role="radio" aria-checked={s.mode === m.id} className={s.mode === m.id ? 'mode selected' : 'mode'} onClick={() => update({ mode: m.id })}>
            <span className="tag">{m.tag}</span>
            <strong>{m.name}</strong>
            <span className="muted">{m.desc}</span>
          </button>
        ))}
      </div>

      {s.mode === 'key' && (
        <div className="form">
          <label>Provider
            <select value={s.provider} onChange={(e) => update({ provider: e.target.value as Provider, model: DEFAULT_MODELS[e.target.value as Provider] })}>
              {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label>Model
            <input type="text" value={s.model} onChange={(e) => update({ model: e.target.value })} placeholder="A small, cheap model works well" />
          </label>
          {s.provider === 'custom' && (
            <label>Endpoint address
              <input type="url" value={s.baseUrl} onChange={(e) => update({ baseUrl: e.target.value })} placeholder="https://api.example.com/v1" />
            </label>
          )}
          <label>API key
            <input type="password" autoComplete="off" value={s.apiKey} onChange={(e) => update({ apiKey: e.target.value })} placeholder="Paste your key" />
          </label>
          <p className="note">Your key stays in this browser. It's only sent to {endpointOf(s) ? new URL(endpointOf(s)!).host : 'your provider'}, never to us.</p>
        </div>
      )}

      {s.mode === 'local' && (
        <div className="form">
          <label>Local server address
            <input type="url" value={s.baseUrl} onChange={(e) => update({ baseUrl: e.target.value })} />
          </label>
          <label>Model
            <input type="text" value={s.model} onChange={(e) => update({ model: e.target.value })} placeholder="llama3.2" />
          </label>
          <p className="note">Nothing leaves your computer. Your server must allow requests from this extension (for Ollama, set OLLAMA_ORIGINS=chrome-extension://*).</p>
        </div>
      )}

      {s.mode !== 'builtin' && (
        <div className="form">
          <button className="btn" onClick={test}>Test connection</button>
          {status && <p className={`status ${status.kind}`} role="status">{status.text}</p>}
        </div>
      )}

      <h2>Appearance</h2>
      <div className="seg" role="radiogroup" aria-label="Appearance">
        {([['night', 'Night'], ['day', 'Day'], ['system', 'Match my computer']] as const).map(([id, label]) => (
          <button key={id} role="radio" aria-checked={s.theme === id} className={s.theme === id ? 'seg-item selected' : 'seg-item'} onClick={() => update({ theme: id })}>{label}</button>
        ))}
      </div>

      <h2>What it can see</h2>
      <label className="switch">
        <input type="checkbox" checked disabled />
        <span><strong>Tab titles and addresses</strong><span className="muted">Needed to sort anything</span></span>
      </label>
      <label className="switch">
        <input type="checkbox" checked={s.readPageText} disabled={s.mode === 'builtin'} onChange={(e) => void togglePageText(e.target.checked)} />
        <span><strong>Page text</strong><span className="muted">The first few paragraphs, for better summaries. Asks for site access.</span></span>
      </label>

      <h2>Never look at</h2>
      <p className="muted">Tabs whose address contains any of these are never read or closed.</p>
      <ul className="chips">
        {s.exclusions.map((e) => (
          <li key={e} className="chip-tag">
            {e}
            <button aria-label={`Remove ${e}`} onClick={() => update({ exclusions: s.exclusions.filter((x) => x !== e) })}>×</button>
          </li>
        ))}
      </ul>
      <form className="inline" onSubmit={(e) => { e.preventDefault(); void addSite(); }}>
        <Autocomplete label="Add a site or word" value={newSite} onChange={setNewSite} vocabulary={siteVocabulary} placeholder="crm.mycompany.com" />
        <button className="btn" type="submit">Add</button>
      </form>

      <h2>Sites you kept</h2>
      {memory && memory.length > 0 ? (
        <ul className="chips">
          {memory.map((m) => (
            <li key={m.host} className="chip-tag">
              {m.host}
              <button aria-label={`Forget ${m.host}`} onClick={async () => { await repos.memory.delete(m.host); notifyChanged(); }}>×</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">When you untick a suggestion, the site shows up here and stays open next time.</p>
      )}
    </section>
  );
}
