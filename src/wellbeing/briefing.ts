import { eventsRange, fmtTime, nowSec, startOfDay, tasks, untilLabel } from "../api";
import { runTool } from "../ai/tools";
import { courseCode } from "../study/titles";

export type BriefingKind = "morning" | "evening" | "week";
export interface Briefing { greeting: string; lines: string[] }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const clip = (s: string, n = 34) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** Drop Brightspace's " - Due" suffix: the line already says it's due. */
const short = (s: string, n = 22) => clip(s.replace(/\s*[-–]\s*(due|closes?|availability ends)\s*$/i, ""), n);
const weekday = (ts: number) => new Date(ts * 1000).toLocaleDateString([], { weekday: "short" });
const withCourse = (d: { title: string; location?: string }) => { const c = courseCode(d.location ?? ""); return c ? `${short(d.title, 18)} ${c}` : short(d.title); };
const dueLine = (due: { title: string; start: number; location?: string }[], label: (ts: number) => string) =>
  `Due soon: ${due.slice(0, 2).map((d) => `${withCourse(d)} (${label(d.start)})`).join(", ")}${due.length > 2 ? ` +${due.length - 2} more` : ""}`;

/** Local YYYY-MM-DD, used to remember which day a briefing was already given. */
export const todayKey = () => new Date().toLocaleDateString("en-CA");

/** The longest free stretch of at least an hour left on a given day, as "1:00 PM–4:00 PM". */
async function longestFree(day: Date): Promise<string | null> {
  const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  const gaps = (await runTool("find_free_time", { date: iso, min_minutes: 60 })) as { from: string; to: string; minutes: number }[];
  if (!gaps?.length) return null;
  const best = gaps.reduce((a, b) => (b.minutes > a.minutes ? b : a));
  return `${best.from}–${best.to}`;
}

const EXAM = /\b(exam|midterm|final|quiz|test)\b/i;
const dayName = (ts: number) => new Date(ts * 1000).toLocaleDateString([], { weekday: "long" });

/** The seven days starting tomorrow: how many exams and deadlines, which are the exams, and the heaviest day. */
async function weekLines(): Promise<string[]> {
  const t0 = startOfDay(new Date(Date.now() + 86400000));
  const items = (await eventsRange(t0, t0 + 7 * 86400)).filter((e) => e.kind === "deadline" || EXAM.test(e.title));
  if (!items.length) return ["Next week is clear: no exams or deadlines"];
  const exams = items.filter((e) => EXAM.test(e.title));
  const deadlines = items.filter((e) => !EXAM.test(e.title));
  const counts = [exams.length ? plural(exams.length, "exam") : "", deadlines.length ? plural(deadlines.length, "deadline") : ""].filter(Boolean);
  const lines = [`Next week: ${counts.join(", ")}`];
  if (exams.length) lines.push(`Exams: ${exams.slice(0, 2).map((e) => `${short(e.title)} (${weekday(e.start)})`).join(", ")}${exams.length > 2 ? ` +${exams.length - 2} more` : ""}`);
  const perDay = new Map<string, number>();
  for (const e of items) perDay.set(dayName(e.start), (perDay.get(dayName(e.start)) ?? 0) + 1);
  const [busiest, n] = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
  if (n >= 2) lines.push(`Heaviest day: ${busiest} (${n} things)`);
  return lines;
}

export async function composeBriefing(kind: BriefingKind): Promise<Briefing> {
  if (kind === "week") return { greeting: "The week ahead", lines: await weekLines() };

  const now = nowSec();
  const open = await tasks.list();

  if (kind === "morning") {
    const day = startOfDay();
    const evs = (await eventsRange(day, day + 86400)).filter((e) => e.kind === "event" && e.end > now);
    const due = (await eventsRange(now, now + 2 * 86400)).filter((e) => e.kind === "deadline");
    const lines: string[] = [];
    if (evs.length) {
      const next = evs.find((e) => !e.all_day) ?? evs[0];
      lines.push(`${plural(evs.length, "event")} today. Next: ${clip(next.title, 24)}${next.all_day ? "" : ` at ${fmtTime(next.start)}`}`);
    } else {
      lines.push("Nothing on the calendar today");
    }
    if (due.length) lines.push(dueLine(due, (t) => (untilLabel(t, now) === "now" ? "now" : `in ${untilLabel(t, now)}`)));
    if (open.length) lines.push(`${plural(open.length, "open task")}, first: “${clip(open[0].title, 24)}”`);
    const free = await longestFree(new Date());
    if (free) lines.push(`Best free stretch: ${free}`);
    const hour = new Date().getHours();
    return { greeting: hour < 12 ? "Good morning!" : "Hello!", lines };
  }

  // evening: look ahead to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const t0 = startOfDay(tomorrow);
  const evs = (await eventsRange(t0, t0 + 86400)).filter((e) => e.kind === "event");
  const due = (await eventsRange(now, now + 2 * 86400)).filter((e) => e.kind === "deadline");
  const lines: string[] = [];
  if (evs.length) {
    const first = evs.find((e) => !e.all_day) ?? evs[0];
    lines.push(`Tomorrow: ${plural(evs.length, "event")}, first ${clip(first.title, 24)}${first.all_day ? "" : ` at ${fmtTime(first.start)}`}`);
  } else {
    lines.push("Tomorrow is clear");
  }
  if (due.length) lines.push(dueLine(due, weekday));
  lines.push(open.length ? `Still open: ${plural(open.length, "task")}, first: “${clip(open[0].title, 24)}”` : "All tasks done. Nicely finished!");
  if (new Date().getDay() === 0) return { greeting: "Sunday night", lines: [...(await weekLines()), ...lines.slice(0, 1), ...lines.slice(-1)] };
  return { greeting: "Winding down", lines };
}

export const briefingText = (b: Briefing) => `${b.greeting}\n${b.lines.map((l) => `• ${l}`).join("\n")}`;
