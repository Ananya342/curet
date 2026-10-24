import { eventsRange, fmtDay, fmtTime, nowSec, startOfDay, tasks, untilLabel } from "../api";
import { runTool } from "../ai/tools";

export type BriefingKind = "morning" | "evening";
export interface Briefing { greeting: string; lines: string[] }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const clip = (s: string, n = 34) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

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

export async function composeBriefing(kind: BriefingKind): Promise<Briefing> {
  const now = nowSec();
  const open = await tasks.list();

  if (kind === "morning") {
    const day = startOfDay();
    const evs = (await eventsRange(day, day + 86400)).filter((e) => e.kind === "event" && e.end > now);
    const due = (await eventsRange(now, now + 2 * 86400)).filter((e) => e.kind === "deadline");
    const lines: string[] = [];
    if (evs.length) {
      const next = evs.find((e) => !e.all_day) ?? evs[0];
      lines.push(`${plural(evs.length, "event")} today. Next: ${clip(next.title)}${next.all_day ? "" : ` at ${fmtTime(next.start)}`}`);
    } else {
      lines.push("Nothing on the calendar today");
    }
    for (const d of due.slice(0, 2)) lines.push(`Due ${untilLabel(d.start, now) === "now" ? "now" : `in ${untilLabel(d.start, now)}`}: ${clip(d.title)}`);
    if (open.length) lines.push(`${plural(open.length, "open task")}${open[0] ? `, starting with “${clip(open[0].title, 28)}”` : ""}`);
    const free = await longestFree(new Date());
    if (free) lines.push(`Best free stretch: ${free}`);
    const hour = new Date().getHours();
    return { greeting: hour < 12 ? "Good morning! ☀️" : "Hello! ☀️", lines };
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
    lines.push(`Tomorrow: ${plural(evs.length, "event")}, starting with ${clip(first.title)}${first.all_day ? "" : ` at ${fmtTime(first.start)}`}`);
  } else {
    lines.push(`Tomorrow (${fmtDay(t0)}) is clear`);
  }
  for (const d of due.slice(0, 2)) lines.push(`Coming up: ${clip(d.title)}, ${fmtDay(d.start)}`);
  lines.push(open.length ? `Still open: ${plural(open.length, "task")} — maybe “${clip(open[0].title, 28)}” first tomorrow` : "All tasks done. Nicely finished!");
  return { greeting: "Winding down 🌙", lines };
}

export const briefingText = (b: Briefing) => `${b.greeting}\n${b.lines.map((l) => `• ${l}`).join("\n")}`;
