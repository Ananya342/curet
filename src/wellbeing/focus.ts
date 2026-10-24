import { kvGet, kvSet, nowSec } from "../api";

/** When the current focus block ends (unix seconds), or 0 when not focusing. */
export async function getFocusUntil(): Promise<number> {
  const n = Number(await kvGet("focus_until"));
  return Number.isFinite(n) && n > nowSec() ? n : 0;
}
// The Rust scheduler reads this same key to hold back briefings and break reminders during focus.
export const setFocusUntil = (t: number) => kvSet("focus_until", t > 0 ? String(t) : null);

export const FOCUS_CHOICES = [25, 50, 90];
export const minutesLeft = (until: number) => Math.max(1, Math.ceil((until - nowSec()) / 60));
