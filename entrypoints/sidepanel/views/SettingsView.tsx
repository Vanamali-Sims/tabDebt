import { generateText } from 'ai';
import { useEffect, useMemo, useState } from 'react';
import { Autocomplete } from '../Autocomplete';
import { Switch } from '../Switch';
import { ConfigError, createModel, endpointOf, originPattern } from '@/src/lib/agent/models';
import { deviceStatus, downloadDeviceModel, type DeviceStatus } from '@/src/lib/agent/device';
import { ALL_SITES, VIDEO_ORIGINS, neededOrigins } from '@/src/lib/pagestate';
import { notifyChanged } from '@/src/lib/channel';
import { friendlyError } from '@/src/lib/review';
import { DEFAULT_MODELS, type Provider, type Settings } from '@/src/lib/settings';
import { repos } from '@/src/lib/services';
import { hostOf } from '@/src/lib/format';
import { buildVocabulary } from '@/src/lib/suggest';
import { useOpenTabs } from '@/src/lib/useTabs';
import { useLive, useSettings } from '@/src/lib/useAsync';
import { formatMinutes, fromTimeInput, learnFinishTime, loadLastActive, toTimeInput } from '@/src/lib/nudge';

const MODES: { id: Settings['mode']; name: string; hint: string; badge: string; free: boolean }[] = [
  { id: 'device', name: 'On this device', hint: 'Private. Runs in your browser', badge: 'Free', free: true },
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
  const lastActive = useLive(() => loadLastActive());
  const learned = lastActive ? learnFinishTime(lastActive, new Date()) : null;
  const paused = s.pausedUntil > Date.now();

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

  const [accessNote, setAccessNote] = useState<string | null>(null);

  /**
   * Page text, video progress and unsent text each need site access. Turning one on asks for what it needs;
   * turning one off gives back only what nothing else still uses.
   */
  const setAccess = async (patch: Partial<Pick<Settings, 'readPageText' | 'checkVideo' | 'checkTyping'>>) => {
    setAccessNote(null);
    const next = { ...s, ...patch };
    const want = neededOrigins(next);
    const turningOn = Object.values(patch).some(Boolean);
    if (turningOn && want.length > 0) {
      // Must be the first await after the click, or the browser won't show the prompt. Already granted returns true.
      const granted = await chrome.permissions.request({ origins: want });
      if (!granted) return setAccessNote("Not turned on: the browser didn't get your OK.");
    }
    if (!want.includes(ALL_SITES[0]!)) await chrome.permissions.remove({ origins: ALL_SITES }).catch(() => {});
    if (want.length === 0) await chrome.permissions.remove({ origins: VIDEO_ORIGINS }).catch(() => {});
    // Giving back every-site access can take video sites with it. Then the video check needs a fresh OK.
    if (next.checkVideo && !(await chrome.permissions.contains({ origins: VIDEO_ORIGINS }))) {
      next.checkVideo = false;
      setAccessNote('Video progress was turned off with it. Turn it back on to allow YouTube and Vimeo.');
    }
    await update({ readPageText: next.readPageText, checkVideo: next.checkVideo, checkTyping: next.checkTyping });
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
            {m.id === 'device' && s.mode === 'device' && <DeviceRow />}
            {m.id === 'key' && providerForm}
            {m.id === 'local' && localForm}
          </div>
        ))}
      </div>

      <div className="section-head" style={{ marginTop: 8 }}><h2 className="section-label">Routine</h2></div>
      <div className="card">
        <div className="settings-row">
          <span className="grow"><strong>Finishing-up reminder</strong><span className="hint">Once, when it looks like you're wrapping up</span></span>
          <Switch checked={s.wrapUpPrompt} label="Finishing-up reminder" onChange={(on) => void update({ wrapUpPrompt: on, nudgeAsked: true })} />
        </div>
        <label className="settings-row">
          <span className="grow">
            <strong>Usually finish</strong>
            <span className="hint">{s.finishMinutes !== null ? 'Set by you' : learned !== null ? `Learned: ${formatMinutes(learned)}` : 'Learning from this week'}</span>
          </span>
          <input
            className="time-field"
            type="time"
            aria-label="Usual finish time"
            value={s.finishMinutes !== null ? toTimeInput(s.finishMinutes) : learned !== null ? toTimeInput(learned) : ''}
            onChange={(e) => void update({ finishMinutes: fromTimeInput(e.target.value) })}
          />
        </label>
        <label className="settings-row">
          <span className="grow"><strong>How often</strong><span className="hint">The badge always shows your count</span></span>
          <select className="time-field" value={s.frequency} onChange={(e) => void update({ frequency: e.target.value as Settings['frequency'] })}>
            <option value="daily">Weekdays</option>
            <option value="weekly">Fridays</option>
            <option value="badge">Badge only</option>
          </select>
        </label>
        <label className="settings-row">
          <span className="grow"><strong>Tab limit</strong><span className="hint">Badge turns amber from here</span></span>
          <input className="time-field" style={{ width: 72 }} type="number" min={3} max={99} value={s.tabLimit} onChange={(e) => { const n = Number(e.target.value); if (n >= 3 && n <= 99) void update({ tabLimit: n }); }} />
        </label>
        {paused && (
          <div className="settings-row">
            <span className="grow"><strong>Paused</strong><span className="hint">Until {new Date(s.pausedUntil).toLocaleDateString([], { weekday: 'long' })}</span></span>
            <button className="text-btn" onClick={() => void update({ pausedUntil: 0 })}>Resume</button>
          </div>
        )}
        <div className="settings-row">
          <span className="grow"><strong>Morning view</strong><span className="hint">First open of the day</span></span>
          <Switch checked={s.morningView} label="Morning view" onChange={(on) => void update({ morningView: on })} />
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 8 }}><h2 className="section-label">What it can see</h2></div>
      <div className="card">
        <div className="settings-row">
          <span className="grow"><strong>Tab titles and addresses</strong><span className="hint">Needed to sort anything</span></span>
          <Switch checked disabled label="Tab titles and addresses" onChange={() => {}} />
        </div>
        <div className="settings-row">
          <span className="grow"><strong>Page text</strong><span className="hint">First few paragraphs, for unclear tabs</span></span>
          <Switch checked={s.readPageText} disabled={s.mode === 'builtin' || s.mode === 'device'} label="Page text" onChange={(on) => void setAccess({ readPageText: on })} />
        </div>
        <div className="settings-row">
          <span className="grow"><strong>Video progress</strong><span className="hint">How far you got, so unfinished videos are saved at that spot. Asks for YouTube and Vimeo</span></span>
          <Switch checked={s.checkVideo} label="Video progress" onChange={(on) => void setAccess({ checkVideo: on })} />
        </div>
        <div className="settings-row">
          <span className="grow"><strong>Unsent text</strong><span className="hint">Keeps tabs where you've typed something. Asks for every site. Never reads what you typed</span></span>
          <Switch checked={s.checkTyping} label="Unsent text" onChange={(on) => void setAccess({ checkTyping: on })} />
        </div>
      </div>
      {accessNote && <p className="status error" role="status" style={{ padding: '6px 20px 0' }}>{accessNote}</p>}

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

/** Whether Chrome's built-in model is ready, with the one-time download when it isn't. */
function DeviceRow() {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void deviceStatus().then(setStatus); }, []);

  const download = async () => {
    setError(null);
    setProgress(0);
    try {
      await downloadDeviceModel(setProgress);
      setStatus(await deviceStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
    }
  };

  if (status === null) return null;
  return (
    <div className="sub-form">
      {status === 'available' && <p className="note">Ready. Nothing leaves this computer.</p>}
      {(status === 'downloadable' || status === 'downloading') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button className="pill pill-sm" type="button" disabled={progress !== null} onClick={() => void download()}>
            {progress !== null ? `Downloading ${Math.round(progress * 100)}%` : status === 'downloading' ? 'Finish download' : 'Download model'}
          </button>
          <span className="hint" style={{ fontSize: 12, color: 'var(--subtle)' }}>One time. Until then, rules sort your tabs.</span>
        </div>
      )}
      {(status === 'unavailable' || status === 'unsupported') && (
        <p className="hint" style={{ fontSize: 12, color: 'var(--subtle)' }}>
          Not available in this browser. It needs recent desktop Chrome and enough memory. Until then, rules sort your tabs, or use your own key.
        </p>
      )}
      {error && <p className="status error" role="status">{error}</p>}
    </div>
  );
}
