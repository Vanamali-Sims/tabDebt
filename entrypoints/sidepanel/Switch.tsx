/** An on/off switch with a 44px touch target. A real button, so it works with the keyboard and screen readers. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" className="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="track"><span className="knob" /></span>
    </button>
  );
}
