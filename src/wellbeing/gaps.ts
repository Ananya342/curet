import { eventsRange, startOfDay } from "../api";

export interface Gap {
  start: number;
  end: number;
  minutes: number;
  /** Title of the event right after this gap, if any (the day just ends after the last one). */
  nextTitle?: string;
}

/**
 * Free gaps of at least `minMinutes` on the given day, from `from` onward (default: the day's
 * 8am floor, or now if later). Shared by the `find_free_time` tool and the wellbeing nudge, so
 * both agree on what counts as "free" — between 8am and 10pm, excluding all-day/zero-length events.
 */
export async function freeGaps(day: Date, minMinutes: number, from?: number): Promise<Gap[]> {
  const dayStart = startOfDay(day);
  const min = minMinutes * 60;
  const floor = from ?? dayStart + 8 * 3600;
  let cursor = Math.max(dayStart + 8 * 3600, floor);
  const end = dayStart + 22 * 3600;
  const busy = (await eventsRange(dayStart, dayStart + 86400))
    .filter((e) => !e.all_day && e.end > e.start)
    .sort((a, b) => a.start - b.start);

  const gaps: Gap[] = [];
  for (const e of busy) {
    if (e.start >= end) break; // after 10pm: the free time stops at 10 either way
    if (e.start - cursor >= min) gaps.push({ start: cursor, end: e.start, minutes: Math.round((e.start - cursor) / 60), nextTitle: e.title });
    cursor = Math.max(cursor, e.end);
  }
  if (end - cursor >= min) gaps.push({ start: cursor, end, minutes: Math.round((end - cursor) / 60) });
  return gaps;
}
