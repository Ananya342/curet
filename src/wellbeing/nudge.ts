import { nowSec, tasks } from "../api";
import { freeGaps } from "./gaps";

/** `until` already carries its own preposition, since "before" only reads correctly when there's
 *  a next event to name — a gap running to end of day has nothing to be "before". */
export interface NudgeInfo { minutes: number; until: string; task: string }

const clip = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * A free gap worth mentioning, with something to do in it. `soon` (the default) only matches a
 * gap starting within the next 15 minutes with at least 45 minutes left in it — what the pet
 * proactively nudges about. `preview` (Settings → "Try nudge") drops both timing requirements
 * and just shows the day's longest free stretch, so the feature can be previewed at any time of
 * day without waiting for a real gap to line up.
 */
export async function findNudge(opts: { preview?: boolean } = {}): Promise<NudgeInfo | null> {
  const open = await tasks.list();
  if (!open.length) return null;

  // `from: now` matters here: without it, freeGaps measures from its 8am floor, so a gap
  // spanning 8am-4pm would report "480 min free" to someone checking in at 2pm with 2 left.
  const now = nowSec();
  const gaps = await freeGaps(new Date(), opts.preview ? 15 : 45, now);
  const gap = opts.preview
    ? gaps.reduce<typeof gaps[number] | null>((best, g) => (!best || g.minutes > best.minutes ? g : best), null)
    : gaps.find((g) => g.start - now <= 15 * 60 && g.end - now >= 45 * 60);
  if (!gap) return null;

  const until = gap.nextTitle ? `before your ${clip(gap.nextTitle)}` : "for the rest of the day";
  return { minutes: gap.minutes, until, task: clip(open[0].title) };
}
