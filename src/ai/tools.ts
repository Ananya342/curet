import { Type } from "@google/genai";
import { emitTo } from "@tauri-apps/api/event";
import { eventsRange, memories, nowSec, startOfDay, tasks } from "../api";

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
  { name: "list_tasks", description: "List the user's open to-do items.", parameters: { type: Type.OBJECT, properties: {} } },
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
    case "find_free_time": {
      const day = parseDay(args.date);
      const min = (args.min_minutes ?? 30) * 60;
      const dayStart = startOfDay(day);
      let cursor = Math.max(dayStart + 8 * 3600, dayStart === startOfDay() ? nowSec() : 0);
      const end = dayStart + 22 * 3600;
      const busy = (await eventsRange(dayStart, dayStart + 86400))
        .filter((e) => !e.all_day && e.end > e.start)
        .sort((a, b) => a.start - b.start);
      const free: { from: string; to: string; minutes: number }[] = [];
      const t = (s: number) => new Date(s * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      for (const e of busy) {
        if (e.start - cursor >= min) free.push({ from: t(cursor), to: t(e.start), minutes: Math.round((e.start - cursor) / 60) });
        cursor = Math.max(cursor, e.end);
      }
      if (end - cursor >= min) free.push({ from: t(cursor), to: t(end), minutes: Math.round((end - cursor) / 60) });
      return free;
    }
    case "add_task": {
      const due = args.due_date ? startOfDay(parseDay(args.due_date)) + 86399 : null;
      return await tasks.add(args.title, due);
    }
    case "list_tasks":
      return (await tasks.list()).map((t) => ({ id: t.id, title: t.title, due: t.due ? local(t.due) : null }));
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
    case "recall":
      return (await memories.list(args.query, 10)).map((m) => m.fact);
    default:
      return { error: `unknown tool ${name}` };
  }
}
