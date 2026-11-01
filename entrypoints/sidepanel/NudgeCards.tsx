import { useState } from 'react';
import { notifyChanged } from '@/src/lib/channel';
import { backoffDue, effectiveFinish, formatMinutes, fromTimeInput, learnFinishTime, loadLastActive, loadLog, saveLog, toTimeInput } from '@/src/lib/nudge';
import { repos } from '@/src/lib/services';
import type { Settings } from '@/src/lib/settings';
import { useLive, useSettings } from '@/src/lib/useAsync';

const FIRST_WIN_MS = 15 * 60_000;
const DEFAULT_FINISH = 17 * 60 + 30;

/**
 * At most one card at the top of the Tabs screen, most urgent first: the evening prompt, the back-off
 * question, the "want a reminder?" ask after the first review, then confirming the finish time.
 */
export function NudgeCards({ onReview }: { onReview: () => void }) {
  const { settings: s, update, loaded } = useSettings();
  const log = useLive(() => loadLog());
  const lastActive = useLive(() => loadLastActive());
  const ask = useLive(async () => (await chrome.storage.session.get('wrapUpAsk')).wrapUpAsk as { count: number } | null | undefined);
  const lastRun = useLive(() => repos.runs.latest());
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState('');

  if (!loaded || !log || !lastActive) return null;
  const now = new Date();

  if (ask) {
    return (
      <Card title="Finishing up?" body={`${ask.count} tabs open. Wrapping up takes about a minute.`}>
        <button className="pill pill-sm" onClick={onReview}>Wrap up</button>
        <button className="pill pill-quiet pill-sm" onClick={() => void chrome.runtime.sendMessage({ type: 'wrapup:notyet' })}>Not yet</button>
      </Card>
    );
  }

  if (s.wrapUpPrompt && s.frequency === 'daily' && backoffDue(log)) {
    const choose = async (frequency: Settings['frequency']) => {
      await update({ frequency });
      await saveLog({ ...log, skipStreak: 0 });
      notifyChanged();
    };
    return (
      <Card title="Skipped 3 nights. Fewer reminders?">
        <button className="pill pill-sm" onClick={() => void choose('badge')}>Badge only</button>
        <button className="pill pill-quiet pill-sm" onClick={() => void choose('weekly')}>Fridays</button>
        <button className="pill pill-quiet pill-sm" onClick={() => void choose('daily')}>Keep daily</button>
      </Card>
    );
  }

  const freshWin = lastRun && !lastRun.undoneAt && now.getTime() - lastRun.at < FIRST_WIN_MS && lastRun.applied.length > 0;
  if (!s.nudgeAsked && freshWin) {
    return (
      <Card title={`Nice, ${lastRun.applied.length} tabs cleared.`} body="Want one reminder when you're finishing up?">
        <button className="pill pill-sm" onClick={() => void update({ nudgeAsked: true, wrapUpPrompt: true })}>Remind me</button>
        <button className="pill pill-quiet pill-sm" onClick={() => void update({ nudgeAsked: true })}>No thanks</button>
      </Card>
    );
  }

  if (s.wrapUpPrompt && s.finishMinutes === null) {
    const learned = learnFinishTime(lastActive, now);
    const save = () => {
      const m = fromTimeInput(time || toTimeInput(learned ?? DEFAULT_FINISH));
      if (m !== null) void update({ finishMinutes: m });
      setEditing(false);
    };
    if (learned !== null && !editing) {
      return (
        <Card title={`Looks like you usually wrap up around ${formatMinutes(learned)}.`} body="Use that?">
          <button className="pill pill-sm" onClick={() => void update({ finishMinutes: learned })}>Yes</button>
          <button className="pill pill-quiet pill-sm" onClick={() => { setTime(toTimeInput(learned)); setEditing(true); }}>Change</button>
        </Card>
      );
    }
    return (
      <Card title="When do you usually finish?" body="tabDebt only asks around then.">
        <label className="sr-only" htmlFor="finish-time">Usual finish time</label>
        <input id="finish-time" className="time-field" type="time" value={time || toTimeInput(effectiveFinish(null, lastActive, now) ?? DEFAULT_FINISH)} onChange={(e) => setTime(e.target.value)} />
        <button className="pill pill-sm" onClick={save}>Save</button>
      </Card>
    );
  }

  return null;
}

function Card({ title, body, children }: { title: string; body?: string; children: React.ReactNode }) {
  return (
    <div className="card banner-card" role="region" aria-label={title}>
      <div className="card-pad">
        <span className="card-title">{title}</span>
        {body && <span className="card-body">{body}</span>}
        <div className="card-actions">{children}</div>
      </div>
    </div>
  );
}
