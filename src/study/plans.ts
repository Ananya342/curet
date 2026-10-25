import { emitTo } from "@tauri-apps/api/event";
import { CalEvent, addCalendarEvent, eventsRange, kvGet, kvSet, nowSec, startOfDay } from "../api";
import { readList } from "../wellbeing/log";
import { freeGaps } from "../wellbeing/gaps";

const DAY = 86400;

/** A deadline is known by where it came from plus its id, so a re-synced feed keeps the same key. */
export const deadlineKey = (e: Pick<CalEvent, "source" | "id">) => `${e.source}:${e.id}`;

// ---- ticking off deadlines ------------------------------------------------------------------------------
// Brightspace deadlines are calendar events, not tasks, so Curet keeps its own record of which ones you
// finished (and when). That's what "deadlines met" in the weekly recap counts.

type DoneMap = Record<string, number>;
const readDone = async (): Promise<DoneMap> => {
  try { return JSON.parse((await kvGet("deadlines_done")) ?? "{}") as DoneMap; } catch { return {}; }
};
export const deadlinesDone = readDone;

/** `at` backdates it: "I submitted it" after the deadline passed still counts as on time. */
export async function setDeadlineDone(key: string, done: boolean, at = nowSec()) {
  const m = await readDone();
  if (done) m[key] = at; else delete m[key];
  // Forget anything older than ten weeks so the map stays small.
  for (const [k, t] of Object.entries(m)) if (nowSec() - t > 70 * DAY) delete m[k];
  await kvSet("deadlines_done", JSON.stringify(m));
  if (done) await emitTo("pet", "celebrate", null);
  await emitTo("panel", "plans-updated", null).catch(() => {});
  await emitTo("pet", "plans-updated", null).catch(() => {});
}

// ---- study blocks ---------------------------------------------------------------------------------------

export interface StudyPlan {
  key: string;           // the deadline it's for
  title: string;         // the deadline's title
  due: number;
  start: number;
  end: number;
  /** "planned" until the block starts; "nudged" once the pet has called you to it. */
  status: "planned" | "nudged" | "done" | "skipped";
  onCalendar: boolean;
}

export const studyPlans = () => readList<StudyPlan>("study_plans");
const savePlans = (p: StudyPlan[]) => kvSet("study_plans", JSON.stringify(p.filter((x) => nowSec() - x.due < 30 * DAY)));

export async function updatePlan(key: string, patch: Partial<StudyPlan>) {
  const all = await studyPlans();
  await savePlans(all.map((p) => (p.key === key ? { ...p, ...patch } : p)));
}

/** Deadlines the pet has offered to plan for (so it doesn't ask twice), with when it asked. */
const asked = async (): Promise<DoneMap> => {
  try { return JSON.parse((await kvGet("plan_asked")) ?? "{}") as DoneMap; } catch { return {}; }
};
export async function markAsked(key: string, on = true) {
  const m = await asked();
  if (on) m[key] = nowSec(); else delete m[key];
  await kvSet("plan_asked", JSON.stringify(m));
}

export interface Proposal {
  deadline: CalEvent;
  start: number;
  end: number;
}

const BLOCK = 120 * 60;

// Exams added from a syllabus (or by hand) are calendar events, not deadlines, but deserve a study block too.
export const EXAM = /\b(exam(ination)?s?|midterms?|finals?|quiz(zes)?|tests?)\b/i;
/** An exam on the calendar (not one of Curet's own "Study:" blocks). */
export const isExam = (e: Pick<CalEvent, "kind" | "title">) => e.kind === "event" && EXAM.test(e.title) && !/^study:/i.test(e.title);

/**
 * The first good study slot for `deadline`: a free stretch of 2 hours (or at least 1, cut to fit) on a day before
 * it's due, starting from today if there's still time. Never in the last 2 hours before it's due.
 */
export async function slotFor(deadline: CalEvent, after = nowSec()): Promise<Proposal | null> {
  const cutoff = deadline.start - 2 * 3600;
  for (let d = startOfDay(new Date(after * 1000)); d <= startOfDay(new Date(cutoff * 1000)); d += DAY) {
    const day = new Date(d * 1000 + 12 * 3600 * 1000); // midday, so a DST shift can't land it on the wrong date
    const from = Math.max(after + 15 * 60, d);
    for (const minutes of [120, 60]) {
      for (const g of await freeGaps(day, minutes, from)) {
        // Start on a quarter hour, so it reads like something a person would schedule.
        const start = Math.ceil(g.start / 900) * 900;
        const end = Math.min(start + BLOCK, g.end, cutoff);
        if (end - start >= minutes * 60) return { deadline, start, end };
      }
    }
  }
  return null;
}

/**
 * The next deadline worth planning for: due within a week but not in the next few hours, not ticked off,
 * not already planned, and not one the pet already asked about. `key` asks about one deadline in particular
 * (the Plan button in Today), ignoring whether it was asked about before.
 */
export async function nextProposal(key?: string): Promise<Proposal | null> {
  const now = nowSec();
  const [evs, done, plans, seen] = await Promise.all([eventsRange(now, now + 7 * DAY), readDone(), studyPlans(), asked()]);
  const planned = new Set(plans.filter((p) => p.status !== "skipped").map((p) => p.key));
  const candidates = evs
    .filter((e) => e.kind === "deadline" || isExam(e))
    .filter((e) => (key ? deadlineKey(e) === key : e.start - now > 6 * 3600 && !seen[deadlineKey(e)]))
    .filter((e) => !done[deadlineKey(e)] && !planned.has(deadlineKey(e)))
    .sort((a, b) => a.start - b.start);
  for (const d of candidates) {
    const slot = await slotFor(d, now);
    if (slot) return slot;
  }
  return null;
}

/** Book the block: on Google Calendar when it's connected, and always in Curet's own list. */
export async function acceptProposal(p: Proposal): Promise<{ onCalendar: boolean; error?: string }> {
  let onCalendar = false, error: string | undefined;
  try {
    await addCalendarEvent({
      title: `Study: ${p.deadline.title}`,
      start: p.start,
      end: p.end,
      allDay: false,
      description: `Planned by Curet for “${p.deadline.title}”, due ${new Date(p.deadline.start * 1000).toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" })}.`,
    });
    onCalendar = true;
  } catch (e) {
    error = String(e);
  }
  const all = (await studyPlans()).filter((x) => x.key !== deadlineKey(p.deadline));
  all.push({ key: deadlineKey(p.deadline), title: p.deadline.title, due: p.deadline.start, start: p.start, end: p.end, status: "planned", onCalendar });
  await savePlans(all);
  await markAsked(deadlineKey(p.deadline));
  await emitTo("panel", "plans-updated", null).catch(() => {});
  return { onCalendar, error };
}

/** A planned block starting within the next 5 minutes (or started under 15 minutes ago) that the pet hasn't called you to yet. */
export async function blockStartingNow(): Promise<StudyPlan | null> {
  const now = nowSec();
  const done = await readDone();
  return (await studyPlans()).find((p) => p.status === "planned" && !done[p.key] && p.start - now <= 5 * 60 && now - p.start <= 15 * 60) ?? null;
}

/** Deadlines in [from, to]: how many there were, and how many you ticked off before they were due. */
export async function deadlinesMet(from: number, to: number) {
  const [evs, done] = await Promise.all([eventsRange(from, to), readDone()]);
  const due = evs.filter((e) => e.kind === "deadline" && e.start >= from && e.start <= to);
  return { total: due.length, met: due.filter((e) => (done[deadlineKey(e)] ?? Infinity) <= e.start + 15 * 60).length };
}

// ---- words -------------------------------------------------------------------------------------------------

export const dayWord = (t: number) => {
  const d = startOfDay(new Date(t * 1000)), today = startOfDay();
  if (d === today) return "today";
  if (d === today + DAY) return "tomorrow";
  return new Date(t * 1000).toLocaleDateString([], { weekday: "long" });
};
export const timeWord = (t: number) => new Date(t * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
