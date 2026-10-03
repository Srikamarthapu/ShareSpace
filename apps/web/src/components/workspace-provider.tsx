'use client';

import { createContext, useContext, useMemo, useState, useSyncExternalStore } from 'react';
import { initialSample, parseSampleState, sampleStateSchema, type SampleState } from '@/lib/sample-data';

const storageKey = 'sharespace:sample:v1';
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('sharespace:changed', callback);
  return () => { window.removeEventListener('storage', callback); window.removeEventListener('sharespace:changed', callback); };
}
function snapshot() {
  try { return window.localStorage.getItem(storageKey); } catch { return null; }
}
type WorkspaceContext = {
  state: SampleState; notice: string;
  update: (mutate: (current: SampleState) => SampleState, message: string) => boolean;
  reset: () => void;
};
const Context = createContext<WorkspaceContext | null>(null);
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const state = useMemo(() => parseSampleState(raw), [raw]);
  const [notice, setNotice] = useState('');
  function update(mutate: (current: SampleState) => SampleState, message: string) {
    try {
      const next = sampleStateSchema.parse(mutate(parseSampleState(snapshot())));
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      window.dispatchEvent(new Event('sharespace:changed'));
      setNotice(message);
      return true;
    } catch {
      setNotice('Could not save this change. Check browser storage access and try again.');
      return false;
    }
  }
  return <Context.Provider value={{ state, notice, update, reset: () => { update(() => structuredClone(initialSample), 'Sample workspace reset.'); } }}>{children}</Context.Provider>;
}
export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error('WorkspaceProvider is required.');
  return context;
}
