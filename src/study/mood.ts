import { CalEvent, eventsRange, kvGet, kvSet, nowSec, tasks } from "../api";
import { deadlineKey, deadlinesDone } from "./plans";

export type Mood = "happy" | "worried" | "sad";
export interface MoodInfo { mood: Mood; why: string }

const HOUR = 3600;

/**
 * How the pet feels about your workload, from what Curet can actually see:
 *   sad      a deadline passed in the last two days without being ticked off, or a to-do is overdue;
 *   worried  something unfinished is due within 24 hours;
 *   happy    otherwise.
 * Ticking things off (or answering "yes, I submitted it") cheers it straight back up.
 */
export async function currentMood(): Promise<MoodInfo> {
  const now = nowSec();
  const [evs, done, open] = await Promise.all([eventsRange(now - 48 * HOUR, now + 24 * HOUR), deadlinesDone(), tasks.list()]);
  const pending = evs.filter((e) => e.kind === "deadline" && !done[deadlineKey(e)]);
  const missed = pending.filter((e) => e.start <= now);
  if (missed.length) return { mood: "sad", why: `“${missed[0].title}” went past its deadline` };
  const overdue = open.filter((t) => t.due && t.due < now);
  if (overdue.length) return { mood: "sad", why: `“${overdue[0].title}” is overdue` };
  const soon = pending.filter((e) => e.start > now).sort((a, b) => a.start - b.start)[0];
  if (soon) return { mood: "worried", why: `“${soon.title}” is due in ${Math.max(1, Math.round((soon.start - now) / HOUR))}h` };
  const dueToday = open.filter((t) => t.due && t.due - now < 24 * HOUR);
  if (dueToday.length) return { mood: "worried", why: `“${dueToday[0].title}” is due soon` };
  return { mood: "happy", why: "" };
}

/** A deadline that passed in the last two days, not ticked off, that the pet hasn't asked about yet. */
export async function unaskedPastDeadline(): Promise<CalEvent | null> {
  const now = nowSec();
  const [evs, done] = await Promise.all([eventsRange(now - 48 * HOUR, now), deadlinesDone()]);
  let asked: Record<string, number> = {};
  try { asked = JSON.parse((await kvGet("submit_asked")) ?? "{}"); } catch { /* fresh */ }
  return evs.find((e) => e.kind === "deadline" && e.start <= now - 5 * 60 && !done[deadlineKey(e)] && !asked[deadlineKey(e)]) ?? null;
}

export async function markSubmitAsked(key: string) {
  let asked: Record<string, number> = {};
  try { asked = JSON.parse((await kvGet("submit_asked")) ?? "{}"); } catch { /* fresh */ }
  asked[key] = nowSec();
  for (const [k, t] of Object.entries(asked)) if (nowSec() - t > 14 * 86400) delete asked[k];
  await kvSet("submit_asked", JSON.stringify(asked));
}
