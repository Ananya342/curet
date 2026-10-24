import { MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { fmtTime, kvGet, kvSet, nowSec } from "../api";
import { BriefingKind, briefingText, composeBriefing, todayKey } from "./briefing";
import { FOCUS_CHOICES, getFocusUntil, minutesLeft, setFocusUntil } from "./focus";
<<<<<<< Updated upstream
import { logFocus } from "./log";
=======
import { findNudge } from "./nudge";
>>>>>>> Stashed changes

type Action = { label: string; run: () => void };
export interface WellbeingCtx {
  modeRef: MutableRefObject<string>;
  say: (text: string, opts?: { ms?: number; actions?: Action[]; rich?: boolean }) => void;
  hush: () => void;
  lockIn: () => Promise<void>;
  unlock: () => Promise<void>;
  wakeUp: (o?: { text?: string; sleepy?: boolean }) => Promise<void>;
  celebrate: () => Promise<void>;
  openPanel: (tab: string) => void;
}

interface Held { title: string; start: number; kind: string }

/**
 * Briefings, focus mode and break reminders for the pet.
 * Rust decides *when* (see wellbeing.rs); this decides what the pet says and does.
 */
export function useWellbeing(c: WellbeingCtx) {
  const ctx = useRef(c);
  ctx.current = c;
  const focusUntil = useRef(0);
  const [focusing, setFocusing] = useState(false);
  const endTimer = useRef<number>(0);
  const held = useRef<Held[]>([]);
  const busy = useRef(false);

  const unavailable = () => ["hidden", "hiding", "waking", "dragged", "tossed"].includes(ctx.current.modeRef.current);
  const focusActive = () => focusUntil.current > nowSec();

  // ---- focus ------------------------------------------------------------------------------------
  const endFocus = useCallback(async (completed: boolean) => {
    window.clearTimeout(endTimer.current);
    const from = Number(await kvGet("focus_from")) || 0;
    if (from) logFocus({ from, to: completed ? focusUntil.current : nowSec(), done: completed });
    focusUntil.current = 0;
    setFocusing(false);
    await setFocusUntil(0);
    const { say, wakeUp, unlock, celebrate, openPanel, hush } = ctx.current;
    const queued = held.current;
    held.current = [];
    if (ctx.current.modeRef.current === "sleeping") await wakeUp({ text: "", sleepy: true });
    else if (ctx.current.modeRef.current === "focusing") await unlock();
    if (completed) celebrate();
    const lines = queued.slice(0, 3).map((h) => `• ${h.title}${h.kind === "deadline" ? " (due soon)" : ` at ${fmtTime(h.start)}`}`);
    const base = completed ? "Focus session done. Stretch and sip some water." : "Welcome back!";
    say(queued.length ? `${base}\nWhile you focused:\n${lines.join("\n")}` : base, {
      ms: queued.length ? 20000 : 6000,
      rich: queued.length > 0,
      actions: queued.length ? [{ label: "Open Today", run: () => { openPanel("today"); hush(); } }, { label: "Got it", run: hush }] : undefined,
    });
  }, []);

  const armTimer = useCallback((until: number) => {
    window.clearTimeout(endTimer.current);
    endTimer.current = window.setTimeout(() => endFocus(true), Math.max(0, until - nowSec()) * 1000);
  }, [endFocus]);

  const beginFocus = useCallback(async (minutes: number) => {
    const until = nowSec() + minutes * 60;
    focusUntil.current = until;
    held.current = [];
    setFocusing(true);
    await setFocusUntil(until);
    await kvSet("focus_from", String(nowSec()));
    armTimer(until);
    ctx.current.say(`Let's lock in. I'll stay quiet for ${minutes} min.`, { ms: 2600 });
    window.setTimeout(() => { if (focusActive()) ctx.current.lockIn(); }, 2800);
  }, [armTimer]);

  const showFocusStatus = useCallback(() => {
    const { say, hush } = ctx.current;
    say(`Still locked in. ${minutesLeft(focusUntil.current)} min left.`, {
      ms: 8000,
      actions: [{ label: "End focus", run: () => { hush(); endFocus(false); } }, { label: "Keep going", run: hush }],
    });
  }, [endFocus]);

  /** The Focus orb: start a block, or show how long is left. */
  const openFocusMenu = useCallback(() => {
    if (focusActive()) { showFocusStatus(); return; }
    ctx.current.say("How long do you want to focus?", {
      ms: 15000,
      actions: FOCUS_CHOICES.map((m) => ({ label: `${m} min`, run: () => { ctx.current.hush(); beginFocus(m); } })),
    });
  }, [beginFocus, showFocusStatus]);

  /** True when a reminder should wait until focus ends. Meetings starting within 2 minutes still get through. */
  const holdReminder = useCallback((r: Held) => {
    if (!focusActive()) return false;
    if (r.kind === "event" && r.start - nowSec() <= 150) return false;
    held.current.push({ title: r.title, start: r.start, kind: r.kind });
    return true;
  }, []);

  // ---- briefings & breaks --------------------------------------------------------------------------
  const deliverBriefing = useCallback(async (kind: BriefingKind, preview = false) => {
    if (busy.current) return;
    if (!preview && (unavailable() || focusActive())) return; // Rust asks again on its next tick
    busy.current = true;
    try {
      // Acknowledge first, so Rust stops announcing it.
      if (!preview) await kvSet(`last_briefing_${kind}`, todayKey());
      const { say, hush, wakeUp, openPanel, modeRef } = ctx.current;
      if (modeRef.current === "sleeping") await wakeUp({ text: "", sleepy: true });
      const text = briefingText(await composeBriefing(kind));
      say(text, {
        ms: 45000,
        rich: true,
        actions: [
          { label: "Open Today", run: () => { openPanel("today"); hush(); } },
          { label: kind === "morning" ? "Let’s go!" : "Thanks!", run: hush },
        ],
      });
    } finally {
      busy.current = false;
    }
  }, []);

  const deliverBreak = useCallback(async (minutes: number, preview = false) => {
    if (!preview && (unavailable() || focusActive())) return;
    const { say, hush, wakeUp, modeRef } = ctx.current;
    if (modeRef.current === "sleeping") await wakeUp({ text: "", sleepy: true });
    say(`You’ve been at it for ${minutes} min. Stand up, stretch, sip some water 💧`, {
      ms: 30000,
      actions: [
        { label: "On it", run: () => { hush(); say("Back in a few! 🌿", { ms: 2500 }); } },
        { label: "Later", run: hush },
      ],
    });
  }, []);

  /**
   * Free-time nudges: "you've got 90 min before your 3pm — want to start Essay 2?" Timed client
   * side with a poll, unlike briefings/breaks which Rust decides on its tick — this is the one
   * wellbeing path with no Rust half, so it needs no Mac build to test.
   */
  const deliverNudge = useCallback(async (preview = false) => {
    if (!preview) {
      if (unavailable() || focusActive()) return;
      if ((await kvGet("nudges_on")) === "off") return;
      const last = Number(await kvGet("nudge_at")) || 0;
      if (nowSec() - last < 90 * 60) return;
    }
    const n = await findNudge({ preview });
    if (!n) return;
    if (!preview) await kvSet("nudge_at", String(nowSec()));
    const { say, hush, wakeUp, openPanel, modeRef } = ctx.current;
    if (modeRef.current === "sleeping") await wakeUp({ text: "", sleepy: true });
    say(`You’ve got about ${n.minutes} min free ${n.until}. Want to start “${n.task}”?`, {
      ms: 20000,
      actions: [
        { label: "Start it", run: () => { openPanel("today"); hush(); } },
        { label: "Not now", run: hush },
      ],
    });
  }, []);

  useEffect(() => {
    // Resume a focus block that was running when the app last closed.
    getFocusUntil().then((until) => {
      if (!until) { setFocusUntil(0); return; }
      focusUntil.current = until;
      setFocusing(true);
      armTimer(until);
      window.setTimeout(() => { if (focusActive()) ctx.current.lockIn(); }, 3500);
    });
    const un = [
      listen<{ kind: BriefingKind }>("briefing", (e) => deliverBriefing(e.payload.kind)),
      listen<{ minutes: number }>("break-due", (e) => deliverBreak(e.payload.minutes)),
      // Settings → "Try it" buttons.
<<<<<<< Updated upstream
      listen<{ type: BriefingKind | "break" }>("wellbeing-preview", (e) =>
        e.payload.type === "break" ? deliverBreak(50, true) : deliverBriefing(e.payload.type, true),
=======
      listen<{ type: "morning" | "evening" | "break" | "nudge" }>("wellbeing-preview", (e) =>
        e.payload.type === "break" ? deliverBreak(50, true)
          : e.payload.type === "nudge" ? deliverNudge(true)
          : deliverBriefing(e.payload.type, true),
>>>>>>> Stashed changes
      ),
    ];
    // Checked client-side on a poll, not via a Rust emit like the others (see deliverNudge).
    const nudgeTimer = window.setInterval(deliverNudge, 60_000);
    return () => { un.forEach((p) => p.then((f) => f())); window.clearTimeout(endTimer.current); window.clearInterval(nudgeTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { focusing, focusEnds: focusUntil.current, focusActive, openFocusMenu, showFocusStatus, holdReminder };
}
