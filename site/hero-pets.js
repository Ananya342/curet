// The hero's seven pets, dressed up. Plain page elements (no canvas), so each can wear an outfit, show a tagline
// when you hover or tab to it, and jump when you click it. Every pet keeps its own spot: rows never overlap,
// hats included, and the layout only changes when the page's size does.
//
// The outfits are drawn the same way as the app's dress-up (src/pet/Accessories.tsx), at the same anchor points
// (src/pets.ts): the site's pictures have the same proportions as the app's, so the fractions carry over.

const hero = document.getElementById("top");
const nav = hero?.querySelector(".nav");
const bubble = hero?.querySelector(".hero-bubble");
const bubbleText = bubble?.querySelector(".bubble-text");
const copy = hero?.querySelector(".hero-copy");
const catPeek = document.querySelector(".peek-cat .crop");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- the pets ---------------------------------------------------------------------------------------------

const PETS = {
  ghost: {
    name: "Boo", ar: 519 / 540, tagline: "Keeps your deadlines from haunting you.",
    eyes: [[0.3, 0.4], [0.6, 0.4]], eye: [0.075, 0.085], head: [0.45, 0.1, 0.62, 0], neck: [0.45, 0.6, 0.7],
    outfit: { hat: { style: "party", color: "#ff8fb8" } },
    lines: ["eep! hehe", "boo… that tickles!", "you found me!"],
  },
  cat: {
    name: "Mochi", ar: 900 / 756, tagline: "Naps until something is due. Then pounces.",
    eyes: [[0.34, 0.41], [0.81, 0.42]], eye: [0.07, 0.075], head: [0.5, 0.1, 0.62, 3], neck: [0.55, 0.7, 0.6],
    outfit: { glasses: { style: "round", color: "#3a2a2a" }, collar: { color: "#ff4f5e", tag: "bell" } },
    lines: ["mew!", "nyaa… again?", "hey, that’s my nose!"],
  },
  blob: {
    name: "Jelly", ar: 638 / 766, tagline: "Bounces you back on track.",
    eyes: [[0.33, 0.47], [0.66, 0.47]], eye: [0.056, 0.07], head: [0.5, 0.15, 0.8, 0], neck: [0.5, 0.66, 0.66],
    outfit: { hat: { style: "crown", color: "#ffd95a" } },
    lines: ["boing!", "blorp!", "squish squish!"],
  },
  dragon: {
    name: "Ember", ar: 794 / 620, tagline: "Guards your calendar like treasure.",
    eyes: [[0.46, 0.37], [0.82, 0.36]], eye: [0.085, 0.07], head: [0.64, 0.19, 0.56, 4], neck: [0.6, 0.56, 0.4],
    outfit: { glasses: { style: "shades", color: "#3a2a2a" } },
    lines: ["rawr! (a tiny one)", "*sneezes a smoke puff*", "grr… hehe"],
  },
  redpanda: {
    name: "Maple", ar: 698 / 646, tagline: "Cheers for every small win.",
    eyes: [[0.2, 0.39], [0.53, 0.41]], eye: [0.055, 0.058], head: [0.43, 0.1, 0.56, -3], neck: [0.42, 0.62, 0.48],
    outfit: { hat: { style: "beanie", color: "#4cc38a" } },
    lines: ["squeak!", "snack time?", "*wiggles tail*"],
  },
  perry: {
    name: "Perry", ar: 554 / 405, tagline: "Secret agent of your schedule.",
    eyes: [[0.195, 0.42], [0.645, 0.42]], eye: [0.075, 0.06], head: [0.42, 0.22, 0.76, 0], neck: [0.42, 0.64, 0.62],
    outfit: { collar: { color: "#ff9248", tag: "star" } },
    lines: ["krrrr!", "*tips fedora*", "agent P, reporting!"],
  },
  dog: {
    name: "Biscuit", ar: 530 / 473, tagline: "Fetches whatever is due next.",
    eyes: [[0.34, 0.33], [0.65, 0.33]], eye: [0.06, 0.05], head: [0.5, 0.11, 0.58, 0], neck: [0.5, 0.57, 0.38],
    outfit: { cap: { color: "#3b82f6" } },
    lines: ["arf!", "*wags tail*", "woof! again again!"],
  },
};

// Back row first. The arrangement that gives each pet the most room wins.
const ROWS = [
  [["ghost", "cat", "dragon", "perry", "blob", "redpanda", "dog"]],
  [["ghost", "dragon", "redpanda"], ["cat", "perry", "blob", "dog"]],
  [["ghost", "dragon"], ["redpanda", "perry", "dog"], ["cat", "blob"]],
];
// Space between pets, in pet sizes. Rows overlap a little, like a group photo: the front row stands over the back row's feet.
const GAP_X = 0.04, GAP_Y = -0.1;

// ---- outfits, as SVG ---------------------------------------------------------------------------------------

const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
};
const isDark = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 < 110;
};
const ell = (cx, cy, rx, ry) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
const rr = (x, y, w, h, r) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
const heart = (cx, cy, r) =>
  `M${cx} ${cy + r * 0.9}C${cx - r * 1.5} ${cy - r * 0.1} ${cx - r * 0.9} ${cy - r * 1.2} ${cx} ${cy - r * 0.45}C${cx + r * 0.9} ${cy - r * 1.2} ${cx + r * 1.5} ${cy - r * 0.1} ${cx} ${cy + r * 0.9}Z`;
const star = (cx, cy, r) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, m = i % 2 ? r * 0.48 : r;
    return `${i ? "L" : "M"}${(cx + Math.cos(a) * m).toFixed(1)} ${(cy + Math.sin(a) * m).toFixed(1)}`;
  }).join("") + "Z";

let gloss = "";
const solid = (d, fill) =>
  `<path d="${d}" fill="${fill}" stroke="rgba(40,25,30,0.35)" stroke-width="1.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><path d="${d}" fill="url(#${gloss})"/>`;

const HAT_SCALE = { top: 0.85, party: 0.64, beanie: 0.95, crown: 0.66 };
const HAT_RISE = { top: 66, party: 124, beanie: 73, crown: 59 };
const CAP_RISE = 42;

function hat(style, color) {
  const band = isDark(color) ? "#ff4f5e" : shade(color, -0.45);
  const light = isDark(color) ? "#ffd95a" : "#fff";
  switch (style) {
    case "top": return solid(ell(0, -6, 50, 9), shade(color, -0.12)) + solid(rr(-28, -60, 56, 54, 6), color) + solid(ell(0, -60, 28, 6), shade(color, 0.18)) + `<path d="${rr(-28, -26, 56, 11, 1)}" fill="${band}"/>`;
    case "party": return solid("M0 -112L36 -6Q0 8 -36 -6Z", color)
      + [[-12, -40], [12, -70], [-18, -18], [17, -26], [2, -92], [-2, -52]].map(([x, y]) => `<path d="${ell(x, y, 5, 5)}" fill="${light}" opacity="0.9"/>`).join("")
      + solid(ell(0, -114, 10, 10), light);
    case "beanie": return solid("M-44 0C-44 -64 44 -64 44 0Z", color) + solid(ell(0, -62, 12, 11), shade(color, 0.35)) + solid(rr(-48, -8, 96, 22, 10), shade(color, -0.2))
      + [-34, -20, -6, 8, 22, 36].map((x) => `<path d="M${x} -5v16" stroke="${shade(color, -0.38)}" stroke-width="2" stroke-linecap="round"/>`).join("");
    case "crown": return solid("M-44 4L-44 -40L-22 -20L0 -52L22 -20L44 -40L44 4Z", color) + `<path d="${rr(-44, -10, 88, 12, 2)}" fill="${shade(color, -0.25)}"/>`
      + [[-44, -42], [0, -54], [44, -42]].map(([x, y]) => solid(ell(x, y, 5, 5), shade(color, 0.3))).join("")
      + [[-24, "#4cc38a"], [0, "#ff4f5e"], [24, "#3b82f6"]].map(([x, c]) => solid(ell(x, -4, 5, 5), c)).join("");
  }
  return "";
}

function cap(color) {
  const brim = shade(color, -0.22);
  return solid("M-46 10C-46 -52 46 -52 46 10Z", color)
    + ["M0 -37V8", "M-20 -32Q-26 -10 -24 8", "M20 -32Q26 -10 24 8"].map((d) => `<path d="${d}" stroke="${shade(color, -0.3)}" stroke-width="1.5" fill="none"/>`).join("")
    + solid(ell(0, -37, 6, 3.5), brim) + solid("M-50 8C-30 2 30 2 50 8C54 16 40 24 0 24C-40 24 -54 16 -50 8Z", brim);
}

function lens(style, x, y, r, color) {
  const sw = Math.max(1.6, r * 0.2);
  const frame = `stroke="${color}" stroke-width="${sw}" stroke-linejoin="round"`;
  switch (style) {
    case "round": return `<path d="${ell(x, y, r, r)}" fill="rgba(210,235,255,0.28)" ${frame}/><path d="M${x - r * 0.5} ${y - r * 0.35}q${r * 0.25} ${-r * 0.3} ${r * 0.6} ${-r * 0.3}" stroke="rgba(255,255,255,0.8)" stroke-width="${sw * 0.6}" stroke-linecap="round" fill="none"/>`;
    case "shades": return `<path d="${rr(x - r * 1.2, y - r * 0.85, r * 2.4, r * 1.7, r * 0.6)}" fill="rgba(25,20,32,0.92)" ${frame}/><path d="M${x - r * 0.75} ${y - r * 0.35}l${r * 0.5} ${-r * 0.25}" stroke="rgba(255,255,255,0.7)" stroke-width="${sw * 0.7}" stroke-linecap="round"/>`;
    case "heart": return `<path d="${heart(x, y + r * 0.1, r * 0.95)}" fill="rgba(255,80,140,0.72)" ${frame}/>`;
    case "star": return `<path d="${star(x, y, r * 1.15)}" fill="rgba(255,210,70,0.78)" ${frame}/>`;
  }
  return "";
}

// How wide each lens style is, in lens radii, so two lenses never crowd past the space between the eyes.
const LENS_HALF = { round: 1, shades: 1.2, heart: 1.15, star: 1.15 };

function glasses(p, W, H, { style, color }) {
  const [a, b] = p.eyes.map(([x, y]) => ({ x: x * W, y: y * H })).sort((m, n) => m.x - n.x);
  const r = Math.min(Math.max(p.eye[0] * W, p.eye[1] * H) * (style === "shades" ? 1.25 : 1.5), ((b.x - a.x) * 0.47) / LENS_HALF[style]);
  const sw = Math.max(1.6, r * 0.2);
  const half = style === "shades" ? r * 1.2 : r;
  const line = `stroke="${color}" stroke-width="${sw}" stroke-linecap="round" fill="none"`;
  return `<path d="M${a.x - half} ${a.y - r * 0.2}l${-r * 0.5} ${-r * 0.25}M${b.x + half} ${b.y - r * 0.2}l${r * 0.5} ${-r * 0.25}" ${line}/>`
    + `<path d="M${a.x + half * 0.9} ${a.y - r * 0.25}Q${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - r * 0.7} ${b.x - half * 0.9} ${b.y - r * 0.25}" ${line}/>`
    + lens(style, a.x, a.y, r, color) + lens(style, b.x, b.y, r, color);
}

function collar(p, W, H, { color, tag }) {
  const cx = p.neck[0] * W, cy = p.neck[1] * H, cw = p.neck[2] * W;
  const t = Math.max(4, cw * 0.09), sag = cw * 0.18;
  const d = `M${cx - cw / 2} ${cy - t / 2}Q${cx} ${cy + sag} ${cx + cw / 2} ${cy - t / 2}L${cx + cw / 2} ${cy + t / 2}Q${cx} ${cy + sag + t} ${cx - cw / 2} ${cy + t / 2}Z`;
  const bx = cx, by = 0.5 * (cy + t / 2) + 0.5 * (cy + sag + t);
  const ts = Math.max(4, t * 0.9);
  let out = solid(d, color)
    + `<path d="M${cx - cw / 2 + 2} ${cy}Q${cx} ${cy + sag + t / 2} ${cx + cw / 2 - 2} ${cy}" stroke="rgba(255,255,255,0.35)" stroke-width="${Math.max(1, t * 0.15)}" stroke-dasharray="${t * 0.5} ${t * 0.5}" fill="none"/>`
    + `<path d="${ell(bx, by + ts * 0.15, ts * 0.32, ts * 0.32)}" fill="none" stroke="#d9b45a" stroke-width="${Math.max(1, ts * 0.16)}"/>`;
  if (tag === "heart") out += solid(heart(bx, by + ts * 1.15, ts), "#ff6f9f");
  if (tag === "star") out += solid(star(bx, by + ts * 1.15, ts * 1.05), "#f5c542");
  if (tag === "bell") out += solid(ell(bx, by + ts * 1.05, ts * 0.85, ts * 0.85), "#f5c542")
    + `<path d="M${bx - ts * 0.6} ${by + ts * 1.25}h${ts * 1.2}" stroke="rgba(90,60,20,0.6)" stroke-width="${Math.max(1, ts * 0.14)}" stroke-linecap="round"/>`;
  return out;
}

/** The outfit over a sprite drawn 100 units wide. */
function outfitSvg(id, o = PETS[id].outfit, key = id) {
  const p = PETS[id], W = 100, H = 100 * p.ar;
  gloss = `gloss-${key}`;
  let body = "";
  if (o.collar) body += collar(p, W, H, o.collar);
  if (o.glasses) body += glasses(p, W, H, o.glasses);
  if (o.hat || o.cap) {
    const [hx, hy, hw, tilt] = p.head;
    const scale = (o.hat ? HAT_SCALE[o.hat.style] : 0.8) * hw * W / 100;
    body += `<g transform="translate(${hx * W} ${hy * H}) rotate(${tilt}) scale(${scale})">${o.hat ? hat(o.hat.style, o.hat.color) : cap(o.cap.color)}</g>`;
  }
  return `<svg class="hp-acc" viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs><linearGradient id="${gloss}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.18"/></linearGradient></defs>${body}</svg>`;
}

/** How far the hat sticks up above the picture, as a fraction of the pet's width. */
function headroom(id) {
  const p = PETS[id], o = p.outfit;
  if (!o.hat && !o.cap) return 0;
  const scale = (o.hat ? HAT_SCALE[o.hat.style] : 0.8) * p.head[2];
  return Math.max(0, (o.hat ? HAT_RISE[o.hat.style] : CAP_RISE) * scale / 100 - p.head[1] * p.ar);
}

// ---- building the pets --------------------------------------------------------------------------------------

const layer = document.createElement("div");
layer.className = "hero-pets";
const els = {};
Object.keys(PETS).forEach((id, i) => {
  const p = PETS[id];
  const el = document.createElement("button");
  el.type = "button";
  el.className = "hp";
  el.style.setProperty("--i", i);
  el.setAttribute("aria-label", `${p.name}: ${p.tagline}`);
  el.innerHTML = `<span class="hp-hop"><span class="hp-body"><img src="assets/pets/${id}.png" alt="" draggable="false">${outfitSvg(id)}</span></span>`
    + `<span class="hp-tip" aria-hidden="true"><b>${p.name}</b>${p.tagline}</span>`;
  layer.appendChild(el);
  els[id] = el;
});
if (hero) hero.appendChild(layer);

// ---- layout -------------------------------------------------------------------------------------------------

/** The right edge of the hero's words, so the pets never stand over them. */
function textRight() {
  let right = 0;
  for (const el of copy ? copy.children : []) {
    const r = document.createRange();
    r.selectNodeContents(el);
    right = Math.max(right, r.getBoundingClientRect().right);
  }
  return right - hero.getBoundingClientRect().left;
}

function area() {
  const width = hero.clientWidth, height = hero.clientHeight;
  const navBottom = nav ? nav.offsetTop + nav.offsetHeight : 90;
  // offsetTop rather than the on-screen rect, so the bubble rising into place doesn't drag the pets with it
  const bTop = bubble ? bubble.offsetTop : height - 300;
  const bBottom = bubble ? bTop + bubble.offsetHeight : height - 150;
  const side = Math.max(16, Math.min(72, width * 0.05));
  return width < 860
    // on a phone the bubble sits under the button; the pets get the room below it, clear of the peeking cat
    ? { left: side, right: width - side, top: bBottom + 26, bottom: height - (catPeek ? catPeek.offsetHeight : 60) - 8 }
    : { left: Math.max(width * 0.5, textRight() + 32), right: width - side, top: navBottom + 4, bottom: bTop - 14 };
}

// A pet's box is size × size; its picture fits inside, and a hat may rise above it.
const boxOf = (id) => {
  const p = PETS[id], k = id === "blob" ? 0.84 : 1;
  const w = (p.ar > 1 ? 1 / p.ar : 1) * k;
  return { w, h: w * p.ar, rise: headroom(id) * w };
};
/** Height of an arrangement for size 1: each row as tall as its tallest pet plus hat, with gaps between rows. */
const heightOf = (rows) => rows.reduce((sum, row) => sum + Math.max(...row.map((id) => { const b = boxOf(id); return b.h + b.rise; })), 0) + GAP_Y * (rows.length - 1);
const widthOf = (rows) => Math.max(...rows.map((r) => r.length)) * (1 + GAP_X) - GAP_X;

let current = null, size = 0;
function layout() {
  if (!hero) return;
  const a = area();
  const w = a.right - a.left, h = a.bottom - a.top;
  const fit = (rows) => Math.min(w / widthOf(rows), h / heightOf(rows));
  let best = ROWS.reduce((m, rows) => (fit(rows) > fit(m) ? rows : m), ROWS[0]);
  // Only switch arrangement when the new one is clearly roomier, so a few pixels can't flip it back and forth.
  if (current && best !== current && fit(best) < fit(current) * 1.08) best = current;
  current = best;
  size = Math.min(fit(best), Math.max(170, hero.clientWidth * 0.14));
  layer.style.setProperty("--s", `${size}px`);
  layer.hidden = size < 34;
  const cx = (a.left + a.right) / 2;
  let floor = a.bottom;
  for (let ri = best.length - 1; ri >= 0; ri--) {
    const row = best[ri];
    row.forEach((id, k) => {
      const b = boxOf(id), el = els[id];
      const x = cx + (k - (row.length - 1) / 2) * size * (1 + GAP_X);
      el.style.width = `${b.w * size}px`;
      el.style.height = `${b.h * size}px`;
      el.style.setProperty("--rise", `${b.rise * size}px`);
      el.style.transform = `translate(${x - (b.w * size) / 2}px, ${floor - b.h * size}px)`;
      el.style.zIndex = String(10 + ri);
    });
    floor -= (Math.max(...row.map((id) => { const b = boxOf(id); return b.h + b.rise; })) + GAP_Y) * size;
  }
  // After the first placement, moves glide instead of jumping.
  requestAnimationFrame(() => layer.classList.add("placed"));
}

let pending = 0;
const relayout = () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(layout); };
if (hero) {
  layout();
  addEventListener("resize", relayout);
  document.fonts?.ready.then(relayout);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(relayout);
    ro.observe(hero);
    if (bubble) ro.observe(bubble);
  }
}

// ---- interaction --------------------------------------------------------------------------------------------

/** Keep a tagline inside the hero: shift it sideways when its pet stands near an edge. */
function placeTip(el) {
  const tip = el.querySelector(".hp-tip");
  tip.style.setProperty("--shift", "0px");
  const r = tip.getBoundingClientRect(), box = hero.getBoundingClientRect();
  const over = r.right - (box.right - 12), under = box.left + 12 - r.left;
  if (over > 0) tip.style.setProperty("--shift", `${-over}px`);
  else if (under > 0) tip.style.setProperty("--shift", `${under}px`);
}

const base = bubbleText?.textContent ?? "";
let lineTimer = 0;
function say(text) {
  if (!bubbleText) return;
  bubbleText.textContent = text;
  clearTimeout(lineTimer);
  lineTimer = setTimeout(() => { bubbleText.textContent = base; }, 2400);
}

function play(el, cls, ms) {
  if (reduce) return;
  const hop = el.querySelector(".hp-hop");
  hop.classList.remove("hop", "jump");
  void hop.offsetWidth; // restart the animation if it was mid-way
  hop.classList.add(cls);
  clearTimeout(el._t);
  el._t = setTimeout(() => hop.classList.remove(cls), ms);
}

for (const [id, el] of Object.entries(els)) {
  el.addEventListener("pointerenter", () => placeTip(el));
  el.addEventListener("focus", () => placeTip(el));
  el.addEventListener("click", () => {
    const lines = PETS[id].lines;
    say(lines[Math.floor(Math.random() * lines.length)]);
    play(el, "jump", 620);
  });
}

// Now and then one pet, never two at once and never the one you're pointing at, gives a small hop.
if (!reduce && hero) {
  const ids = Object.keys(els);
  const moving = (id) => els[id].querySelector(".hp-hop").matches(".hop, .jump");
  const idle = () => {
    const free = ids.filter((id) => !els[id].matches(":hover, :focus-visible"));
    const id = free[Math.floor(Math.random() * free.length)];
    if (id && !ids.some(moving) && hero.getBoundingClientRect().bottom > 0) play(els[id], "hop", 480);
    setTimeout(idle, 1800 + Math.random() * 2600);
  };
  setTimeout(idle, 2400);
}

// ---- dressed pets elsewhere on the page (the dress-up tile): <span data-dressed="cat"></span> ------------------
for (const el of document.querySelectorAll("[data-dressed]")) {
  const id = el.dataset.dressed;
  if (!PETS[id]) continue;
  el.classList.add("dressed-pet");
  el.style.setProperty("--ar", PETS[id].ar);
  el.style.setProperty("--rise", headroom(id));
  el.innerHTML = `<img src="assets/pets/${id}.png" alt="" loading="lazy" draggable="false">${outfitSvg(id)}`;
}
