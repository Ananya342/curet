// Curet, live: a Three.js layer over the page.
//   showcase  the chosen pet tilts toward you, hops when poked, and spins when you swap
// (The hero's seven pets are plain page elements, in hero-pets.js, so they can wear outfits and show taglines.)
// One fixed, click-through canvas does all of it. People who ask for reduced motion get the plain page.
import * as THREE from "./assets/vendor/three.module.min.js";

if (matchMedia("(prefers-reduced-motion: reduce)").matches) throw new Error("reduced motion: three layer skipped");

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

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

const pointer = { x: -999, y: -999 };

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
const stage = { id: "ghost", next: null, lean: 0, mesh: makePlane("ghost"), spin: 0, spinTo: null, hop: 0, tx: 0, ty: 0, rx: 0, ry: 0, rect: null, visible: false };
stage.mesh.renderOrder = 3;

function setStageTexture(id) {
  stage.id = id;
  stage.mesh.material.map = texture(id).map;
  stage.mesh.material.needsUpdate = true;
}
// Changing pet turns the showcase pet edge-on, swaps the picture, and turns it back. A change that arrives
// mid-turn waits for the turn to finish, so scrolling quickly never restarts or stacks turns.
const TURN = 1.1; // seconds for the whole turn
addEventListener("curet:pet", (e) => {
  if (e.detail.color) discTarget.set(e.detail.color);
  stage.next = e.detail.id;
  if (stage.spin === 0 && stage.next !== stage.id) { stage.spin = 0.001; stage.spinTo = stage.next; }
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
    stage.spin += dt / TURN;
    const k = clamp(stage.spin, 0, 1);
    // ease in to edge-on, swap while the picture is a sliver, ease out facing you again. The two halves meet at
    // the same speed, so the turn flows straight through the swap.
    spin = k < 0.5 ? (k * 2) ** 3 * (Math.PI / 2) : -((1 - (k - 0.5) * 2) ** 3) * (Math.PI / 2);
    squash = Math.sin(k * Math.PI) * 0.04;
    if (k >= 0.5 && stage.spinTo) { setStageTexture(stage.spinTo); stage.spinTo = null; }
    if (stage.spin >= 1) {
      stage.spin = 0;
      if (stage.next && stage.next !== stage.id) { stage.spin = 0.001; stage.spinTo = stage.next; }
    }
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
  // poking the showcase pet (the canvas itself lets every click through)
  if (stage.visible && stage.rect) {
    const r = stage.rect;
    if (Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < r.height * 0.42) {
      stage.hop = 1;
    }
  }
});

let handShown = false;
function overPet() {
  return stage.visible && stage.rect && Math.hypot(pointer.x - (stage.rect.left + stage.rect.width / 2), pointer.y - (stage.rect.top + stage.rect.height / 2)) < stage.rect.height * 0.42;
}

// ------------------------------------------------------------------ loop
let last = performance.now(), t = 0, blank = false;
function frame() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now; t += dt;

  stepStage(dt, t);
  const hand = overPet();
  if (hand !== handShown) { handShown = hand; document.body.style.cursor = hand ? "pointer" : ""; }

  // nothing to draw (the hero, the day scene, the board, the setup steps): leave the GPU alone
  if (!stage.visible) {
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
