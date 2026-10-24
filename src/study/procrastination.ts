import { invoke } from "@tauri-apps/api/core";
import { eventsRange, kvGet, nowSec, tasks } from "../api";
import { deadlineKey, deadlinesDone } from "./plans";

/**
 * Apps that usually mean "not working", by the name macOS shows for them. For browsers, the website of the tab in
 * front is checked against SITES below. Everything is read on this Mac, on demand, and never stored.
 */
const DISTRACTING: Record<string, Kind> = {
  youtube: "watching", netflix: "watching", "prime video": "watching", "disney+": "watching", hulu: "watching",
  max: "watching", tv: "watching", twitch: "watching", crunchyroll: "watching", vlc: "watching", iina: "watching",
  steam: "gaming", "steam helper": "gaming", "epic games launcher": "gaming", "lunar client": "gaming", minecraft: "gaming",
  roblox: "gaming", robloxplayer: "gaming", "league of legends": "gaming", "riot client": "gaming", "battle.net": "gaming",
  valorant: "gaming", fortnite: "gaming", chess: "gaming", games: "gaming", mgba: "gaming",
  instagram: "scrolling", tiktok: "scrolling", x: "scrolling", twitter: "scrolling", reddit: "scrolling",
  facebook: "scrolling", pinterest: "scrolling", threads: "scrolling", bluesky: "scrolling", snapchat: "scrolling",
  discord: "chatting", messenger: "chatting", whatsapp: "chatting", telegram: "chatting", messages: "chatting",
};

type Kind = "watching" | "gaming" | "scrolling" | "chatting";

/** Websites that count, matched on the domain of the browser tab in front (subdomains too, like m.youtube.com). */
const SITES: Record<string, [string, Kind]> = {
  "youtube.com": ["YouTube", "watching"], "netflix.com": ["Netflix", "watching"], "primevideo.com": ["Prime Video", "watching"],
  "disneyplus.com": ["Disney+", "watching"], "hulu.com": ["Hulu", "watching"], "max.com": ["Max", "watching"],
  "twitch.tv": ["Twitch", "watching"], "crunchyroll.com": ["Crunchyroll", "watching"], "kick.com": ["Kick", "watching"],
  "tiktok.com": ["TikTok", "scrolling"], "instagram.com": ["Instagram", "scrolling"], "x.com": ["X", "scrolling"],
  "twitter.com": ["Twitter", "scrolling"], "reddit.com": ["Reddit", "scrolling"], "facebook.com": ["Facebook", "scrolling"],
  "pinterest.com": ["Pinterest", "scrolling"], "threads.net": ["Threads", "scrolling"], "bsky.app": ["Bluesky", "scrolling"],
  "tumblr.com": ["Tumblr", "scrolling"], "9gag.com": ["9GAG", "scrolling"], "snapchat.com": ["Snapchat", "scrolling"],
  "discord.com": ["Discord", "chatting"], "web.whatsapp.com": ["WhatsApp", "chatting"], "messenger.com": ["Messenger", "chatting"],
  "roblox.com": ["Roblox", "gaming"], "chess.com": ["Chess.com", "gaming"], "lichess.org": ["Lichess", "gaming"],
  "poki.com": ["Poki", "gaming"], "coolmathgames.com": ["Coolmath Games", "gaming"], "crazygames.com": ["CrazyGames", "gaming"],
};

export const frontmostApp = () => invoke<string | null>("frontmost_app").catch(() => null);

export const distraction = (app: string | null): Kind | null => (app ? DISTRACTING[app.trim().toLowerCase()] ?? null : null);

const siteMatch = (domain: string) => {
  for (const [d, v] of Object.entries(SITES)) if (domain === d || domain.endsWith(`.${d}`)) return v;
  return null;
};

export interface InFront {
  app: string;
  /** The browser tab's website, when a browser is in front and site checks are on. */
  site?: string;
  /** What to call it ("YouTube"), and what kind of distraction it is; no kind means it's fine. */
  label: string;
  kind: Kind | null;
}

/**
 * What's in front right now: the app, and for a browser the website of its active tab (domain only).
 * Site checks are on unless switched off in Settings; macOS asks once before Curet may read a browser's tab.
 */
export async function inFront(): Promise<InFront | null> {
  const app = await frontmostApp();
  if (!app) return null;
  const appKind = distraction(app);
  if (appKind) return { app, label: app, kind: appKind };
  if ((await kvGet("browser_sites_on")) === "off") return { app, label: app, kind: null };
  const tab = await invoke<[string, string] | null>("active_site").catch(() => null);
  if (!tab || tab[0] !== app) return { app, label: app, kind: null };
  const m = siteMatch(tab[1]);
  return { app, site: tab[1], label: m ? m[0] : tab[1], kind: m ? m[1] : null };
}

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
