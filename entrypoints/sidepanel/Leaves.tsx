/** Two small leaves tucked behind a button's corners. Purely decorative. */
export function Leaves() {
  return (
    <>
      <svg className="leaf leaf-a" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <path d="M3 21C3 11 9 4 21 3c0 11-6 17-18 18z" fill="currentColor" />
        <path d="M4 20C9 14 13 10 18 6" fill="none" stroke="var(--leaf-vein)" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <svg className="leaf leaf-b" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">
        <path d="M21 21C21 11 15 4 3 3c0 11 6 17 18 18z" fill="currentColor" />
        <path d="M20 20C15 14 11 10 6 6" fill="none" stroke="var(--leaf-vein)" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </>
  );
}
