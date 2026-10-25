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
