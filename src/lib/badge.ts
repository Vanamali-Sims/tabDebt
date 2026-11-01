/** Text for the toolbar badge: the number of open tabs, capped so it fits. */
export function badgeText(count: number): string {
  if (count <= 0) return '';
  return count > 99 ? '99+' : String(count);
}

/** Milliseconds from `now` until the next local time of day, for scheduling the daily reminder. */
export function msUntilNext(hour: number, minute: number, now: Date = new Date()): number {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** Tab count at which the end-of-day reminder is worth showing. */
export const REMINDER_MIN_TABS = 10;
export const REMINDER_HOUR = 17;
export const REMINDER_MINUTE = 30;

export const BADGE_GREY = '#5b5750';
export const BADGE_AMBER = '#d9a35b';
export const BADGE_GREEN = '#86b48e';

export interface BadgeState { text: string; color: string; title: string }

/**
 * The toolbar badge is the quietest nudge: a green dot when the morning view is waiting, nothing when
 * every tab has been used in the last hour, a grey count normally, and amber once past the tab limit.
 */
export function badgeState(s: { count: number; staleCount: number; tabLimit: number; morning: boolean }): BadgeState {
  if (s.morning) return { text: '•', color: BADGE_GREEN, title: "Here's where you left off" };
  if (s.count === 0 || s.staleCount === 0) return { text: '', color: BADGE_GREY, title: 'All caught up' };
  if (s.count >= s.tabLimit) return { text: badgeText(s.count), color: BADGE_AMBER, title: `${s.count} tabs open. Review when you're ready` };
  return { text: badgeText(s.count), color: BADGE_GREY, title: `${s.count} tabs open` };
}
