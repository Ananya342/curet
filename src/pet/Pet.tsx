import { useCallback, useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PETS, PET_IDS, PetId, pick } from "../pets";
import { Area, Screen, fmtTime, getPetId, greeting, kvGet, kvSet, nowSec, setPetId } from "../api";
import { startHitReporting } from "../hit";

const WIN_W = 340;
const WIN_H = 400;
const FLOOR_PAD = 6;
const SLEEP_AFTER_MS = 10 * 60 * 1000;

type Mode = "sleeping" | "waking" | "idle" | "walking" | "alert" | "dragged" | "tossed" | "hiding" | "hidden";
interface Bubble { id: number; text: string; actions?: { label: string; run: () => void }[] }
interface Fx { id: number; kind: "heart" | "star" | "boop" | "confetti"; x: number; y: number; dx: number; text?: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;

export default function Pet() {
  const [petId, setPetIdState] = useState<PetId>("ghost");
  const def = PETS[petId];
  const sw = def.w;
  const sh = def.w * def.ar;

  const [mode, _setMode] = useState<Mode>("sleeping");
  const modeRef = useRef<Mode>("sleeping");
  const setMode = (m: Mode) => { modeRef.current = m; _setMode(m); };

  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [menu, setMenu] = useState<null | "main" | "picker">(null);
  const [fx, setFx] = useState<Fx[]>([]);
  const [dir, setDir] = useState(1);
  const [zzz, setZzz] = useState(true);
  const [badge, setBadge] = useState(false);
  const [lidFill, setLidFill] = useState<string[]>([]);

  // Motion values driving the sprite.
  const sx = useMotionValue(1), sy = useMotionValue(1), rot = useMotionValue(0), ty = useMotionValue(0);
  const fly = useMotionValue(1), op = useMotionValue(1);
  const lid = useMotionValue(1);
  const lean = useMotionValue(0), look = useMotionValue(0);

  const pos = useRef({ x: 0, y: 0 });
  const screen = useRef<Area>({ x: 0, y: 0, w: 1440, h: 900 });
  const islandX = useRef(720);
  const spriteRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const lastInteract = useRef(Date.now());
  const walkTok = useRef(0);
  const physTok = useRef(0);
  const bubbleTimer = useRef<number>(0);
  const menuTimer = useRef<number>(0);
  const fxId = useRef(1);
  const pokes = useRef<number[]>([]);
  const rub = useRef({ lastX: 0, dir: 0, flips: [] as number[] });
  const petRef = useRef(def);
  petRef.current = def;
  const homeX = useRef<number | null>(null);

  // ---- geometry ---------------------------------------------------------------------------
  const bounds = useCallback(() => {
    const w = screen.current;
    const d = petRef.current;
    const spw = d.w, sph = d.w * d.ar;
    const side = (WIN_W - spw) / 2;
    return {
      minX: w.x + 6 - side,
      maxX: w.x + w.w - 6 - spw - side,
      minY: w.y - (WIN_H - FLOOR_PAD - sph),
      floorY: w.y + w.h - WIN_H + FLOOR_PAD,
    };
  }, []);

  const moveTo = useCallback((x: number, y: number) => {
    pos.current = { x, y };
    invoke("move_window", { label: "pet", x, y }).catch(() => {});
  }, []);

  const touch = () => { lastInteract.current = Date.now(); };

  // ---- effects & bubbles ---------------------------------------------------------------------
  const spawnFx = useCallback((kind: Fx["kind"], n = 1, around?: { x: number; y: number }, text?: string) => {
    const d = petRef.current;
    const cx = around?.x ?? WIN_W / 2;
    const cy = around?.y ?? WIN_H - FLOOR_PAD - (d.w * d.ar) * 0.55;
    const items: Fx[] = Array.from({ length: n }, (_, i) => ({
      id: fxId.current++, kind, text,
      x: cx + (Math.random() - 0.5) * (kind === "boop" ? 0 : 70), y: cy - Math.random() * 20,
      dx: (Math.random() - 0.5) * (kind === "confetti" ? 160 : 50) + (i % 2 ? 6 : -6),
    }));
    setFx((f) => [...f, ...items]);
    window.setTimeout(() => setFx((f) => f.filter((q) => !items.includes(q))), 1500);
  }, []);

  const say = useCallback((text: string, opts: { ms?: number; actions?: Bubble["actions"] } = {}) => {
    window.clearTimeout(bubbleTimer.current);
    const b: Bubble = { id: Date.now(), text, actions: opts.actions };
    setBubble(b);
    const ms = opts.ms ?? Math.max(3000, text.length * 70);
    bubbleTimer.current = window.setTimeout(() => setBubble((cur) => (cur?.id === b.id ? null : cur)), ms);
  }, []);
  const hush = () => { window.clearTimeout(bubbleTimer.current); setBubble(null); };

  const closeMenu = () => { window.clearTimeout(menuTimer.current); setMenu(null); };
  const openMenu = (kind: "main" | "picker" = "main") => {
    window.clearTimeout(menuTimer.current);
    hush();
    setMenu(kind);
    menuTimer.current = window.setTimeout(() => setMenu(null), 9000);
  };

  // ---- sprite animations ---------------------------------------------------------------------
  const jelly = useCallback(async (amt = 1) => {
    await Promise.all([
      animate(sx, [1, 1 + 0.2 * amt, 1 - 0.1 * amt, 1 + 0.06 * amt, 1], { duration: 0.55 }),
      animate(sy, [1, 1 - 0.2 * amt, 1 + 0.12 * amt, 1 - 0.05 * amt, 1], { duration: 0.55 }),
    ]);
  }, [sx, sy]);

  const hop = useCallback(async (h = 34) => {
    await Promise.all([
      animate(ty, [0, -h, 0], { duration: 0.5, ease: ["easeOut", "easeIn"] }),
      animate(sy, [1, 1.12, 0.86, 1], { duration: 0.5, times: [0, 0.4, 0.85, 1] }),
      animate(sx, [1, 0.92, 1.12, 1], { duration: 0.5, times: [0, 0.4, 0.85, 1] }),
    ]);
  }, [sx, sy, ty]);

  const blink = useCallback(async () => {
    if (modeRef.current === "sleeping" || lid.get() > 0.05) return;
    await animate(lid, [0, 1, 0], { duration: 0.17 });
  }, [lid]);

  const happy = useCallback(async (text?: string) => {
    spawnFx("heart", 5);
    if (text) say(text, { ms: 2600 });
    await hop(38);
    await hop(26);
  }, [hop, spawnFx, say]);

  const celebrate = useCallback(async () => {
    spawnFx("confetti", 14);
    spawnFx("star", 4);
    say(pick(["yay! one down! 🎉", "you did it!!", "woohoo, nice work!"]), { ms: 3000 });
    for (let i = 0; i < 3; i++) await hop(40);
    animate(rot, [0, -10, 10, -6, 0], { duration: 0.6 });
  }, [hop, rot, say, spawnFx]);

  // ---- sleeping & waking ----------------------------------------------------------------------
  const fallAsleep = useCallback(async () => {
    if (!["idle", "walking"].includes(modeRef.current)) return;
    walkTok.current++;
    closeMenu();
    hush();
    setMode("sleeping");
    await Promise.all([
      animate(lid, 1, { duration: 0.9, ease: "easeInOut" }),
      animate(sy, 0.93, { duration: 0.9 }),
      animate(sx, 1.05, { duration: 0.9 }),
    ]);
    setZzz(true);
  }, [lid, sx, sy]);

  const wakeUp = useCallback(async (opts: { text?: string; sleepy?: boolean } = {}) => {
    walkTok.current++;
    setMode("waking");
    closeMenu();
    touch();
    // Settle into the curled-up pose first.
    await Promise.all([animate(sy, 0.92, { duration: 0.35 }), animate(sx, 1.06, { duration: 0.35 }), animate(lid, 1, { duration: 0.2 })]);
    await sleep(opts.sleepy ? 150 : 450);
    setZzz(false);
    // Big stretch + yawn.
    await Promise.all([
      animate(sy, [0.92, 1.2, 1.12, 1], { duration: 0.85, times: [0, 0.4, 0.7, 1], ease: "easeInOut" }),
      animate(sx, [1.06, 0.88, 0.93, 1], { duration: 0.85, times: [0, 0.4, 0.7, 1], ease: "easeInOut" }),
      animate(rot, [0, -4, 4, 0], { duration: 0.85 }),
      animate(lid, [1, 1, 0.7, 0.35], { duration: 0.85, times: [0, 0.4, 0.7, 1] }),
    ]);
    // Eyes open, two quick blinks.
    await animate(lid, 0, { duration: 0.25 });
    await sleep(120);
    await animate(lid, [0, 1, 0, 1, 0], { duration: 0.5, times: [0, 0.2, 0.4, 0.6, 1] });
    setMode("idle");
    await hop(36);
    spawnFx("star", 3);
    let text = opts.text;
    if (text === undefined) {
      try { text = await greeting(); } catch { text = pick(petRef.current.greetings); }
    }
    if (text) say(text, { ms: 5500 });
  }, [lid, rot, say, spawnFx, sx, sy, hop]);

  // ---- movement ---------------------------------------------------------------------------------
  const walkTo = useCallback((targetX: number, speed = 70) => new Promise<void>((resolve) => {
    const tok = ++walkTok.current;
    const b = bounds();
    const tx = clamp(targetX, b.minX, b.maxX);
    if (modeRef.current !== "alert") setMode("walking");
    setDir(tx < pos.current.x ? -1 : 1);
    let last = performance.now(), t = 0;
    const step = (now: number) => {
      if (tok !== walkTok.current) return resolve();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now; t += dt;
      const dx = tx - pos.current.x;
      const move = Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
      moveTo(pos.current.x + move, b.floorY);
      const phase = t * (speed > 120 ? 14 : 9);
      ty.set(-Math.abs(Math.sin(phase)) * 6);
      rot.set(Math.sin(phase) * 3.5);
      if (Math.abs(dx) < 1) {
        ty.set(0); rot.set(0);
        if (modeRef.current === "walking") setMode("idle");
        homeX.current = pos.current.x;
        kvSet("pet_x", String(Math.round(pos.current.x)));
        return resolve();
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), [bounds, moveTo, rot, ty]);

  const wander = useCallback(() => {
    const b = bounds();
    const span = 420;
    const target = clamp(pos.current.x + (Math.random() - 0.5) * 2 * span, b.minX, b.maxX);
    if (Math.abs(target - pos.current.x) > 60) walkTo(target);
  }, [bounds, walkTo]);

  const toss = useCallback((vx0: number, vy0: number) => new Promise<void>((resolve) => {
    const tok = ++physTok.current;
    setMode("tossed");
    let { x, y } = pos.current;
    let vx = vx0, vy = vy0;
    let last = performance.now();
    const step = (now: number) => {
      if (tok !== physTok.current) return resolve();
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const b = bounds();
      vy += 2600 * dt;
      x += vx * dt;
      y += vy * dt;
      if (x < b.minX) { x = b.minX; vx = Math.abs(vx) * 0.5; }
      if (x > b.maxX) { x = b.maxX; vx = -Math.abs(vx) * 0.5; }
      if (y < b.minY) {
        y = b.minY;
        if (vy < -1600) { hidePetRef.current(); return resolve(); }
        vy = Math.abs(vy) * 0.4;
      }
      let grounded = false;
      if (y >= b.floorY) {
        y = b.floorY;
        if (Math.abs(vy) > 280) {
          const amt = clamp(Math.abs(vy) / 2600, 0.08, 0.32);
          animate(sy, [1, 1 - amt, 1], { duration: 0.28 });
          animate(sx, [1, 1 + amt * 0.8, 1], { duration: 0.28 });
          vy = -vy * 0.4;
          vx *= 0.8;
        } else { vy = 0; grounded = true; }
        vx *= Math.pow(0.01, dt);
      }
      moveTo(x, y);
      rot.set(clamp(vx / 45, -22, 22));
      if (grounded && Math.abs(vx) < 10) {
        animate(rot, 0, { type: "spring", stiffness: 300, damping: 14 });
        homeX.current = x;
        kvSet("pet_x", String(Math.round(x)));
        setMode("idle");
        return resolve();
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), [bounds, moveTo, rot, sx, sy]);

  // ---- hide into / emerge from the island -----------------------------------------------------
  const islandTarget = () => {
    const d = petRef.current;
    const spriteCentre = WIN_H - FLOOR_PAD - (d.w * d.ar) / 2;
    return { x: islandX.current - WIN_W / 2, y: 18 - spriteCentre };
  };

  const tween = (ms: number, f: (t: number) => void) => new Promise<void>((resolve) => {
    const t0 = performance.now();
    const step = (now: number) => {
      const t = clamp((now - t0) / ms, 0, 1);
      f(t);
      t < 1 ? requestAnimationFrame(step) : resolve();
    };
    requestAnimationFrame(step);
  });

  const hidePet = useCallback(async () => {
    if (["hiding", "hidden", "waking"].includes(modeRef.current)) return;
    walkTok.current++; physTok.current++;
    closeMenu(); hush(); setBadge(false);
    setMode("hiding");
    await invoke("hide_panel").catch(() => {});
    animate(lid, 0, { duration: 0.1 });
    const from = { ...pos.current };
    const to = islandTarget();
    await tween(650, (t) => {
      const e = easeIn(t);
      moveTo(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
      fly.set(1 - 0.88 * e);
      rot.set(e * 540);
      op.set(1 - clamp((t - 0.7) / 0.3, 0, 1));
    });
    await invoke("set_pet_visible", { visible: false });
    rot.set(0); op.set(1);
    setMode("hidden");
    await emitTo("island", "pet-hidden", petRef.current.id);
  }, [fly, lid, moveTo, op, rot]);
  const hidePetRef = useRef(hidePet);
  hidePetRef.current = hidePet;

  const showPet = useCallback(async () => {
    if (modeRef.current !== "hidden") return;
    setMode("waking");
    const b = bounds();
    const to = { x: clamp(homeX.current ?? b.maxX - 30, b.minX, b.maxX), y: b.floorY };
    const from = islandTarget();
    lid.set(1); sx.set(1.06); sy.set(0.92); setZzz(false);
    fly.set(0.12); op.set(0); rot.set(540);
    moveTo(from.x, from.y);
    await invoke("set_pet_visible", { visible: true });
    await emitTo("island", "pet-shown", petRef.current.id);
    await tween(750, (t) => {
      const e = easeOut(t);
      // Fall with a little bounce at the end.
      const drop = t < 0.8 ? easeOut(t / 0.8) : 1 - Math.sin((t - 0.8) / 0.2 * Math.PI) * 0.03;
      moveTo(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * drop);
      fly.set(0.12 + 0.88 * e);
      rot.set(540 * (1 - e));
      op.set(clamp(t / 0.25, 0, 1));
    });
    rot.set(0); fly.set(1); op.set(1);
    await Promise.all([animate(sy, [0.92, 0.78, 0.92], { duration: 0.25 }), animate(sx, [1.06, 1.2, 1.06], { duration: 0.25 })]);
    await wakeUp();
  }, [bounds, fly, lid, moveTo, op, rot, sx, sy, wakeUp]);

  const toggleHide = useCallback(() => {
    const m = modeRef.current;
    if (m === "hidden") showPet();
    else if (m !== "hiding" && m !== "waking") hidePet();
  }, [hidePet, showPet]);

  // ---- menu actions ---------------------------------------------------------------------------------
  const panel = (tab: string) => { closeMenu(); invoke("toggle_panel", { tab, forceOpen: true }).catch(() => {}); };

  const menuItems = [
    { key: "chat", icon: "💬", label: "Chat", run: () => panel("chat") },
    { key: "today", icon: "📅", label: "Today", run: () => panel("today") },
    { key: "sleep", icon: mode === "sleeping" ? "☀️" : "😴", label: mode === "sleeping" ? "Wake" : "Sleep", run: () => { closeMenu(); mode === "sleeping" ? wakeUp({ text: "" }) : fallAsleep(); } },
    { key: "hide", icon: "🏝️", label: "Hide", run: () => hidePet() },
    { key: "pet", icon: "🐾", label: "Pets", run: () => openMenu("picker") },
    { key: "settings", icon: "⚙️", label: "Settings", run: () => panel("settings") },
  ];

  // ---- pointer interaction --------------------------------------------------------------------------
  const drag = useRef<null | {
    sx: number; sy: number; wx: number; wy: number; moved: boolean;
    samples: { t: number; x: number; y: number }[];
  }>(null);

  const noseHit = (clientX: number, clientY: number) => {
    const el = spriteRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const nx = dir > 0 ? def.nose.x : 1 - def.nose.x;
    const cx = r.left + nx * r.width, cy = r.top + def.nose.y * r.height;
    return Math.hypot(clientX - cx, clientY - cy) < Math.max(18, r.width * 0.13);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (["hiding", "hidden", "waking"].includes(modeRef.current)) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    touch();
    drag.current = { sx: e.screenX, sy: e.screenY, wx: pos.current.x, wy: pos.current.y, moved: false, samples: [{ t: performance.now(), x: e.screenX, y: e.screenY }] };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d) {
      const dx = e.screenX - d.sx, dy = e.screenY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) > 5) {
        d.moved = true;
        draggingRef.current = true;
        walkTok.current++; physTok.current++;
        closeMenu(); hush();
        if (modeRef.current === "sleeping") { animate(lid, 0.4, { duration: 0.2 }); setZzz(false); }
        setMode("dragged");
        animate(sy, 1.06, { duration: 0.2 });
        animate(sx, 0.95, { duration: 0.2 });
      }
      if (d.moved) {
        const b = bounds();
        moveTo(clamp(d.wx + dx, b.minX - 60, b.maxX + 60), clamp(d.wy + dy, b.minY, b.floorY));
        const now = performance.now();
        d.samples.push({ t: now, x: e.screenX, y: e.screenY });
        while (d.samples.length > 2 && now - d.samples[0].t > 120) d.samples.shift();
        const s0 = d.samples[0];
        const vx = ((e.screenX - s0.x) / Math.max(1, now - s0.t)) * 1000;
        rot.set(clamp(vx / 35, -25, 25));
      }
      return;
    }
    // Petting: wiggle the cursor back and forth over the pet.
    if (modeRef.current === "sleeping" || modeRef.current === "hidden") return;
    const r = rub.current;
    const dx = e.clientX - r.lastX;
    if (Math.abs(dx) > 3) {
      const d2 = Math.sign(dx);
      if (r.dir && d2 !== r.dir) {
        const now = performance.now();
        r.flips = [...r.flips.filter((t) => now - t < 1300), now];
        if (r.flips.length >= 5) {
          r.flips = [];
          touch();
          happy(pick(["mmm, that's nice 💕", "hehe don't stop!", "I love pats!"]));
        }
      }
      r.dir = d2;
      r.lastX = e.clientX;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      draggingRef.current = false;
      const now = performance.now();
      const s0 = d.samples[0];
      const dt = Math.max(1, now - s0.t);
      const vx = clamp(((e.screenX - s0.x) / dt) * 1000, -2600, 2600);
      const vy = clamp(((e.screenY - s0.y) / dt) * 1000, -3200, 2600);
      animate(sy, 1, { type: "spring", stiffness: 300, damping: 10 });
      animate(sx, 1, { type: "spring", stiffness: 300, damping: 10 });
      toss(vx, vy);
      return;
    }
    // A click.
    touch();
    if (modeRef.current === "sleeping") { wakeUp({ sleepy: true, text: pick(["mmf… I'm up!", "five more minutes…", "huh? oh, hi!"]) }); return; }
    const onNose = noseHit(e.clientX, e.clientY);
    if (onNose) {
      const d2 = petRef.current;
      const nx = (WIN_W - d2.w) / 2 + (dir > 0 ? d2.nose.x : 1 - d2.nose.x) * d2.w;
      const ny = WIN_H - FLOOR_PAD - d2.w * d2.ar + d2.nose.y * d2.w * d2.ar;
      spawnFx("boop", 1, { x: nx, y: ny - 14 }, "boop!");
      spawnFx("star", 4, { x: nx, y: ny });
      animate(sy, [1, 0.8, 1.06, 1], { duration: 0.35 });
      animate(sx, [1, 1.14, 0.97, 1], { duration: 0.35 });
      if (menu) { closeMenu(); return; }
      say(pick(d2.boops), { ms: 1500 });
      window.setTimeout(() => openMenu("main"), 380);
      return;
    }
    // Poke the body.
    const now = Date.now();
    pokes.current = [...pokes.current.filter((t) => now - t < 4000), now];
    if (menu) closeMenu();
    jelly(1);
    if (pokes.current.length >= 6) {
      pokes.current = [];
      animate(rot, [0, -8, 8, -8, 8, 0], { duration: 0.5 });
      say("okay okay okay!! 😤", { ms: 2000 });
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    touch();
    if (modeRef.current === "sleeping") { wakeUp({ sleepy: true, text: "" }); return; }
    if (["hiding", "hidden", "waking"].includes(modeRef.current)) return;
    menu ? closeMenu() : openMenu("main");
  };

  // ---- reminders -----------------------------------------------------------------------------------------
  const onReminder = useCallback(async (r: { id: string; title: string; start: number; link: string; kind: string }) => {
    if (modeRef.current === "hidden" || modeRef.current === "hiding") return;
    if (modeRef.current === "sleeping") await wakeUp({ text: "", sleepy: true });
    closeMenu();
    setMode("alert");
    setBadge(true);
    const mins = Math.round((r.start - nowSec()) / 60);
    const when = mins <= 1 ? "starting now" : mins < 90 ? `in ${mins} min` : mins < 36 * 60 ? `in ${Math.round(mins / 60)}h` : `on ${fmtTime(r.start)}`;
    const text = r.kind === "deadline" ? `📚 ${r.title} is due ${when}!` : `📅 ${r.title} ${when} (${fmtTime(r.start)})`;
    const b = bounds();
    await walkTo((screen.current.x + screen.current.w / 2) - WIN_W / 2, 230);
    setMode("alert");
    const dismiss = () => { setBadge(false); hush(); if (modeRef.current === "alert") setMode("idle"); };
    say(text, {
      ms: 60000,
      actions: [
        ...(r.link ? [{ label: r.kind === "deadline" ? "Open" : "Join", run: () => { openUrl(r.link).catch(() => {}); dismiss(); } }] : []),
        { label: "Got it", run: dismiss },
      ],
    });
    animate(rot, [0, -6, 6, -6, 6, 0], { duration: 0.6 });
    void b;
  }, [bounds, rot, say, walkTo, wakeUp]);

  // ---- lifecycle -------------------------------------------------------------------------------------------
  useEffect(() => startHitReporting(() => draggingRef.current), []);

  useEffect(() => {
    let cancelled = false;
    const unlisten: (() => void)[] = [];
    (async () => {
      const id = await getPetId();
      setPetIdState(id);
      const s = await invoke<Screen | null>("screen_info");
      if (s) { screen.current = s.work; islandX.current = s.island_x; }
      const saved = Number(await kvGet("pet_x"));
      const b = bounds();
      const x = clamp(Number.isFinite(saved) && saved !== 0 ? saved : b.maxX - 30, b.minX, b.maxX);
      homeX.current = x;
      moveTo(x, b.floorY);
      lid.set(1); sy.set(0.93); sx.set(1.05);
      await sleep(900);
      if (!cancelled) wakeUp();
    })();
    const add = async <T,>(name: string, fn: (p: T) => void) => { unlisten.push(await listen<T>(name, (e) => fn(e.payload))) };
    add<string>("pet-changed", (p) => { setPetIdState(p as PetId); spawnFx("star", 6); jelly(1.2); });
    add<null>("toggle-hide", () => toggleHide());
    add<null>("celebrate", () => celebrate());
    add<any>("reminder", (r) => onReminder(r));
    add<{ x: number; y: number }>("cursor", (c) => {
      if (modeRef.current !== "idle" && modeRef.current !== "alert") return;
      const dx = c.x - WIN_W / 2, dy = c.y - (WIN_H - 100);
      if (Math.hypot(dx, dy) > 520) { lean.set(0); look.set(0); return; }
      lean.set(clamp(dx / 30, -6, 6));
      look.set(clamp(dx / 70, -4, 4));
    });
    return () => { cancelled = true; unlisten.forEach((u) => u()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Eyelids should look like the skin around each eye, so sample the ring of pixels surrounding it.
  useEffect(() => {
    const img = new Image();
    img.src = def.src;
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext("2d", { willReadFrequently: true });
      if (!g) return;
      g.drawImage(img, 0, 0);
      const fills = def.eyes.map((e) => {
        const cx = e.x * c.width, cy = e.y * c.height;
        const rx = def.eye.rx * c.width, ry = def.eye.ry * c.height;
        const top: number[][] = [], bot: number[][] = [];
        for (let k = 0; k < 28; k++) {
          const a = (k / 28) * Math.PI * 2;
          for (const m of [1.5, 1.8]) {
            const x = Math.round(cx + Math.cos(a) * rx * m), y = Math.round(cy + Math.sin(a) * ry * m);
            if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
            const [r, gg, b, al] = g.getImageData(x, y, 1, 1).data;
            if (al < 200 || r + gg + b < 180) continue; // transparent or dark (another eye / outline)
            (Math.sin(a) < 0 ? top : bot).push([r, gg, b]);
          }
        }
        const avg = (v: number[][]) => v.length ? v.reduce((t, p) => [t[0] + p[0], t[1] + p[1], t[2] + p[2]], [0, 0, 0]).map((n) => Math.round(n / v.length)) : null;
        const t = avg(top) ?? avg(bot), b = avg(bot) ?? t;
        return t && b ? `linear-gradient(rgb(${t.join(",")}), rgb(${b.join(",")}))` : def.lid;
      });
      setLidFill(fills);
    };
  }, [def]);

  // Blink, wander, doze off.
  useEffect(() => {
    let t: number;
    const loop = () => {
      t = window.setTimeout(() => { blink(); loop(); }, 2200 + Math.random() * 3800);
    };
    loop();
    const tick = window.setInterval(() => {
      if (modeRef.current !== "idle" || draggingRef.current) return;
      if (Date.now() - lastInteract.current > SLEEP_AFTER_MS) { fallAsleep(); return; }
      if (Math.random() < 0.05 && !bubbleTimer.current) wander();
    }, 1000);
    return () => { clearTimeout(t); clearInterval(tick); };
  }, [blink, fallAsleep, wander]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeMenu();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- render -----------------------------------------------------------------------------------------------
  const cx = WIN_W / 2;
  const cy = WIN_H - FLOOR_PAD - sh / 2;
  const radius = sh / 2 + 60;
  const arc = (i: number, n: number) => {
    const a = (-168 + (156 * i) / Math.max(1, n - 1)) * (Math.PI / 180);
    return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
  };

  const breathClass = mode === "sleeping" ? "breath slow" : mode === "idle" || mode === "alert" ? "breath" : "";

  return (
    <div className="stage" data-mode={mode} style={{ width: WIN_W, height: WIN_H }}>
      {bubble && !menu && (
        <div className="bubble" data-hit style={{ bottom: FLOOR_PAD + sh + 12 }} onClick={() => { touch(); hush(); setBadge(false); if (modeRef.current === "alert") setMode("idle"); }}>
          <div className="bubble-text">{bubble.text}</div>
          {bubble.actions && (
            <div className="bubble-actions">
              {bubble.actions.map((a) => (
                <button key={a.label} onClick={(e) => { e.stopPropagation(); a.run(); }}>{a.label}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {menu === "main" && menuItems.map((it, i) => {
        const p = arc(i, menuItems.length);
        return (
          <button key={it.key} data-hit className="orb" style={{ left: p.x - 25, top: p.y - 25, animationDelay: `${i * 40}ms` }}
            onClick={() => { touch(); it.run(); }}>
            <span>{it.icon}</span><em>{it.label}</em>
          </button>
        );
      })}
      {menu === "picker" && PET_IDS.map((id, i) => {
        const p = arc(i, PET_IDS.length);
        return (
          <button key={id} data-hit className={`orb pick ${id === petId ? "on" : ""}`} style={{ left: p.x - 27, top: p.y - 27, animationDelay: `${i * 40}ms` }}
            onClick={() => { touch(); closeMenu(); setPetId(id); }}>
            <img src={PETS[id].src} alt={PETS[id].name} draggable={false} /><em>{PETS[id].name}</em>
          </button>
        );
      })}

      {fx.map((f) => (
        <span key={f.id} className={`fx ${f.kind}`} style={{ left: f.x, top: f.y, ["--dx" as string]: `${f.dx}px` }}>
          {f.kind === "heart" ? "💕" : f.kind === "star" ? "✨" : f.kind === "confetti" ? pick(["🎉", "✨", "🎊", "⭐", "💜"]) : f.text}
        </span>
      ))}

      <div className="pet" style={{ left: (WIN_W - sw) / 2, bottom: FLOOR_PAD, width: sw, height: sh }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onContextMenu={onContextMenu}>
        <motion.div className="lean" style={{ rotate: lean, x: look }}>
          <motion.div className="flyer" style={{ scale: fly, opacity: op }}>
            <div className="flip" style={{ transform: `scaleX(${dir})` }}>
              <div className={breathClass}>
                <motion.div className="squish" style={{ scaleX: sx, scaleY: sy, rotate: rot, y: ty }}>
                  <div className="sprite" data-hit ref={spriteRef} style={{ width: sw, height: sh }}>
                    <img src={def.src} alt={def.name} draggable={false} />
                    {def.eyes.map((e, i) => (
                      <motion.div key={i} className="lid" style={{
                        left: (e.x - def.eye.rx * 1.25) * sw, top: (e.y - def.eye.ry * 1.3) * sh,
                        width: def.eye.rx * 2.5 * sw, height: def.eye.ry * 2.6 * sh,
                        background: lidFill[i] ?? def.lid, scaleY: lid,
                      }}><i /></motion.div>
                    ))}
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </motion.div>
        {mode === "sleeping" && zzz && (
          <div className="zs"><span>z</span><span>Z</span><span>z</span></div>
        )}
        {badge && <div className="badge">!</div>}
      </div>
    </div>
  );
}
