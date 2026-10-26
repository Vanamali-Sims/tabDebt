import type { ReactNode } from 'react';

const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function Svg({ size = 16, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...base}>
      {children}
    </svg>
  );
}

export const LeafIcon = ({ size }: { size?: number }) => (
  <svg width={size ?? 16} height={size ?? 16} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M3 21C3 11 9 4 21 3c0 11-6 17-18 18z" fill="currentColor" />
    <path d="M4 20C9 14 13 10 18 6" fill="none" stroke="var(--bg)" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);
export const SearchIcon = ({ size }: { size?: number }) => <Svg size={size}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Svg>;
export const BookmarkIcon = ({ size }: { size?: number }) => <Svg size={size}><path d="M6 3h12v18l-6-4-6 4z" /></Svg>;
export const ClockIcon = ({ size }: { size?: number }) => <Svg size={size}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
export const CloseIcon = ({ size }: { size?: number }) => <Svg size={size}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const CheckIcon = ({ size }: { size?: number }) => <Svg size={size}><path d="M5 12.5l4.5 4.5L19 7" /></Svg>;
export const TabsIcon = ({ size }: { size?: number }) => <Svg size={size}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18M9 5v4" /></Svg>;
export const SavedIcon = ({ size }: { size?: number }) => <Svg size={size}><path d="M5 4h14v16l-7-4-7 4z" /></Svg>;
export const SettingsIcon = ({ size }: { size?: number }) => <Svg size={size}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></Svg>;
