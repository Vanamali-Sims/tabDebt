import { useCallback, useEffect, useState } from 'react';
import { IdbTabStore } from './db';
import { onChanged } from './channel';
import type { TabRecord } from './types';

const store = new IdbTabStore();

/** Open tabs, newest activity first, refreshed whenever the background worker records a change. */
export function useOpenTabs() {
  const [tabs, setTabs] = useState<TabRecord[] | null>(null);

  const load = useCallback(async () => {
    const rows = await store.listOpen();
    setTabs(rows.sort((a, b) => b.lastActiveAt - a.lastActiveAt));
  }, []);

  useEffect(() => {
    void load();
    return onChanged(() => void load());
  }, [load]);

  return tabs;
}
