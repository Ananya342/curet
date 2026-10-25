import { MutableRefObject, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { eventsRange, kvSet, nowSec } from "../api";
import { weekKey, weekStart } from "./recap";
import { deadlinesMet } from "../study/plans";
import { cleanTitle, fmtPct, gradeWeights, rank } from "../study/grades";

type Action = { label: string; run: () => void };
export interface MindfulCtx {
  modeRef: MutableRefObject<string>;
  say: (text: string, opts?: { ms?: number; actions?: Action[]; rich?: boolean }) => void;
  hush: () => void;
  wakeUp: (o?: { text?: string; sleepy?: boolean }) => Promise<void>;
  fallAsleep: () => Promise<void>;
  /** Close the pet's eyes and count down while you look away. */
  restEyes: (seconds: number) => void;
  openPanel: (tab: string) => void;
  openFocusMenu: () => void;
}

const DAY = 86400;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * Looking after you between study sessions: eye rest after a stretch of screen time, a wind-down nudge late at
 * night, the Sunday recap with its journal prompt, and Monday's heads-up when deadlines bunch up.
 * Rust decides *when* (see wellbeing.rs); this decides what the pet says.
 */
export function useMindful(c: MindfulCtx) {
  const ctx = useRef(c);
  ctx.current = c;

  useEffect(() => {
    const away = () => ["hidden", "hiding", "waking", "dragged", "tossed"].includes(ctx.current.modeRef.current);
    const rouse = async () => { if (ctx.current.modeRef.current === "sleeping") await ctx.current.wakeUp({ text: "", sleepy: true }); };

    const eyeBreak = () => {
      if (away()) return;
      ctx.current.restEyes(30);
    };

    const lateNight = async () => {
      if (away()) return;
      await rouse();
      const { say, hush, fallAsleep } = ctx.current;
      say("It's getting late. Your brain does its best filing while you sleep. Wind down soon?", {
        ms: 20000,
        actions: [
          { label: "Good night", run: () => { hush(); say("Sleep well.", { ms: 1800 }); window.setTimeout(() => fallAsleep(), 1900); } },
          { label: "10 more min", run: hush },
        ],
      });
    };

    const recap = async (week: string, preview = false) => {
      if (!preview && away()) return; // Rust asks again on its next tick
      if (!preview) await kvSet("last_recap", week);
      await rouse();
      const { say, hush, openPanel } = ctx.current;
      const d = await deadlinesMet(weekStart(), nowSec());
      const score = d.total ? `\n${d.total} ${d.total === 1 ? "deadline" : "deadlines"}, ${d.met} met${d.met === d.total ? ", every one" : ""}` : "";
      say(`Your week in review is ready.${score}\nAnd one small question to reflect on.`, {
        ms: 30000,
        actions: [
          { label: "See my week", run: () => { hush(); openPanel("week"); } },
          { label: "Later", run: hush },
        ],
      });
    };

    const weekAhead = async (week: string, preview = false) => {
      if (!preview && away()) return;
      if (!preview) await kvSet("last_week_ahead", week);
      const now = nowSec();
      const due = (await eventsRange(now, now + 7 * DAY)).filter((e) => e.kind === "deadline");
      const byDay = new Map<string, number>();
      for (const e of due) {
        const d = new Date(e.start * 1000).toLocaleDateString([], { weekday: "long" });
        byDay.set(d, (byDay.get(d) ?? 0) + 1);
      }
      const [busiest, n] = [...byDay].reduce<[string, number]>((a, b) => (b[1] > a[1] ? b : a), ["", 0]);
      // The week's top pick by the planning formula (grade weight ÷ days left), when a syllabus gave weights.
      const top = rank(due, await gradeWeights(), now).find((r) => r.weight.known);
      const big = top && top.weight.weight >= 10
        ? `${cleanTitle(top.event.title)} is the big one: ${fmtPct(top.weight.weight)} of your grade, due ${new Date(top.event.start * 1000).toLocaleDateString([], { weekday: "long" })}.`
        : "";
      let text = "";
      if (n >= 3) text = `${plural(n, "thing")} due ${busiest}.${big ? `\n${big}` : ""} Want to start ${big ? "it" : "one"} today?`;
      else if (due.length >= 5) text = `${plural(due.length, "deadline")} this week.${big ? `\n${big}` : ""} Want to start ${big ? "it" : "one"} today?`;
      else if (big) text = `${big} Want to start it today?`;
      else if (preview) text = due.length ? `A lighter week: ${plural(due.length, "deadline")} coming up. Nice pacing!` : "Nothing due this week. Enjoy the breathing room.";
      if (!text) return;
      await rouse();
      const { say, hush, openPanel, openFocusMenu } = ctx.current;
      say(text, {
        ms: 30000,
        rich: text.includes("\n"),
        actions: n >= 3 || due.length >= 5 || big
          ? [
              { label: "Start focus", run: () => { hush(); openFocusMenu(); } },
              { label: "Plan in Today", run: () => { hush(); openPanel("today"); } },
              { label: "Later", run: hush },
            ]
          : [{ label: "Thanks!", run: hush }],
      });
    };

    const un = [
      listen("eye-break", eyeBreak),
      listen("late-night", lateNight),
      listen<{ week: string }>("weekly-recap", (e) => recap(e.payload.week)),
      listen<{ week: string }>("week-ahead", (e) => weekAhead(e.payload.week)),
      // Settings → "Try it" buttons.
      listen<{ type: "eyes" | "late" | "recap" | "week" }>("mindful-preview", (e) => {
        const t = e.payload.type;
        if (t === "eyes") ctx.current.restEyes(30);
        else if (t === "late") lateNight();
        else if (t === "recap") recap(weekKey(), true);
        else weekAhead(weekKey(), true);
      }),
    ];
    return () => un.forEach((p) => p.then((f) => f()));
  }, []);
}
