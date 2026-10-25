/** Lets the background worker tell open side panels that something changed. */
const NAME = 'tab-debt';

export function notifyChanged() {
  const ch = new BroadcastChannel(NAME);
  ch.postMessage('changed');
  ch.close();
}

export function onChanged(cb: () => void) {
  const ch = new BroadcastChannel(NAME);
  ch.onmessage = () => cb();
  return () => ch.close();
}
