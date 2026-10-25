import { useCallback, useEffect, useState } from 'react';
import { onChanged } from './channel';
import { loadSettings, saveSettings, type Settings, DEFAULT_SETTINGS } from './settings';

/** Runs a loader now and again whenever the background worker or another panel records a change. */
export function useLive<T>(load: () => Promise<T>, deps: unknown[] = []): T | null {
  const [value, setValue] = useState<T | null>(null);
  const run = useCallback(() => void load().then(setValue), deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    run();
    return onChanged(run);
  }, [run]);
  return value;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);
  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    setSettings(await saveSettings(patch));
  }, []);
  return { settings, update, loaded };
}
