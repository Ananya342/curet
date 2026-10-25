import { Type } from "@google/genai";
import { emitTo } from "@tauri-apps/api/event";
import { addCalendarEvent, eventsRange, memories, nowSec, startOfDay, tasks } from "../api";
import { freeGaps } from "../wellbeing/gaps";
import { getFocusUntil } from "../wellbeing/focus";
import { cleanTitle, journalEntries } from "./snapshot";

export const declarations = [
  {
    name: "get_events",
    description: "List the user's calendar events and deadlines between two local dates (inclusive).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        start_date: { type: Type.STRING, description: "First day, YYYY-MM-DD in the user's local time" },
        end_date: { type: Type.STRING, description: "Last day, YYYY-MM-DD. Defaults to start_date." },
      },
      required: ["start_date"],
    },
  },
  {
    name: "get_deadlines",
    description: "List deadlines (assignments, quizzes, exams due) between two local dates. Use for dates outside the deadlines already listed.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        start_date: { type: Type.STRING, description: "First day, YYYY-MM-DD. Defaults to today." },
        end_date: { type: Type.STRING, description: "Last day, YYYY-MM-DD. Defaults to 90 days after start_date." },
      },
    },
  },
  {
    name: "find_free_time",
    description: "Find gaps between events on a given local day, between 8am and 10pm.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING, description: "YYYY-MM-DD in the user's local time" },
        min_minutes: { type: Type.NUMBER, description: "Minimum gap length. Default 30." },
      },
      required: ["date"],
    },
  },
  {
    name: "add_calendar_event",
    description: "Add an event to the user's Google Calendar. Only call this when the user clearly asks to schedule or add something to their calendar.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        start: { type: Type.STRING, description: "Local start time as YYYY-MM-DDTHH:MM, or just YYYY-MM-DD for an all-day event" },
        duration_minutes: { type: Type.NUMBER, description: "Length in minutes. Default 60." },
        all_day: { type: Type.BOOLEAN },
        location: { type: Type.STRING },
        description: { type: Type.STRING },
      },
      required: ["title", "start"],
    },
  },
  {
    name: "add_task",
    description: "Add a to-do item for the user.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        due_date: { type: Type.STRING, description: "Optional due date, YYYY-MM-DD" },
      },
      required: ["title"],
    },
  },
  {
    name: "list_tasks",
    description: "List the user's to-do items.",
    parameters: { type: Type.OBJECT, properties: { include_done: { type: Type.BOOLEAN, description: "Also list ticked-off tasks. Default false." } } },
  },
  {
    name: "complete_task",
    description: "Mark a to-do item as done, by id or by (part of) its title.",
    parameters: {
      type: Type.OBJECT,
      properties: { id: { type: Type.NUMBER }, title: { type: Type.STRING } },
    },
  },
  {
    name: "remember",
    description: "Save a lasting fact about the user (preferences, goals, projects, routines) for future conversations.",
    parameters: { type: Type.OBJECT, properties: { fact: { type: Type.STRING } }, required: ["fact"] },
  },
  {
    name: "read_journal",
    description: "Read the user's private weekly journal entries, newest first. Only when the user asks about their journal or reflections.",
    parameters: { type: Type.OBJECT, properties: { limit: { type: Type.NUMBER, description: "How many entries. Default 5." } } },
  },
  {
    name: "start_focus",
    description: "Start a focus block: the pet locks in and holds reminders until it ends.",
    parameters: { type: Type.OBJECT, properties: { minutes: { type: Type.NUMBER, description: "Length in minutes. Default 25." } } },
  },
  { name: "end_focus", description: "End the current focus block early.", parameters: { type: Type.OBJECT, properties: {} } },
  {
    name: "recall",
    description: "Search saved memories about the user.",
    parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ["query"] },
  },
];

const parseDay = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const local = (s: number) => new Date(s * 1000).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export async function runTool(name: string, args: Record<string, any>): Promise<unknown> {
  switch (name) {
    case "get_events": {
      const from = startOfDay(parseDay(args.start_date));
      const to = startOfDay(parseDay(args.end_date || args.start_date)) + 86400;
      const evs = await eventsRange(from, to);
      return evs.slice(0, 60).map((e) => ({
        title: e.title, kind: e.kind, all_day: e.all_day,
        starts: e.all_day ? new Date(e.start * 1000).toDateString() : local(e.start),
        ends: e.all_day ? undefined : local(e.end), link: e.link || undefined, where: e.location || undefined,
      }));
    }
    case "get_deadlines": {
      const from = args.start_date ? startOfDay(parseDay(args.start_date)) : startOfDay();
      const to = args.end_date ? startOfDay(parseDay(args.end_date)) + 86400 : from + 90 * 86400;
      const evs = (await eventsRange(from, to)).filter((e) => e.kind === "deadline");
      return evs.slice(0, 80).map((e) => ({ title: cleanTitle(e.title), due: e.all_day ? new Date(e.start * 1000).toDateString() : local(e.start), link: e.link || undefined }));
    }
    case "find_free_time": {
      const day = parseDay(args.date);
      const floor = startOfDay(day) === startOfDay() ? nowSec() : undefined;
      const gaps = await freeGaps(day, args.min_minutes ?? 30, floor);
      const t = (s: number) => new Date(s * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      return gaps.map((g) => ({ from: t(g.start), to: t(g.end), minutes: g.minutes }));
    }
    case "add_calendar_event": {
      const allDay = Boolean(args.all_day) || String(args.start).length <= 10;
      const startTs = allDay ? startOfDay(parseDay(String(args.start).slice(0, 10))) : Math.floor(new Date(args.start).getTime() / 1000);
      if (!Number.isFinite(startTs)) return { error: "Couldn't understand that start time." };
      const endTs = allDay ? startTs : startTs + Math.max(5, Number(args.duration_minutes) || 60) * 60;
      const ev = await addCalendarEvent({ title: args.title, start: startTs, end: endTs, allDay, location: args.location, description: args.description });
      await emitTo("pet", "celebrate", null);
      return { added: ev.title, when: ev.all_day ? new Date(ev.start * 1000).toDateString() : local(ev.start), link: ev.link || undefined };
    }
    case "add_task": {
      const due = args.due_date ? startOfDay(parseDay(args.due_date)) + 86399 : null;
      return await tasks.add(args.title, due);
    }
    case "list_tasks":
      return (await tasks.list(Boolean(args.include_done))).map((t) => ({ id: t.id, title: t.title, due: t.due ? local(t.due) : null, done: t.done }));
    case "complete_task": {
      const open = await tasks.list();
      const t = args.id != null
        ? open.find((x) => x.id === Number(args.id))
        : open.find((x) => x.title.toLowerCase().includes(String(args.title ?? "").toLowerCase()));
      if (!t) return { error: "No matching open task" };
      await tasks.done(t.id, true);
      await emitTo("pet", "celebrate", null);
      return { completed: t.title };
    }
    case "remember":
      await memories.add(args.fact);
      return { saved: true };
    case "read_journal":
      return await journalEntries(Math.max(1, Math.min(20, Number(args.limit) || 5)));
    case "start_focus": {
      if (await getFocusUntil()) return { error: "Already focusing." };
      const minutes = Math.max(5, Math.min(180, Math.round(Number(args.minutes) || 25)));
      await emitTo("pet", "focus-request", { minutes });
      return { started: true, minutes };
    }
    case "end_focus":
      if (!(await getFocusUntil())) return { error: "Not focusing right now." };
      await emitTo("pet", "focus-request", { minutes: 0 });
      return { ended: true };
    case "recall":
      return (await memories.list(args.query, 10)).map((m) => m.fact);
    default:
      return { error: `unknown tool ${name}` };
  }
}
