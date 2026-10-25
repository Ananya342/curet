import { MutableRefObject, useCallback, useEffect, useRef } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CalEvent, eventsRange, kvGet, kvSet, nowSec } from "../api";
import { markSubmitAsked, unaskedPastDeadline } from "./mood";
import { inFront, inWords, nextUnfinished } from "./procrastination";
import { FOCUS_CHOICES } from "../wellbeing/focus";
import {
  Proposal, StudyPlan, acceptProposal, blockStartingNow, dayWord, deadlineKey, markAsked, nextProposal, setDeadlineDone, slotFor,
  studyPlans, timeWord, updatePlan,
} from "./plans";
import { cleanTitle, fmtPct } from "./grades";

type Action = { label: string; run: () => void };
export interface StudyCtx {
  modeRef: MutableRefObject<string>;
  say: (text: string, opts?: { ms?: number; actions?: Action[]; rich?: boolean }) => void;
  hush: () => void;
  wakeUp: (o?: { text?: string; sleepy?: boolean }) => Promise<void>;
  beginFocus: (minutes: number) => Promise<void>;
  focusActive: () => boolean;
}

/**
 * The first line of a study offer. With syllabus weights: "“Essay 2”: 20% of your grade, due Sunday 3:15 PM.
 * Quiz 4 is only 2%, so this first." Without them, just when it's due.
 */
function why(p: Proposal) {
  const d = p.deadline, w = p.weight, r = p.runnerUp;
  const title = `“${cleanTitle(d.title)}”`;
  if (!w?.known) return `${title} is due ${dayWord(d.start)} at ${timeWord(d.start)}.`;
  const first = `${title}: ${fmtPct(w.weight)} of your grade, due ${dayWord(d.start)} ${timeWord(d.start)}.`;
  if (!r || r.weight.weight >= w.weight) return first;
  return `${first} ${cleanTitle(r.deadline.title)} is only ${fmtPct(r.weight.weight)}, so this first.`;
}

const OFFER_EVERY = 3 * 3600; // at most one unprompted plan offer every 3 hours
// Procrastination: how long a distracting app has to stay in front before the pet says something, and how long it
// then leaves you alone. During focus it speaks up sooner, since you asked it to keep you on track.
const DISTRACTED_FOR = 2 * 60;
const DISTRACTED_FOR_FOCUS = 30;
const NUDGE_QUIET = 15 * 60;

/**
 * The study loop, from the pet's side:
 *   1. a deadline is coming → it finds a free stretch before it and offers to book a study block;
 *   2. the block starts → it calls you to it and locks in with you;
 *   3. the focus ends → it asks whether you finished, celebrates if so, or finds another slot.
 * The weekly recap then counts the deadlines you met (see plans.ts).
 */
export function useStudy(c: StudyCtx) {
  const ctx = useRef(c);
  ctx.current = c;
  const busy = useRef(false);

  const away = () => ["hidden", "hiding", "waking", "dragged", "tossed"].includes(ctx.current.modeRef.current) || ctx.current.focusActive();
  const rouse = async () => { if (ctx.current.modeRef.current === "sleeping") await ctx.current.wakeUp({ text: "", sleepy: true }); };

  const propose = useCallback(async (p: Proposal) => {
    await rouse();
    const { say, hush } = ctx.current;
    const d = p.deadline;
    say(`${why(p)}\n${p.weight?.known ? "Free" : "You're free"} ${dayWord(p.start)} ${timeWord(p.start)}–${timeWord(p.end)}. ${p.weight?.known ? "Book it for studying?" : "Want me to block it for studying?"}`, {
      ms: 40000,
      rich: true,
      actions: [
        {
          label: "Book it",
          run: async () => {
            hush();
            const r = await acceptProposal(p);
            say(r.onCalendar
              ? `Booked! “Study: ${d.title}” is on your calendar ${dayWord(p.start)} at ${timeWord(p.start)}. I'll come get you.`
              : `Saved. I'll come get you ${dayWord(p.start)} at ${timeWord(p.start)}. Sign in with Google in Settings and I'll put it on your calendar too.`, { ms: 7000 });
          },
        },
        {
          label: "Other time",
          run: async () => {
            hush();
            const next = await slotFor(d, p.end, p.weight);
            if (next) propose(next);
            else { await markAsked(`${d.source}:${d.id}`); say("That was the last free stretch before it's due. I'll keep an eye on it.", { ms: 5000 }); }
          },
        },
        { label: "No thanks", run: () => { hush(); markAsked(`${d.source}:${d.id}`); } },
      ],
    });
  }, []);

  /** A deadline just passed without being ticked off: did it get submitted? "Not yet" leaves the pet sad. */
  const askSubmitted = useCallback(async (e: CalEvent) => {
    await markSubmitAsked(deadlineKey(e));
    await rouse();
    const { say, hush, beginFocus } = ctx.current;
    say(`“${e.title}” was due ${dayWord(e.start)} at ${timeWord(e.start)}. Did you submit it?`, {
      ms: 60000,
      actions: [
        { label: "Yes, submitted", run: async () => { hush(); await setDeadlineDone(deadlineKey(e), true, e.start); say("Phew! Nicely done.", { ms: 3000 }); } },
        {
          label: "Not yet",
          run: () => {
            hush();
            say("Oh no… late is better than never. Want to do it now?", {
              ms: 30000,
              actions: [
                ...(e.link ? [{ label: "Open it", run: () => { hush(); openUrl(e.link).catch(() => {}); } }] : []),
                { label: "Lock in 25 min", run: () => { hush(); beginFocus(25); } },
                { label: "Later", run: hush },
              ],
            });
          },
        },
      ],
    });
  }, []);

  /** Seen in front of a distracting app for a while, with something due: a gentle (and slightly judgy) nudge. */
  const distracted = useRef<{ app: string; since: number } | null>(null);
  const quietUntil = useRef(0);
  const callOut = useCallback(async (app: string, kind: string, preview = false) => {
    const due = await nextUnfinished(24);
    const focusing = ctx.current.focusActive();
    if (!due && !focusing && !preview) return;
    quietUntil.current = nowSec() + NUDGE_QUIET;
    await rouse();
    const { say, hush, beginFocus } = ctx.current;
    const doing = kind === "watching" ? `watching ${app}` : kind === "scrolling" ? `scrolling ${app}` : kind === "chatting" ? `chatting on ${app}` : `on ${app}`;
    const text = focusing
      ? `Hey! We're locked in… and that's ${app}. Just saying.`
      : due
        ? `“${due.title}” is due in ${inWords(due.due)}… and we're ${doing}.`
        : `We're ${doing}… nothing's due soon, so enjoy it!`;
    say(text, {
      ms: 20000,
      actions: [
        ...(focusing ? [] : [{ label: "Lock in 25 min", run: () => { hush(); beginFocus(25); } }]),
        { label: "5 more min", run: () => { hush(); quietUntil.current = nowSec() + 5 * 60; } },
        { label: "It's a break", run: () => { hush(); quietUntil.current = nowSec() + 30 * 60; } },
      ],
    });
  }, []);

  const watchApp = useCallback(async () => {
    if ((await kvGet("procrastination_on")) === "off") return;
    const front = await inFront();
    // Settings shows what was last checked, so it's never a mystery what the pet looks at. Sent, not saved.
    emitTo("panel", "in-front", front ? { ...front, at: nowSec() } : null).catch(() => {});
    const now = nowSec();
    if (!front?.kind) { distracted.current = null; return; }
    const { label: app, kind } = front;
    if (distracted.current?.app !== app) distracted.current = { app, since: now };
    const long = now - distracted.current.since >= (ctx.current.focusActive() ? DISTRACTED_FOR_FOCUS : DISTRACTED_FOR);
    if (!long || now < quietUntil.current) return;
    const mode = ctx.current.modeRef.current;
    if (["hidden", "hiding", "dragged", "tossed", "waking"].includes(mode)) return;
    await callOut(app, kind);
  }, [callOut]);

  /** "Did you finish?" after a study block's focus ends. */
  const askFinished = useCallback(async (plan: StudyPlan) => {
    await rouse();
    const { say, hush } = ctx.current;
    say(`Did you finish “${plan.title}”?`, {
      ms: 60000,
      actions: [
        { label: "Yes, done!", run: async () => { hush(); await updatePlan(plan.key, { status: "done" }); await setDeadlineDone(plan.key, true); } },
        {
          label: "Not yet",
          run: async () => {
            hush();
            await updatePlan(plan.key, { status: "skipped" });
            await markAsked(plan.key, false);
            const next = await nextProposal(plan.key);
            if (next) { say(`No worries, it's due ${dayWord(plan.due)}. Let's find another slot.`, { ms: 3000 }); window.setTimeout(() => propose(next), 3200); }
            else say(`No worries. It's due ${dayWord(plan.due)} at ${timeWord(plan.due)}, and your calendar's full until then, so squeeze it in where you can.`, { ms: 8000 });
          },
        },
      ],
    });
  }, [propose]);

  /** A study block is starting: call the user to it. `force` skips the timing checks (the demo button). */
  const callToBlock = useCallback(async (plan: StudyPlan) => {
    await updatePlan(plan.key, { status: "nudged" });
    await rouse();
    const { say, hush, beginFocus } = ctx.current;
    const left = Math.round((plan.end - Math.max(nowSec(), plan.start)) / 60);
    const minutes = [...FOCUS_CHOICES].reverse().find((m) => m <= Math.max(25, left)) ?? FOCUS_CHOICES[0];
    say(`Study time! Your block for “${plan.title}” starts now. It's due ${dayWord(plan.due)}.`, {
      ms: 120000,
      actions: [
        { label: `Lock in ${minutes} min`, run: async () => { hush(); await kvSet("study_active", plan.key); await beginFocus(minutes); } },
        { label: "Not now", run: () => { hush(); updatePlan(plan.key, { status: "skipped" }); } },
      ],
    });
  }, []);

  /** Called by the focus timer when a session ends. */
  const onFocusEnd = useCallback(async (_completed: boolean, held: number) => {
    const key = await kvGet("study_active");
    if (!key) return;
    await kvSet("study_active", null);
    const plan = (await studyPlans()).find((p) => p.key === key);
    // Let the "focus done" bubble (and any reminders it held) be read first.
    if (plan) window.setTimeout(() => askFinished(plan), held ? 15000 : 4500);
  }, [askFinished]);

  const tick = useCallback(async () => {
    if (busy.current || away()) return;
    busy.current = true;
    try {
      const past = await unaskedPastDeadline();
      if (past) { await askSubmitted(past); return; }
      const block = await blockStartingNow();
      if (block) { await callToBlock(block); return; }
      const last = Number(await kvGet("plan_offer_at")) || 0;
      if (nowSec() - last < OFFER_EVERY || (await kvGet("plans_on")) === "off") return;
      const p = await nextProposal();
      if (!p) return;
      await kvSet("plan_offer_at", String(nowSec()));
      await propose(p);
    } finally {
      busy.current = false;
    }
  }, [askSubmitted, callToBlock, propose]);

  useEffect(() => {
    const un = [
      // Today → "Plan time" on a deadline.
      listen<string>("plan-deadline", async (e) => {
        const p = await nextProposal(e.payload);
        if (p) propose(p);
        else { await rouse(); ctx.current.say("I couldn't find a free hour before that one's due.", { ms: 5000 }); }
      }),
      // Settings → demo buttons, so the whole loop can be shown without waiting for real time.
      listen<{ type: "propose" | "block" | "submit" | "procrastinate" }>("study-preview", async (e) => {
        if (e.payload.type === "procrastinate") {
          const front = await inFront();
          callOut(front?.kind ? front.label : "YouTube", front?.kind ?? "watching", true);
          return;
        }
        if (e.payload.type === "submit") {
          const now = nowSec();
          const past = (await eventsRange(now - 7 * 86400, now)).filter((x) => x.kind === "deadline").pop();
          if (past) askSubmitted(past);
          else { await rouse(); ctx.current.say("No deadlines in the past week to ask about.", { ms: 4000 }); }
          return;
        }
        if (e.payload.type === "propose") {
          const p = await nextProposal();
          if (p) propose(p);
          else { await rouse(); ctx.current.say("No upcoming deadlines to plan for right now.", { ms: 4000 }); }
          return;
        }
        const plans = (await studyPlans()).filter((p) => p.status !== "done").sort((a, b) => a.start - b.start);
        if (plans[0]) callToBlock(plans[0]);
        else { await rouse(); ctx.current.say("No study blocks booked yet. Try “Plan study” first.", { ms: 4000 }); }
      }),
    ];
    const t = window.setInterval(tick, 60_000);
    const w = window.setInterval(watchApp, 20_000);
    const first = window.setTimeout(tick, 20_000);
    return () => { un.forEach((p) => p.then((f) => f())); window.clearInterval(t); window.clearInterval(w); window.clearTimeout(first); };
  }, [askSubmitted, callOut, callToBlock, propose, tick, watchApp]);

  return { onFocusEnd };
}
