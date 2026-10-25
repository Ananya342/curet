import { CalEvent, kvSet, nowSec } from "../api";
import { readList } from "../wellbeing/log";
import type { Syllabus } from "./syllabus";

const DAY = 86400;

/** How much one dated item counts toward its course grade, as read from a syllabus (or told to the chat). */
export interface GradeWeight {
  course: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  kind: string;
  /** Percent of the final grade. */
  weight: number;
}

export const gradeWeights = () => readList<GradeWeight>("grade_weights");

/** Keep every weighted item from a syllabus, replacing what an earlier upload of the same course said. */
export async function saveSyllabusWeights(s: Syllabus) {
  const fresh = s.items
    .filter((i) => typeof i.weight === "number" && i.weight > 0 && i.weight <= 100)
    .map((i) => ({ course: s.course, title: i.title, date: i.date, kind: i.kind, weight: Math.round(i.weight! * 10) / 10 }));
  if (!fresh.length) return 0;
  const kept = (await gradeWeights()).filter((w) => !s.course || w.course !== s.course);
  await kvSet("grade_weights", JSON.stringify([...kept, ...fresh]));
  return fresh.length;
}

/** The chat's set_grade_weight: "Essay 2 is worth 20%". Replaces an existing match, or adds one. */
export async function setWeight(e: CalEvent, weight: number) {
  const all = await gradeWeights();
  const date = ymd(e.start);
  const i = all.findIndex((w) => sameItem(w, e));
  const entry = { course: i >= 0 ? all[i].course : "", title: cleanTitle(e.title), date, kind: kindOf(e.title), weight };
  if (i >= 0) all[i] = entry; else all.push(entry);
  await kvSet("grade_weights", JSON.stringify(all));
}

// ---- matching a calendar deadline to a syllabus item ------------------------------------------------------

/** Brightspace titles end in " - Due" or " - Availability Ends". */
export const cleanTitle = (t: string) => t.replace(/\s*[-–]\s*(due|closes?|availability ends)\s*$/i, "");
const ymd = (t: number) => {
  const d = new Date(t * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const daysApart = (date: string, t: number) => Math.abs(new Date(`${date}T12:00`).getTime() / 1000 - t) / DAY;
// "CS 241: Midterm 1 - Due" → "midterm 1"
const norm = (s: string) =>
  cleanTitle(s).toLowerCase().replace(/^[a-z]{2,5}\s?\d{2,4}[a-z]?\s*[:\-–]\s*/, "").replace(/\b(due|submission|submit)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const words = (s: string) => new Set(norm(s).split(" ").filter(Boolean));

function sameItem(w: GradeWeight, e: CalEvent) {
  const apart = daysApart(w.date, e.start);
  if (apart > 2) return false;
  const a = norm(w.title), b = norm(e.title);
  if (a && b && (a === b || a.includes(b) || b.includes(a))) return true;
  // Same day, mostly the same words, and the same number if either has one ("Quiz 4" is not "Quiz 5").
  const wa = words(w.title), wb = words(e.title);
  const shared = [...wa].filter((x) => wb.has(x)).length;
  const numA = [...wa].filter((x) => /^\d+$/.test(x)), numB = [...wb].filter((x) => /^\d+$/.test(x));
  const numbersAgree = !numA.length || !numB.length || numA.some((n) => numB.includes(n));
  return apart <= 1 && numbersAgree && shared / Math.max(1, Math.min(wa.size, wb.size)) >= 0.5;
}

const EXAM = /\b(exam|midterm|final)\b/i, QUIZ = /\b(quiz|test)\b/i, PROJECT = /\b(project|paper|essay|report|presentation)\b/i;
const kindOf = (t: string) => (EXAM.test(t) ? "exam" : QUIZ.test(t) ? "quiz" : PROJECT.test(t) ? "project" : "assignment");
// When no syllabus says, a rough guess by kind, so planning can still rank things. Never shown as a real weight.
const GUESS: Record<string, number> = { exam: 20, project: 10, assignment: 5, quiz: 3 };

export interface Weighed {
  /** Percent of the grade. */
  weight: number;
  /** True when it came from a syllabus or the user; false when it's only the guess by kind. */
  known: boolean;
  course?: string;
}

export function weightOf(e: CalEvent, weights: GradeWeight[]): Weighed {
  const w = weights.find((x) => sameItem(x, e));
  return w ? { weight: w.weight, known: true, course: w.course || undefined } : { weight: GUESS[kindOf(e.title)], known: false };
}

// ---- the planning formula --------------------------------------------------------------------------------

/**
 * Priority = weight ÷ days left. A 20% essay due in 6 days (3.3) comes before a 2% quiz due tomorrow (2.0), but
 * that same quiz due in 3 hours (16) still jumps the queue. Days left never drops below a quarter day, so
 * something due in minutes doesn't swamp everything else.
 */
export const priority = (weight: number, due: number, now = nowSec()) => weight / Math.max(0.25, (due - now) / DAY);

/** How long a study block to offer: an hour for small things, two for most, three for anything worth 15% or more. */
export const blockMinutes = (weight: number) => (weight >= 15 ? 180 : weight >= 5 ? 120 : 60);

export interface Ranked { event: CalEvent; weight: Weighed; score: number }

/** Upcoming deadlines, most important first by the formula. */
export function rank(events: CalEvent[], weights: GradeWeight[], now = nowSec()): Ranked[] {
  return events
    .filter((e) => e.start > now)
    .map((event) => {
      const weight = weightOf(event, weights);
      return { event, weight, score: priority(weight.weight, event.start, now) };
    })
    .sort((a, b) => b.score - a.score);
}

/** "20% of your grade" when known; nothing when it's only a guess. */
export const weightWords = (w: Weighed) => (w.known ? `${fmtPct(w.weight)} of your grade` : "");
export const fmtPct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
