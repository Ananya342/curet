import { useCallback, useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ChatIcon, HideIcon, PetsIcon, SettingsIcon, SleepIcon, TodayIcon, WakeIcon } from "../menuIcons";
import { PETS, PET_IDS, PetId, pick } from "../pets";
import { Area, Screen, fmtTime, getPetId, greeting, kvGet, kvSet, nowSec, setPetId } from "../api";
import { startHitReporting } from "../hit";
import { FocusIcon } from "../wellbeing/FocusIcon";
import { useWellbeing } from "../wellbeing/useWellbeing";

const WIN_W = 340;
const WIN_H = 400;
const FLOOR_PAD = 6;
const SLEEP_AFTER_MS = 10 * 60 * 1000;

type Mode = "sleeping" | "waking" | "idle" | "walking" | "alert" | "dragged" | "tossed" | "hiding" | "hidden";
interface Bubble { id: number; text: string; rich?: boolean; actions?: { label: string; run: () => void }[] }
interface Fx { id: number; kind: "heart" | "star" | "boop" | "confetti"; x: number; y: number; dx: number; text?: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

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
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const [fx, setFx] = useState<Fx[]>([]);
  const [dir, setDir] = useState(1);
  const [zzz, setZzz] = useState(true);
  const [fading, setFading] = useState(false); // drops the drop-shadow while the pet fades out or back in
  const [poof, setPoof] = useState<null | { id: number; x: number; y: number; puffs: { x: number; y: number; s: number; d: number }[] }>(null);
  const [badge, setBadge] = useState(false);
  const [lidFill, setLidFill] = useState<string[]>([]);

  // Motion values driving the sprite.
  const sx = useMotionValue(1), sy = useMotionValue(1), rot = useMotionValue(0), ty = useMotionValue(0);
  const fly = useMotionValue(1), op = useMotionValue(1);
  const lid = useMotionValue(1);
  const lean = useMotionValue(0), look = useMotionValue(0);

  const pos = useRef({ x: 0, y: 0 });
  const screen = useRef<Area>({ x: 0, y: 0, w: 1440, h: 900 });
  const spriteRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const lastInteract = useRef(Date.now());
  const walkTok = useRef(0);
  const physTok = useRef(0);
  const bubbleTimer = useRef<number>(0);
  const menuTimer = useRef<number>(0);
  const lastClick = useRef(0);
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

  const say = useCallback((text: string, opts: { ms?: number; actions?: Bubble["actions"]; rich?: boolean } = {}) => {
    window.clearTimeout(bubbleTimer.current);
    const b: Bubble = { id: Date.now(), text, actions: opts.actions, rich: opts.rich };
    setBubble(b);
    const ms = opts.ms ?? Math.max(3000, text.length * 70);
    bubbleTimer.current = window.setTimeout(() => setBubble((cur) => (cur?.id === b.id ? null : cur)), ms);
  }, []);
  const hush = () => { window.clearTimeout(bubbleTimer.current); setBubble(null); };

  const closeMenu = () => { window.clearTimeout(menuTimer.current); setMenu(null); };
  const openMenu = async (kind: "main" | "picker" = "main") => {
    window.clearTimeout(menuTimer.current);
    hush();
    // At a screen edge part of the window hangs off it, so step in until all of it shows and the orbs have room.
    const w = screen.current;
    const inside = clamp(pos.current.x, w.x, w.x + w.w - WIN_W);
    if (Math.abs(inside - pos.current.x) > 1) await walkTo(inside, 320);
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

  // Crouch, spring up stretched, round out at the top, land, squash, settle. The squash lands with the feet.
  const hop = useCallback(async (h = 34) => {
    const shape = { duration: 0.64, times: [0, 0.18, 0.32, 0.5, 0.8, 0.88, 1], ease: "easeInOut" as const };
    await Promise.all([
      animate(ty, [0, 0, -h, 0, 0], { duration: 0.64, times: [0, 0.18, 0.5, 0.82, 1], ease: ["linear", "easeOut", "easeIn", "linear"] }),
      animate(sy, [1, 0.86, 1.1, 1, 1.03, 0.88, 1], shape),
      animate(sx, [1, 1.1, 0.92, 1, 0.98, 1.1, 1], shape),
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
    // From the curled-up pose: one long stretch with the eyes coming half open, then open, blink, hop.
    await Promise.all([animate(sy, 0.92, { duration: 0.2 }), animate(sx, 1.06, { duration: 0.2 }), animate(lid, 1, { duration: 0.15 })]);
    if (!opts.sleepy) await sleep(150);
    setZzz(false);
    await Promise.all([
      animate(sy, [0.92, 1.14, 1], { duration: 0.7, times: [0, 0.55, 1], ease: "easeInOut" }),
      animate(sx, [1.06, 0.9, 1], { duration: 0.7, times: [0, 0.55, 1], ease: "easeInOut" }),
      animate(lid, [1, 0.65, 0.3], { duration: 0.7, ease: "easeOut" }),
    ]);
    await animate(lid, 0, { duration: 0.18, ease: "easeOut" });
    await sleep(90);
    await animate(lid, [0, 1, 0], { duration: 0.18 });
    setMode("idle");
    await hop(30);
    spawnFx("star", 3);
    let text = opts.text;
    if (text === undefined) {
      try { text = await greeting(); } catch { text = pick(petRef.current.greetings); }
    }
    if (text) say(text, { ms: 5500 });
  }, [lid, say, spawnFx, sx, sy, hop]);

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

  // ---- poof away where the pet stands, and pop back in the same spot ------------------------------------------
  const cloud = () => {
    const d = petRef.current;
    const w = d.w, h = d.w * d.ar;
    const puffs = Array.from({ length: 13 }, (_, i) => {
      const core = i < 4; // a few big ones in the middle hide the moment the pet vanishes
      const a = (i / 13) * Math.PI * 2 + Math.random() * 0.5;
      const dist = core ? 8 + Math.random() * 14 : w * (0.32 + Math.random() * 0.2);
      return {
        x: Math.cos(a) * dist, y: Math.sin(a) * dist * 0.75 - (core ? 6 : 0),
        s: core ? 54 + Math.random() * 16 : 26 + Math.random() * 22, d: Math.random() * 90,
      };
    });
    setPoof({ id: Date.now(), x: WIN_W / 2, y: WIN_H - FLOOR_PAD - h / 2, puffs });
  };

  const hidePet = useCallback(async () => {
    if (["hiding", "hidden", "waking"].includes(modeRef.current)) return;
    walkTok.current++; physTok.current++;
    closeMenu(); hush(); setBadge(false);
    setMode("hiding");
    await invoke("hide_panel").catch(() => {});
    animate(lid, 0, { duration: 0.1 });
    // Crouch, then spring up and shrink into the cloud.
    await Promise.all([animate(sy, 0.8, { duration: 0.14 }), animate(sx, 1.15, { duration: 0.14 })]);
    setFading(true);
    cloud();
    await Promise.all([
      animate(sy, 1.3, { duration: 0.22, ease: "easeOut" }),
      animate(sx, 0.75, { duration: 0.22, ease: "easeOut" }),
      animate(ty, -26, { duration: 0.22, ease: "easeOut" }),
      animate(fly, 0.15, { duration: 0.24, ease: "easeIn" }),
      animate(op, 0, { duration: 0.2, delay: 0.04 }),
    ]);
    await sleep(520); // let the cloud drift apart
    await invoke("set_pet_visible", { visible: false });
    setPoof(null); setFading(false);
    sx.set(1); sy.set(1); ty.set(0); rot.set(0); fly.set(1); op.set(1);
    setMode("hidden");
    await emitTo("popover", "pet-hidden", petRef.current.id);
  }, [fly, lid, op, rot, sx, sy, ty]);
  const hidePetRef = useRef(hidePet);
  hidePetRef.current = hidePet;

  const showPet = useCallback(async () => {
    if (modeRef.current !== "hidden") return;
    setMode("waking");
    const b = bounds();
    moveTo(clamp(pos.current.x, b.minX, b.maxX), b.floorY);
    lid.set(1); setZzz(false);
    setFading(true);
    fly.set(0.6); op.set(0); rot.set(0); ty.set(0); sx.set(1.06); sy.set(0.92); // the sleepy squash wakeUp starts from
    await invoke("set_pet_visible", { visible: true });
    await emitTo("popover", "pet-shown", petRef.current.id);
    await Promise.all([
      animate(fly, 1, { type: "spring", stiffness: 380, damping: 18 }),
      animate(op, 1, { duration: 0.18 }),
    ]);
    await wakeUp();
    setFading(false);
  }, [bounds, fly, lid, moveTo, op, rot, sx, sy, ty, wakeUp]);

  const toggleHide = useCallback(() => {
    const m = modeRef.current;
    if (m === "hidden") showPet();
    else if (m !== "hiding" && m !== "waking") hidePet();
  }, [hidePet, showPet]);

  // ---- menu actions ---------------------------------------------------------------------------------
  const panel = (tab: string) => { closeMenu(); invoke("toggle_panel", { tab, forceOpen: true }).catch(() => {}); };

  // Briefings, focus mode and break reminders live in wellbeing/useWellbeing.ts.
  const wb = useWellbeing({ modeRef, say, hush, fallAsleep, wakeUp, celebrate, openPanel: panel });

  const menuItems = [
    { key: "chat", icon: <ChatIcon />, label: "Chat", run: () => panel("chat") },
    { key: "today", icon: <TodayIcon />, label: "Today", run: () => panel("today") },
    { key: "sleep", icon: mode === "sleeping" ? <WakeIcon /> : <SleepIcon />, label: mode === "sleeping" ? "Wake" : "Sleep", run: () => { closeMenu(); mode === "sleeping" ? wakeUp({ text: "" }) : fallAsleep(); } },
    { key: "hide", icon: <HideIcon />, label: "Hide", run: () => hidePet() },
    { key: "pet", icon: <PetsIcon />, label: "Pets", run: () => openMenu("picker") },
    { key: "focus", icon: <FocusIcon />, label: wb.focusing ? "Focusing" : "Focus", run: () => { closeMenu(); wb.openFocusMenu(); } },
    { key: "settings", icon: <SettingsIcon />, label: "Settings", run: () => panel("settings") },
  ];

  // ---- pointer interaction --------------------------------------------------------------------------
  const drag = useRef<null | {
    sx: number; sy: number; wx: number; wy: number; moved: boolean; asleep?: boolean;
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
        if (modeRef.current === "sleeping") { d.asleep = true; animate(lid, 0.4, { duration: 0.2 }); setZzz(false); }
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
      // Picked up mid-nap: once it lands, finish waking up properly instead of staying half-awake.
      toss(vx, vy).then(() => {
        if (d.asleep && modeRef.current === "idle") wakeUp({ sleepy: true, text: pick(["whoa, where am I?", "mmf… okay, I'm up!", "huh? we moved?"]) });
      });
      return;
    }
    // A click.
    touch();
    if (modeRef.current === "sleeping" && wb.focusActive()) { wb.showFocusStatus(); return; }
    if (modeRef.current === "sleeping") { wakeUp({ sleepy: true, text: pick(["mmf… I'm up!", "five more minutes…", "huh? oh, hi!"]) }); return; }
    const clickNow = performance.now();
    const isDouble = clickNow - lastClick.current < 350;
    lastClick.current = isDouble ? 0 : clickNow;
    if (isDouble) {
      if (menu) closeMenu(); else openMenu("main");
      return;
    }
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
    if (modeRef.current === "sleeping" && wb.focusActive()) { wb.showFocusStatus(); return; }
    if (modeRef.current === "sleeping") { wakeUp({ sleepy: true, text: "" }); return; }
    if (["hiding", "hidden", "waking"].includes(modeRef.current)) return;
    menu ? closeMenu() : openMenu("main");
  };

  // ---- reminders -----------------------------------------------------------------------------------------
  const onReminder = useCallback(async (r: { id: string; title: string; start: number; link: string; kind: string }) => {
    if (modeRef.current === "hidden" || modeRef.current === "hiding") return;
    if (wb.holdReminder(r)) return; // focus mode: it will be listed when the session ends
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
      if (s) screen.current = s.work;
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
      if (modeRef.current !== "idle" || draggingRef.current || menuRef.current) return;
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
  // Fan the orbs around the pet: straight up if it fits, otherwise tilted away from a nearby edge or on a wider
  // ring, picking the gentlest fan that keeps every orb on screen and clear of the others and the pet. Labels
  // only show on hover, so each one just gets nudged sideways to stay on screen.
  const layout = (labels: string[], r: number) => {
    const n = labels.length;
    const w = screen.current, px = pos.current.x, py = pos.current.y;
    const lo = { x: Math.max(2, w.x - px + 6), y: Math.max(2, w.y - py + 6) };
    const hi = { x: Math.min(WIN_W - 2, w.x + w.w - px - 6), y: Math.min(WIN_H - 2, w.y + w.h - py - 2) };
    const gap = 2 * r + 10;
    const cost = (pts: { x: number; y: number }[]) => {
      let bad = 0;
      for (const p of pts) {
        bad += Math.max(0, lo.x - (p.x - r)) + Math.max(0, p.x + r - hi.x) + Math.max(0, lo.y - (p.y - r)) + Math.max(0, p.y + r - hi.y);
        if (((p.x - cx) / (sw / 2 + r * 0.8)) ** 2 + ((p.y - cy) / (sh / 2 + r * 0.8)) ** 2 < 1) bad += 30;
      }
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) bad += Math.max(0, gap - Math.hypot(pts[b].x - pts[a].x, pts[b].y - pts[a].y));
      return bad;
    };
    let best: { x: number; y: number }[] = [], bestScore = Infinity;
    for (let ring = 0; ring <= 6; ring++) {
      const R = sh / 2 + 52 + ring * 14;
      const step = Math.max(30, (2 * Math.asin(Math.min(1, gap / (2 * R))) * 180) / Math.PI);
      for (const tilt of [0, 15, -15, 30, -30, 45, -45, 60, -60, 80, -80]) {
        const pts = Array.from({ length: n }, (_, i) => {
          const a = ((-90 + tilt + (i - (n - 1) / 2) * step) * Math.PI) / 180;
          return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
        });
        const score = cost(pts) * 1000 + Math.abs(tilt) + ring * 10;
        if (score < bestScore) { bestScore = score; best = pts; }
      }
    }
    return best.map((p, i) => {
      const half = (labels[i].length * 6.6 + 20) / 2;
      return { ...p, tagDx: clamp(p.x, lo.x + half, Math.max(lo.x + half, hi.x - half)) - p.x };
    });
  };
  const mainOrbs = menu === "main" ? layout(menuItems.map((it) => it.label), 25) : [];
  const pickOrbs = menu === "picker" ? layout(PET_IDS.map((id) => PETS[id].name), 27) : [];

  // Same for the speech bubble: slide it back inside the visible part of the window.
  const visLo = screen.current.x - pos.current.x, visHi = screen.current.x + screen.current.w - pos.current.x;
  const bubbleCx = clamp(cx, visLo + 156, Math.max(visLo + 156, visHi - 156));
  const tailShift = clamp(cx - bubbleCx, -110, 110);

  const breathClass = mode === "sleeping" ? "breath slow" : mode === "idle" || mode === "alert" ? "breath" : "";

  return (
    <div className="stage" data-mode={mode} data-fading={fading || undefined} style={{ width: WIN_W, height: WIN_H }}>
      {bubble && !menu && (
        <div className={`bubble${bubble.rich ? " rich" : ""}`} role="status" aria-live="polite" data-hit style={{ bottom: FLOOR_PAD + sh + 12, maxHeight: WIN_H - (FLOOR_PAD + sh + 12) - 8, left: bubbleCx, ["--tail" as string]: `${tailShift}px` }} onClick={() => { touch(); hush(); setBadge(false); if (modeRef.current === "alert") setMode("idle"); }}>
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
        const p = mainOrbs[i];
        return (
          <button key={it.key} data-hit className="orb" aria-label={it.label} style={{ left: p.x - 25, top: p.y - 25, animationDelay: `${i * 40}ms`, ["--tag-dx" as string]: `${p.tagDx}px` }}
            onClick={() => { touch(); it.run(); }}>
            <span className="glyph">{it.icon}</span><em>{it.label}</em>
          </button>
        );
      })}
      {menu === "picker" && PET_IDS.map((id, i) => {
        const p = pickOrbs[i];
        return (
          <button key={id} data-hit className={`orb pick ${id === petId ? "on" : ""}`} aria-label={`Switch to ${PETS[id].name}`} style={{ left: p.x - 27, top: p.y - 27, animationDelay: `${i * 40}ms`, ["--tag-dx" as string]: `${p.tagDx}px` }}
            onClick={() => { touch(); closeMenu(); setPetId(id); }}>
            <img src={PETS[id].src} alt={PETS[id].name} draggable={false} /><em>{PETS[id].name}</em>
          </button>
        );
      })}

      {poof && (
        <div key={poof.id} className="poof" style={{ left: poof.x, top: poof.y }}>
          {poof.puffs.map((p, i) => (
            <i key={i} style={{ ["--x" as string]: `${p.x}px`, ["--y" as string]: `${p.y}px`, ["--s" as string]: `${p.s}px`, animationDelay: `${p.d}ms` }} />
          ))}
        </div>
      )}
      {fx.map((f) => (
        <span key={f.id} className={`fx ${f.kind}`} style={{ left: f.x, top: f.y, ["--dx" as string]: `${f.dx}px` }}>
          {f.kind === "heart" ? "💕" : f.kind === "star" ? "✨" : f.kind === "confetti" ? pick(["🎉", "✨", "🎊", "⭐", "💜"]) : f.text}
        </span>
      ))}

      <div className="pet" style={{ left: (WIN_W - sw) / 2, bottom: FLOOR_PAD, width: sw, height: sh }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onContextMenu={onContextMenu}>
        <motion.div className="ground" style={{ opacity: op, scaleX: fly }} />
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
