// Curet, live: a Three.js layer over the page.
//   hero      the five pets bounce around the pink disc; they flee your cursor and pop when booped
//   showcase  the chosen pet tilts toward you, hops when poked, and spins when you swap
// One fixed, click-through canvas does all of it. People who ask for reduced motion get the plain page.
import * as THREE from "./assets/vendor/three.module.min.js";

if (matchMedia("(prefers-reduced-motion: reduce)").matches) throw new Error("reduced motion: three layer skipped");

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ------------------------------------------------------------------ renderer
const canvas = document.createElement("canvas");
canvas.id = "gl";
canvas.setAttribute("aria-hidden", "true");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
} catch {
  throw new Error("no WebGL: three layer skipped");
}
document.body.appendChild(canvas);
document.documentElement.classList.add("gl");

let W = innerWidth, H = innerHeight;
const pixelRatio = () => Math.max(1, Math.min(devicePixelRatio || 1, 2, Math.sqrt(4.5e6 / (innerWidth * innerHeight))));
renderer.setPixelRatio(pixelRatio());
renderer.setSize(W, H, false);
renderer.setClearColor(0x000000, 0);

// World units are CSS pixels: x to the right, y UP (so a screen y of 100 is world y -100), z toward you.
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, W / H, 10, 6000);
function fit() {
  W = innerWidth; H = innerHeight;
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  const z = H / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(W / 2, -H / 2, z);
  camera.lookAt(W / 2, -H / 2, 0);
  camera.updateProjectionMatrix();
}
fit();
addEventListener("resize", fit);

// ------------------------------------------------------------------ pets as textured planes
const IDS = ["ghost", "cat", "blob", "dragon", "redpanda"];
const LINES = {
  ghost: ["eep! hehe", "boo… that tickles!", "you found me!"],
  cat: ["mew!", "nyaa… again?", "hey, that’s my nose!"],
  blob: ["boing!", "blorp!", "squish squish!"],
  dragon: ["rawr! (a tiny one)", "*sneezes a smoke puff*", "grr… hehe"],
  redpanda: ["squeak!", "snack time?", "*wiggles tail*"],
};
const loader = new THREE.TextureLoader();
const tex = {};
const planeGeo = new THREE.PlaneGeometry(1, 1);
function texture(id) {
  if (!tex[id]) {
    tex[id] = { ready: false, ar: 1, map: loader.load(`assets/pets/${id}.png`, (t) => { tex[id].ready = true; tex[id].ar = t.image.height / t.image.width; renderer.initTexture(t); }) };
    tex[id].map.colorSpace = THREE.SRGBColorSpace;
    tex[id].map.anisotropy = 4;
  }
  return tex[id];
}
function makePlane(id) {
  const m = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: texture(id).map, transparent: true, depthWrite: false }));
  m.renderOrder = 2;
  m.frustumCulled = false;
  scene.add(m);
  return m;
}

// ---- hero pets
const hero = $("#top");
const heroBubble = $(".hero-bubble");
const heroText = heroBubble?.querySelector(".bubble-text");
const heroCopy = $(".hero-copy");
const pets = IDS.map((id, i) => ({
  id, mesh: makePlane(id), x: 0, y: 0, vx: 0, vy: 0, r: 60, w: 100, h: 100, land: 0, boop: 0, hop: rand(0.4, 2.2),
  seeded: false, order: i,
}));
let area = { left: 0, right: 0, top: 0, bottom: 0, ok: false, scale: 100 };
let heroRect = { top: 0, left: 0, width: 1, height: 1 };

function measureHero() {
  heroRect = hero.getBoundingClientRect();
  const narrow = heroRect.width < 860;
  const bubbleRect = heroBubble ? heroBubble.getBoundingClientRect() : null;
  if (narrow) {
    // on a phone the bubble sits under the button; the creatures get the room below it
    area = { left: 12, right: heroRect.width - 12, top: bubbleRect ? bubbleRect.bottom - heroRect.top + 14 : 440, bottom: heroRect.height - 28 };
  } else {
    const bubbleTop = bubbleRect ? bubbleRect.top - heroRect.top - 16 : heroRect.height - 300;
    area = { left: heroRect.width * 0.5, right: heroRect.width - 24, top: 92, bottom: bubbleTop };
  }
  if (!narrow && area.bottom - area.top < 150) area.bottom = area.top + 150;
  area.ok = narrow ? area.bottom - area.top >= 110 : true;
  area.scale = clamp((area.bottom - area.top) * (narrow ? 0.62 : 0.5), 56, 170);
}

function layoutPets() {
  for (const p of pets) {
    const t = texture(p.id);
    p.w = area.scale; p.h = area.scale * (t.ready ? t.ar : 1);
    p.r = Math.max(p.w, p.h) * 0.42;
    if (!p.seeded) {
      p.x = rand(area.left + p.r, area.right - p.r);
      p.y = rand(area.top + p.r, area.bottom - p.r);
      p.vx = rand(-200, 200); p.vy = rand(-200, 100);
      p.seeded = true;
    }
  }
}

const pointer = { x: -999, y: -999 };
let scrollVel = 0;

function stepPets(dt, t) {
  const spinny = 1 + Math.min(Math.abs(scrollVel) / 1400, 2.5);
  const lx = pointer.x - heroRect.left, ly = pointer.y - heroRect.top;
  for (const p of pets) {
    p.vy += 1700 * dt;
    // flee the cursor
    const dx = p.x - lx, dy = p.y - ly, d = Math.hypot(dx, dy);
    if (d < 170 && d > 1) {
      const k = (1 - d / 170) * 2600 * dt;
      p.vx += (dx / d) * k; p.vy += (dy / d) * k * 0.6;
    }
    // restless hopping
    p.hop -= dt * spinny;
    const floor = area.bottom - p.h / 2;
    if (p.hop <= 0 && p.y >= floor - 4) {
      p.vy = -rand(620, 900);
      p.vx += rand(-380, 380);
      p.hop = rand(0.5, 1.9);
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    // walls and floor
    if (p.x < area.left + p.r) { p.x = area.left + p.r; p.vx = Math.abs(p.vx) * 0.85; }
    if (p.x > area.right - p.r) { p.x = area.right - p.r; p.vx = -Math.abs(p.vx) * 0.85; }
    if (p.y < area.top + p.h / 2) { p.y = area.top + p.h / 2; p.vy = Math.abs(p.vy) * 0.5; }
    if (p.y > floor) {
      if (p.vy > 260) p.land = 1;
      p.y = floor; p.vy = -p.vy * 0.5; p.vx *= 0.9;
      if (Math.abs(p.vy) < 90) p.vy = 0;
    }
    p.vx = clamp(p.vx, -900, 900);
    p.land = Math.max(0, p.land - dt * 5);
    p.boop = Math.max(0, p.boop - dt * 2.2);
  }
  // pets bump into each other
  for (let i = 0; i < pets.length; i++) for (let j = i + 1; j < pets.length; j++) {
    const a = pets[i], b = pets[j];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
    if (d < min && d > 0.01) {
      const nx = dx / d, ny = dy / d, push = (min - d) / 2;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv < 0) { a.vx += nx * rv; a.vy += ny * rv; b.vx -= nx * rv; b.vy -= ny * rv; }
    }
  }
  const visible = heroRect.bottom > 0 && heroRect.top < H;
  for (const p of pets) {
    p.mesh.visible = visible && area.ok;
    if (!p.mesh.visible) continue;
    const stretch = clamp(Math.abs(p.vy) / 2400, 0, 0.2);
    const squish = p.land * 0.26 + p.boop * Math.sin(p.boop * 14) * 0.18;
    const sx = p.w * (1 - stretch * 0.6 + squish * 0.8), sy = p.h * (1 + stretch - squish);
    p.mesh.scale.set(sx, sy, 1);
    p.mesh.position.set(heroRect.left + p.x, -(heroRect.top + p.y) - (p.h - sy) / 2, 0);
    p.mesh.rotation.z = clamp(-p.vx / 1800, -0.4, 0.4) + Math.sin(t * 9 + p.order) * 0.03 * (p.vy === 0 ? 0 : 1);
  }
}

const boopLine = { until: 0, base: heroText?.textContent ?? "" };
function boopPet(p) {
  p.vy = -980; p.vx += rand(-300, 300); p.boop = 1; p.hop = rand(1, 2);
  if (heroText) {
    heroText.textContent = pick(LINES[p.id]);
    boopLine.until = performance.now() + 2200;
  }
}

// ------------------------------------------------------------------ showcase pet
const stageImg = $("#stage-pet");
const stageEl = $(".stage");
// the disc behind the showcase pet is drawn here too, so the pet can stand in front of it while the page's text stays above both
const discEl = $("#disc");
const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 90), new THREE.MeshBasicMaterial({ color: 0x9ed7ff, transparent: true, depthWrite: false }));
disc.renderOrder = 1;
scene.add(disc);
const discTarget = new THREE.Color(0x9ed7ff);
const petsRoot = $('.scene[data-scene="pets"]');
const stage = { id: "ghost", lean: 0, mesh: makePlane("ghost"), spin: 0, spinTo: null, hop: 0, tx: 0, ty: 0, rx: 0, ry: 0, rect: null, visible: false };
stage.mesh.renderOrder = 3;

function setStageTexture(id) {
  stage.id = id;
  stage.mesh.material.map = texture(id).map;
  stage.mesh.material.needsUpdate = true;
}
addEventListener("curet:pet", (e) => {
  const id = e.detail.id;
  if (e.detail.color) discTarget.set(e.detail.color);
  stage.spin = 0.001; stage.spinTo = id;
});

function stepStage(dt, t) {
  if (!stageImg) return;
  const r = stageImg.getBoundingClientRect();
  stage.rect = r;
  stage.visible = r.bottom > 0 && r.top < H && r.width > 0;
  stage.mesh.visible = stage.visible;
  disc.visible = stage.visible;
  if (!stage.visible) return;
  if (discEl) {
    const d = discEl.getBoundingClientRect();
    disc.position.set(d.left + d.width / 2, -(d.top + d.height / 2), -2);
    disc.scale.set(d.width, d.width, 1);
    disc.material.color.lerp(discTarget, 1 - Math.pow(0.0008, dt));
  }
  // through the held scene, the pet also leans with the scroll between one beat and the next
  const sp = petsRoot ? parseFloat(petsRoot.style.getPropertyValue("--p")) : NaN;
  const leanTo = petsRoot && petsRoot.classList.contains("is-live") && Number.isFinite(sp) ? (((sp * 5) % 1) - 0.5) * 0.9 : 0;
  stage.lean = lerp(stage.lean, leanTo, 1 - Math.pow(0.0005, dt));
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  // lean toward the pointer
  const nx = clamp((pointer.x - cx) / (W * 0.45), -1, 1), ny = clamp((pointer.y - cy) / (H * 0.45), -1, 1);
  stage.ty = lerp(stage.ty, nx * 0.55, 1 - Math.pow(0.001, dt));
  stage.tx = lerp(stage.tx, ny * 0.38, 1 - Math.pow(0.001, dt));
  let spin = 0, squash = 0;
  if (stage.spin > 0) {
    stage.spin += dt / 0.95;
    const k = clamp(stage.spin, 0, 1);
    const ease = 1 - Math.pow(1 - k, 3);
    spin = ease * Math.PI * 2;
    squash = Math.sin(k * Math.PI) * 0.1;
    if (k > 0.5 && stage.spinTo) { setStageTexture(stage.spinTo); stage.spinTo = null; }
    if (stage.spin >= 1) stage.spin = 0;
  }
  stage.hop = Math.max(0, stage.hop - dt * 1.6);
  const hopY = Math.sin((1 - stage.hop) * Math.PI) * (stage.hop > 0 ? 70 : 0);
  const bob = Math.sin(t * 2.4) * 7, breathe = 1 + Math.sin(t * 3.1) * 0.014;
  const ar = texture(stage.id).ready ? texture(stage.id).ar : r.height / r.width;
  // Fit the picture inside the disc, standing on the same baseline for every pet. The blob is far wider than the
  // others, so it is held smaller; it also stays upright and wobbles like jelly instead of tilting like a plate.
  const jelly = stage.id === "blob";
  const discW = discEl ? discEl.getBoundingClientRect().width : r.width;
  const w = Math.min(r.width, r.height / ar, discW * (jelly ? 0.74 : 0.96)), h = w * ar;
  const jiggle = stage.hop > 0 ? Math.sin(stage.hop * 18) * 0.06 * stage.hop : 0;
  const wobble = jelly ? Math.sin(t * 4.6) * 0.045 + Math.sin(t * 7.1) * 0.015 : 0;
  const sx = 1 + wobble + squash * 0.6 + jiggle, sy = 1 - wobble - squash - jiggle;
  const baseline = cy + r.height / 2;
  stage.mesh.scale.set(w * (breathe * sx), h * (breathe * sy), 1);
  stage.mesh.position.set(cx, -(baseline - (h * breathe * sy) / 2 - hopY + bob * 0.6), 0);
  const tilt = jelly ? 0.18 : 1;
  stage.mesh.rotation.set(stage.tx * tilt, stage.ty * tilt + spin + stage.lean * tilt, jelly ? 0 : Math.sin(t * 1.7) * 0.025);
}

// ------------------------------------------------------------------ input
addEventListener("pointermove", (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY;
}, { passive: true });

addEventListener("pointerdown", (e) => {
  // booping: hit-test the creatures (the canvas itself lets every click through)
  const lx = e.clientX - heroRect.left, ly = e.clientY - heroRect.top;
  if (area.ok && heroRect.bottom > 0) {
    const hit = [...pets].reverse().find((p) => Math.hypot(p.x - lx, p.y - ly) < p.r * 1.05);
    if (hit) { boopPet(hit); return; }
  }
  if (stage.visible && stage.rect) {
    const r = stage.rect;
    if (Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < r.height * 0.42) {
      stage.hop = 1;
    }
  }
});

let lastScroll = scrollY;
let handShown = false;
function overPet() {
  if (!area.ok || heroRect.bottom <= 0) return stage.visible && stage.rect && Math.hypot(pointer.x - (stage.rect.left + stage.rect.width / 2), pointer.y - (stage.rect.top + stage.rect.height / 2)) < stage.rect.height * 0.42;
  const lx = pointer.x - heroRect.left, ly = pointer.y - heroRect.top;
  return pets.some((p) => Math.hypot(p.x - lx, p.y - ly) < p.r * 1.05);
}

// ------------------------------------------------------------------ loop
let last = performance.now(), t = 0, blank = false;
function frame() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now; t += dt;

  scrollVel = lerp(scrollVel, (scrollY - lastScroll) / Math.max(dt, 0.001), 0.2);
  lastScroll = scrollY;
  measureHero();
  layoutPets();
  stepPets(dt, t);
  stepStage(dt, t);

  // restore the hero bubble's text after a boop
  if (boopLine.until && now > boopLine.until && heroText) { heroText.textContent = boopLine.base; boopLine.until = 0; }
  const hand = overPet();
  if (hand !== handShown) { handShown = hand; document.body.style.cursor = hand ? "pointer" : ""; }

  // nothing to draw (the day scene, the board, the setup steps): leave the GPU alone
  const heroOn = heroRect.bottom > 0 && heroRect.top < H;
  if (!heroOn && !stage.visible) {
    if (!blank) { renderer.clear(); blank = true; }
    return;
  }
  blank = false;
  renderer.render(scene, camera);
}
// One frame loop. GSAP's ticker already runs smooth scrolling and the scroll scenes; adding ours last means
// the canvas is drawn from the page position of that same frame instead of the previous one.
if (window.gsap) gsap.ticker.add(frame);
else (function loop() { frame(); requestAnimationFrame(loop); })();
