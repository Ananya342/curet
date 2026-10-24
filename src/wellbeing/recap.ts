import { eventsRange, kvSet, nowSec } from "../api";
import { FocusSession, readList } from "./log";
import { deadlinesMet } from "../study/plans";

const DAY = 86400;

/** Monday 00:00 (local) of the week containing `d`, in unix seconds. */
export function weekStart(d = new Date()): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return Math.floor(x.getTime() / 1000);
}

/** ISO week key like "2026-W43", matching what the Rust scheduler uses. */
export function weekKey(d = new Date()): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((x.getTime() - y0.getTime()) / 86400000 + 1) / 7);
  return `${x.getUTCFullYear()}-W${String(w).padStart(2, "0")}`;
}

export interface WeekRecap {
  from: number;
  /** Focus minutes per day, Monday first. */
  days: number[];
  total: number;
  lastWeek: number;
  sessions: number;
  finished: number;
  longest: { minutes: number; day: number } | null;
  best: { minutes: number; day: number } | null;
  /** Consecutive days with some focus, ending today (or yesterday, if today hasn't started yet). */
  streak: number;
  deadlinesPast: number;
  /** Of those, how many you ticked off before they were due. */
  deadlinesMet: number;
  deadlinesAhead: number;
  tasksDone: number;
  lateNights: number;
}

const minutes = (s: FocusSession) => Math.max(0, Math.round((s.to - s.from) / 60));
// A session counts toward the day it started on.
const dayIndex = (t: number, from: number) => Math.floor((t - from) / DAY);

export async function weekRecap(): Promise<WeekRecap> {
  const now = nowSec();
  const from = weekStart();
  const log = await readList<FocusSession>("focus_log");
  const week = log.filter((s) => s.from >= from && s.from < from + 7 * DAY);
  const days = Array.from({ length: 7 }, () => 0);
  for (const s of week) days[Math.min(6, dayIndex(s.from, from))] += minutes(s);

  const longestS = week.reduce<FocusSession | null>((a, s) => (!a || minutes(s) > minutes(a) ? s : a), null);
  const bestDay = days.reduce((bi, m, i) => (m > days[bi] ? i : bi), 0);

  // Streak over the whole log, counting back day by day.
  const focusDays = new Set(log.map((s) => new Date(s.from * 1000).toDateString()));
  let streak = 0;
  const cur = new Date();
  if (!focusDays.has(cur.toDateString())) cur.setDate(cur.getDate() - 1);
  while (focusDays.has(cur.toDateString())) { streak++; cur.setDate(cur.getDate() - 1); }

  const deadlines = (await eventsRange(from, now + 7 * DAY)).filter((e) => e.kind === "deadline");
  const inWeek = (t: number) => t >= from && t <= now;
  return {
    from,
    days,
    total: days.reduce((a, b) => a + b, 0),
    lastWeek: log.filter((s) => s.from >= from - 7 * DAY && s.from < from).reduce((a, s) => a + minutes(s), 0),
    sessions: week.length,
    finished: week.filter((s) => s.done).length,
    longest: longestS && minutes(longestS) > 0 ? { minutes: minutes(longestS), day: dayIndex(longestS.from, from) } : null,
    best: days[bestDay] > 0 ? { minutes: days[bestDay], day: bestDay } : null,
    streak,
    deadlinesPast: deadlines.filter((e) => inWeek(e.start)).length,
    deadlinesMet: (await deadlinesMet(from, now)).met,
    deadlinesAhead: deadlines.filter((e) => e.start > now).length,
    tasksDone: (await readList<number>("tasks_done_log")).filter(inWeek).length,
    lateNights: (await readList<number>("late_nights_log")).filter(inWeek).length,
  };
}

/** "2h 15m", "45m". */
export const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ---- journal --------------------------------------------------------------------------------------------

const PROMPTS = [
  "What's one thing you're proud of this week, however small?",
  "What drained you this week, and what refilled you?",
  "When did you feel most like yourself this week?",
  "What's one thing you'd tell yourself on Monday morning?",
  "What did you learn this week, in class or out of it?",
  "Who made your week a little better? Did you tell them?",
  "What's one worry you can set down before next week?",
  "Which moment this week would you like to remember?",
  "What's one small intention for next week?",
  "What felt hard this week, and how did you get through it?",
  "What would make next week feel 10% lighter?",
  "Where did you find a bit of calm this week?",
];

export interface JournalEntry { week: string; prompt: string; text: string; at: number }

export function promptFor(week: string) {
  const n = Number(week.slice(-2)) + Number(week.slice(0, 4));
  return PROMPTS[n % PROMPTS.length];
}

/** Entries stay on this Mac: they're only ever written to the local database. */
export const journal = {
  list: () => readList<JournalEntry>("journal"),
  async save(e: JournalEntry) {
    const all = await readList<JournalEntry>("journal");
    all.push(e);
    all.sort((a, b) => b.at - a.at); // newest first; several entries a week are fine
    await kvSet("journal", JSON.stringify(all));
  },
};
