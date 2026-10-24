import { invoke } from "@tauri-apps/api/core";
import { eventsRange, nowSec, tasks } from "../api";
import { deadlineKey, deadlinesDone } from "./plans";

/**
 * Apps that usually mean "not working", by the name macOS shows for them. Only the frontmost app's name is
 * read, on this Mac, and it's never stored. A browser counts only when a site is installed as its own app
 * (Safari/Chrome "Add to Dock"), which is how YouTube or Netflix show up by name.
 */
const DISTRACTING: Record<string, "watching" | "gaming" | "scrolling" | "chatting"> = {
  youtube: "watching", netflix: "watching", "prime video": "watching", "disney+": "watching", hulu: "watching",
  max: "watching", tv: "watching", twitch: "watching", crunchyroll: "watching", vlc: "watching", iina: "watching",
  steam: "gaming", "steam helper": "gaming", "epic games launcher": "gaming", "lunar client": "gaming", minecraft: "gaming",
  roblox: "gaming", robloxplayer: "gaming", "league of legends": "gaming", "riot client": "gaming", "battle.net": "gaming",
  valorant: "gaming", fortnite: "gaming", chess: "gaming", games: "gaming", mgba: "gaming",
  instagram: "scrolling", tiktok: "scrolling", x: "scrolling", twitter: "scrolling", reddit: "scrolling",
  facebook: "scrolling", pinterest: "scrolling", threads: "scrolling", bluesky: "scrolling", snapchat: "scrolling",
  discord: "chatting", messenger: "chatting", whatsapp: "chatting", telegram: "chatting", messages: "chatting",
};

export const frontmostApp = () => invoke<string | null>("frontmost_app").catch(() => null);

export const distraction = (app: string | null) => (app ? DISTRACTING[app.trim().toLowerCase()] ?? null : null);

/** The most pressing unfinished thing in the next `hours`: a deadline you haven't ticked off, or a due to-do. */
export async function nextUnfinished(hours = 24): Promise<{ title: string; due: number } | null> {
  const now = nowSec();
  const [evs, done, open] = await Promise.all([eventsRange(now, now + hours * 3600), deadlinesDone(), tasks.list()]);
  const items = [
    ...evs.filter((e) => e.kind === "deadline" && !done[deadlineKey(e)]).map((e) => ({ title: e.title, due: e.start })),
    ...open.filter((t) => t.due && t.due > now && t.due - now < hours * 3600).map((t) => ({ title: t.title, due: t.due! })),
  ];
  return items.sort((a, b) => a.due - b.due)[0] ?? null;
}

/** "3h", "40 min", "tomorrow". */
export function inWords(due: number) {
  const m = Math.round((due - nowSec()) / 60);
  if (m < 60) return `${Math.max(1, m)} min`;
  if (m < 20 * 60) return `${Math.round(m / 60)}h`;
  return "a day";
}
