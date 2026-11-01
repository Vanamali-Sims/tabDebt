import { useEffect } from 'react';
import { CheckIcon } from './Icons';

export interface ToastSpec {
  text: string;
  /** Shown as a button on the right. The toast closes after it runs. */
  action?: { label: string; run: () => Promise<void> | void };
  /** How long it stays. Undo lives on in Saved afterwards. */
  ms?: number;
}

/** A short confirmation above the nav, with one optional action and a bar that drains as it times out. */
export function Toast({ toast, onDone }: { toast: ToastSpec; onDone: () => void }) {
  const ms = toast.ms ?? 8000;
  useEffect(() => {
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [toast, ms, onDone]);

  return (
    <div className="toast" role="status">
      <div className="toast-row">
        <span className="toast-text"><CheckIcon size={18} />{toast.text}</span>
        {toast.action && (
          <button className="text-btn" onClick={async () => { await toast.action!.run(); onDone(); }}>{toast.action.label}</button>
        )}
      </div>
      <div className="toast-timer" aria-hidden="true"><span style={{ animationDuration: `${ms}ms` }} /></div>
    </div>
  );
}
