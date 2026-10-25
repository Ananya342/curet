import { invoke } from "@tauri-apps/api/core";
import { CalEvent, Feed, eventsRange, fmtDay, fmtTime, kvGet, memories, nowSec, startOfDay, tasks, untilLabel } from "../api";
import { getOutfit } from "../accessories";
import { PETS, PetId } from "../pets";
import { DAY_NAMES, fmtMinutes, journal, weekRecap, weekStart } from "../wellbeing/recap";
import { getFocusUntil, minutesLeft } from "../wellbeing/focus";
import { cleanTitle, courseOf } from "../study/titles";
import { deadlineKey, deadlinesDone, studyPlans } from "../study/plans";

const DAY = 86400;

export { cleanTitle };

const when = (e: CalEvent) => (e.all_day ? `${fmtDay(e.start)} (all day)` : `${fmtDay(e.start)} ${fmtTime(e.start)}`);
const courseTag = (e: CalEvent) => (courseOf(e.location) ? ` (${courseOf(e.location)})` : "");
const eventLine = (e: CalEvent) =>
  e.kind === "deadline"
    ? `- [DEADLINE] ${cleanTitle(e.title)}${courseTag(e)} — due ${when(e)}`
    : `- ${e.title} — ${e.all_day ? when(e) : `${fmtDay(e.start)} ${fmtTime(e.start)}–${fmtTime(e.end)}`}${e.location ? ` @ ${e.location}` : ""}`;
const deadlineLine = (e: CalEvent, now: number, done: Record<string, number>) =>
  `- ${cleanTitle(e.title)}${courseTag(e)} — due ${when(e)}${e.start > now ? ` (in ${untilLabel(e.start, now)})` : ""}${done[deadlineKey(e)] ? " — DONE (ticked off)" : ""}`;

/** "08:30" → "8:30 AM"; anything else ("off") → "off". */
const clock = (v: string | null, fallback: string) => {
  const s = v ?? fallback;
  if (!/^\d{1,2}:\d{2}$/.test(s)) return "off";
  const [h, m] = s.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};
const every = (v: string | null, fallback: string) => {
  const n = Number(v ?? fallback);
  return n > 0 ? `every ${n} min` : "off";
};
const onOff = (v: string | null, defaultOn: boolean) => ((v == null ? defaultOn : v !== "off") ? "on" : "off");

/**
 * Everything Curet knows, written out for the chat model: the calendar, every upcoming deadline, tasks, this
 * week's focus and recap, focus mode, the pet, connected calendars and settings. Journal entries stay out:
 * they are private, and the read_journal tool fetches them only when the user asks.
 */
export async function appSnapshot(petId: PetId): Promise<string> {
  const now = nowSec();
  const today = startOfDay();
  const monday = weekStart();
  const [cal, all, open, mem, recap, focusUntil, outfit, feeds, google, entries, kv, done, plans] = await Promise.all([
    eventsRange(today, today + 3 * DAY),
    eventsRange(Math.min(monday, today), now + 45 * DAY),
    tasks.list(true),
    memories.list(null, 8),
    weekRecap(),
    getFocusUntil(),
    getOutfit(),
    invoke<Feed[]>("feeds_list").catch(() => [] as Feed[]),
    invoke<{ connected: boolean; email: string | null }>("google_status").catch(() => null),
    journal.list(),
    Promise.all(
      ["briefing_morning", "briefing_evening", "break_every", "eye_every", "late_nudge", "recap_on", "week_ahead_on", "nudges_on", "wander_on", "voice_on"]
        .map(async (k) => [k, await kvGet(k)] as const),
    ).then(Object.fromEntries) as Promise<Record<string, string | null>>,
    deadlinesDone(),
    studyPlans(),
  ]);

  const deadlines = all.filter((e) => e.kind === "deadline");
  const ahead = deadlines.filter((e) => e.start > now);
  const gotThrough = deadlines.filter((e) => e.start >= monday && e.start <= now);
  const openTasks = open.filter((t) => !t.done);
  const doneThisWeek = open.filter((t) => t.done && (t.done_at ?? 0) >= monday);
  const pet = PETS[petId];
  const wearing = [
    outfit.hat.on && `a ${outfit.hat.style} hat`, outfit.cap.on && "a cap", outfit.glasses.on && `${outfit.glasses.style} glasses`,
    outfit.collar.on && `a collar with a ${outfit.collar.tag} tag`, outfit.shine.on && "shine",
  ].filter(Boolean);

  const taskLine = (t: (typeof open)[number]) =>
    `- #${t.id} ${t.title}${t.due ? ` (due ${fmtDay(t.due)}${t.due < now ? ", OVERDUE" : ""})` : ""}`;

  return `Now: ${new Date().toLocaleString([], { dateStyle: "full", timeStyle: "short" })} (${Intl.DateTimeFormat().resolvedOptions().timeZone}).

## Calendar, next 3 days (complete)
${cal.length ? cal.slice(0, 40).map(eventLine).join("\n") : "(nothing on the calendar)"}

## Deadlines coming up, next 45 days (complete, soonest first)
${ahead.length ? ahead.slice(0, 50).map((e) => deadlineLine(e, now, done)).join("\n") : "(no upcoming deadlines)"}

## Study blocks booked
${plans.filter((p) => p.end > now && p.status !== "skipped").map((p) => `- ${fmtDay(p.start)} ${fmtTime(p.start)}–${fmtTime(p.end)} for ${cleanTitle(p.title)}`).join("\n") || "(none)"}

## Deadlines already passed this week
${gotThrough.length ? gotThrough.map((e) => deadlineLine(e, now, done)).join("\n") : "(none)"}

## To-do list (open)
${openTasks.length ? openTasks.map(taskLine).join("\n") : "(no open tasks)"}

## Tasks ticked off this week
${doneThisWeek.length ? doneThisWeek.map((t) => `- ${t.title}`).join("\n") : "(none yet)"}

## This week so far (the Week tab)
- Focused ${fmtMinutes(recap.total)} this week, ${fmtMinutes(recap.lastWeek)} last week.
- Per day: ${recap.days.map((m, i) => `${DAY_NAMES[i]} ${fmtMinutes(m)}`).join(", ")}.
- ${recap.sessions} focus sessions (${recap.finished} finished)${recap.longest ? `, longest ${fmtMinutes(recap.longest.minutes)} on ${DAY_NAMES[recap.longest.day]}` : ""}${recap.best ? `, best day ${DAY_NAMES[recap.best.day]}` : ""}.
- Focus streak: ${recap.streak} day${recap.streak === 1 ? "" : "s"} in a row.
- Deadlines got through: ${recap.deadlinesPast}. Due in the next 7 days: ${recap.deadlinesAhead}. Tasks ticked off: ${recap.tasksDone}. Late nights: ${recap.lateNights}.

## Focus mode
${focusUntil ? `On: locked in until ${fmtTime(focusUntil)} (${minutesLeft(focusUntil)} min left). Reminders are held until it ends.` : "Off."}

## The pet
You are ${pet.name}. The user can switch to any of: ${Object.values(PETS).map((p) => p.name).join(", ")} (Pets tab).
Wearing: ${wearing.length ? wearing.join(", ") : "nothing"}.

## Connected calendars
- Google Calendar: ${google?.connected ? `signed in${google.email ? ` as ${google.email}` : ""}` : "not connected"}.
${feeds.length ? feeds.map((f) => `- ${f.name} (${f.kind === "brightspace" ? "Brightspace deadlines" : "calendar feed"})`).join("\n") : "- No calendar links added."}

## Settings
- Morning briefing: ${clock(kv.briefing_morning, "08:30")}. Evening briefing: ${clock(kv.briefing_evening, "20:00")}.
- Break reminder: ${every(kv.break_every, "50")}. Rest your eyes: ${every(kv.eye_every, "20")}.
- Late-night wind-down: ${onOff(kv.late_nudge, true)}. Sunday recap: ${onOff(kv.recap_on, true)}. Monday heads-up: ${onOff(kv.week_ahead_on, true)}.
- Free-time nudges: ${onOff(kv.nudges_on, true)}. Wandering around the screen: ${kv.wander_on === "on" ? "on" : "off"}. Spoken replies: ${onOff(kv.voice_on, true)}.

## Weekly journal
${entries.filter((e) => e.text).length} saved entr${entries.filter((e) => e.text).length === 1 ? "y" : "ies"}. Private: call read_journal only when the user asks about their journal or reflections.

## What you remember about the user
${mem.length ? mem.map((m) => `- ${m.fact}`).join("\n") : "(nothing yet)"}`;
}

/** The app itself, so questions like "how do I focus?" get a real answer. */
export const APP_GUIDE = `How Curet works (use this to answer questions about the app):
- The pet lives on the desktop. Double-click it for its menu: Chat, Today, Focus, Pets, Tuck in, Sleep, Settings. Drag it anywhere; it sleeps when left alone.
- The menu bar icon opens a quick glance at what's next, with Wake/Tuck in, Chat and Pets.
- Tabs in this pop-up: Chat (you), Today (calendar, coming deadlines and exams for 7 days, upload a syllabus, add an event, to-do list), Week (focus time per day, deadlines got through, due in the next 7 days, tasks ticked off, weekly journal), Pets (pick a pet, dress it up), Settings (Brightspace link, Google Calendar, daily rhythm, Gemini key, voice).
- Focus mode: from the pet's menu choose Focus, then 25, 50 or 90 min. The pet works on a tiny laptop and holds reminders until the block ends.
- Briefings arrive morning and evening; Sunday evening adds a week preview and recap; Monday morning warns about bunched-up deadlines.
- Option-Command-L tucks the pet into the menu bar and brings it back.`;

export const journalEntries = async (limit = 5) =>
  (await journal.list()).filter((e) => e.text).slice(0, limit).map((e) => ({ week: e.week, prompt: e.prompt, wrote: e.text }));
