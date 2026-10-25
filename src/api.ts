import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { PET_IDS, PetId } from "./pets";
import { isLateNight, lateLine } from "./wellbeing/night";

export interface CalEvent {
  id: string; source: string; title: string; start: number; end: number;
  all_day: boolean; location: string; link: string; kind: "event" | "deadline";
}
/** A to-do item; `done_at` keeps today's ticked-off tasks visible (struck through). */
export interface Task { id: number; title: string; due: number | null; done: boolean; created: number; done_at: number | null }
export interface Memory { id: number; fact: string; created: number }
export interface Feed { id: string; name: string; url: string; kind: string }
export interface Area { x: number; y: number; w: number; h: number }
export interface Screen { work: Area; tray: { x: number; y: number } }

export const kvGet = (key: string) => invoke<string | null>("kv_get", { key });
export const kvSet = (key: string, value: string | null) => invoke<void>("kv_set", { key, value });

export const getPetId = async (): Promise<PetId> => {
  const v = await kvGet("pet_id");
  return (PET_IDS as string[]).includes(v ?? "") ? (v as PetId) : "ghost";
};
export const setPetId = async (id: PetId) => {
  await kvSet("pet_id", id);
  await emitTo("pet", "pet-changed", id);
  await emitTo("panel", "pet-changed", id);
};

export interface NewEvent { title: string; start: number; end: number; allDay: boolean; location?: string; description?: string }
/** Creates the event on the signed-in Google account's primary calendar. */
export const addCalendarEvent = (e: NewEvent) =>
  invoke<CalEvent>("google_add_event", {
    event: { title: e.title, start: e.start, end: e.end, all_day: e.allDay, location: e.location ?? null, description: e.description ?? null },
  });

export const eventsRange = (from: number, to: number) => invoke<CalEvent[]>("events_range", { from, to });
export const refreshEvents = () => invoke<void>("refresh_events");
export const tasks = {
  add: (title: string, due?: number | null) => invoke<Task>("task_add", { title, due: due ?? null }),
  list: (includeDone = false) => invoke<Task[]>("task_list", { includeDone }),
  done: (id: number, done: boolean) => invoke<void>("task_done", { id, done }),
  remove: (id: number) => invoke<void>("task_delete", { id }),
};
export const memories = {
  add: (fact: string) => invoke<void>("memory_add", { fact }),
  list: (query: string | null, limit = 10) => invoke<Memory[]>("memory_list", { query, limit }),
};

export const nowSec = () => Math.floor(Date.now() / 1000);
export const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return Math.floor(x.getTime() / 1000); };
export const fmtTime = (s: number) => new Date(s * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
export const fmtDay = (s: number) => new Date(s * 1000).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

export function untilLabel(start: number, now = nowSec()) {
  const m = Math.round((start - now) / 60);
  if (m <= 0) return "now";
  if (m < 60) return `${m}m`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

export async function upcoming(limit = 3): Promise<CalEvent[]> {
  const now = nowSec();
  const evs = await eventsRange(now, now + 14 * 86400);
  return evs.filter((e) => e.start >= now - 300 && !(e.all_day && e.start < startOfDay())).slice(0, limit);
}

export async function greeting(): Promise<string> {
  const now = new Date();
  if (isLateNight(now)) return lateLine(now);
  const day = startOfDay(now);
  const evs = (await eventsRange(day, day + 86400)).filter((e) => e.end > nowSec());
  const open = (await tasks.list()).length;
  const part = now.getHours() < 12 ? "Morning" : now.getHours() < 18 ? "Afternoon" : "Evening";
  if (!evs.length) return `${part}! Nothing on the calendar today${open ? `, but ${open} task${open > 1 ? "s" : ""} waiting` : ""}.`;
  const next = evs.find((e) => !e.all_day) ?? evs[0];
  const when = next.all_day ? "today" : `at ${fmtTime(next.start)}`;
  return `${part}! ${evs.length} thing${evs.length > 1 ? "s" : ""} today — next up: ${next.title} ${when}.`;
}
