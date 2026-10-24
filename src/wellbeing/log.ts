import { kvGet, kvSet, nowSec } from "../api";

/** A finished or ended-early focus block, in unix seconds. */
export interface FocusSession { from: number; to: number; done: boolean }

export async function readList<T>(key: string): Promise<T[]> {
  try { return JSON.parse((await kvGet(key)) ?? "[]") as T[]; } catch { return []; }
}

const KEEP = 70 * 86400; // ten weeks is plenty for "this week vs last week"

/** Record a focus block for the weekly recap. */
export async function logFocus(s: FocusSession) {
  if (s.to - s.from < 60) return; // started and stopped straight away
  const list = (await readList<FocusSession>("focus_log")).filter((x) => nowSec() - x.to < KEEP);
  list.push(s);
  await kvSet("focus_log", JSON.stringify(list));
}
