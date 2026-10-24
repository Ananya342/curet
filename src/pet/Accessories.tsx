import type { CSSProperties } from "react";
import type { PetView } from "../pets";
import type { GlassesStyle, HatStyle, Outfit, TagStyle } from "../accessories";

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour. */
const shade = (hex: string, amt: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
};
const isDark = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 < 110;
};
const ell = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
const heart = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy + r * 0.9}C${cx - r * 1.5} ${cy - r * 0.1} ${cx - r * 0.9} ${cy - r * 1.2} ${cx} ${cy - r * 0.45}C${cx + r * 0.9} ${cy - r * 1.2} ${cx + r * 1.5} ${cy - r * 0.1} ${cx} ${cy + r * 0.9}Z`;
const star = (cx: number, cy: number, r: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, m = i % 2 ? r * 0.48 : r;
    return `${i ? "L" : "M"}${(cx + Math.cos(a) * m).toFixed(1)} ${(cy + Math.sin(a) * m).toFixed(1)}`;
  }).join("") + "Z";

/** A clay-ish solid: the colour, then a soft highlight on top so it matches the pets' lighting. */
const Solid = ({ d, fill, stroke }: { d: string; fill: string; stroke?: string }) => (
  <>
    <path d={d} fill={fill} stroke={stroke ?? "rgba(40, 25, 30, 0.35)"} strokeWidth={1.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    <path d={d} fill="url(#acc-gloss)" />
  </>
);

// Hats and caps are drawn 100 units wide around (0, 0), the middle of where they meet the head.
const HAT_SCALE: Record<HatStyle, number> = { top: 0.85, party: 0.5, beanie: 0.95, crown: 0.55 };

function Hat({ style, color }: { style: HatStyle; color: string }) {
  const band = isDark(color) ? "#ff4f5e" : shade(color, -0.45);
  switch (style) {
    case "top": return <>
      <Solid d={ell(0, -6, 50, 9)} fill={shade(color, -0.12)} />
      <Solid d={rr(-28, -82, 56, 76, 6)} fill={color} />
      <Solid d={ell(0, -82, 28, 6)} fill={shade(color, 0.18)} />
      <path d={rr(-28, -26, 56, 11, 1)} fill={band} />
    </>;
    case "party": return <>
      <Solid d="M0 -112L36 -6Q0 8 -36 -6Z" fill={color} />
      {[[-12, -40], [12, -70], [-18, -18], [17, -26], [2, -92], [-2, -52]].map(([x, y], i) =>
        <path key={i} d={ell(x, y, 5, 5)} fill={isDark(color) ? "#ffd95a" : "#fff"} opacity={0.9} />)}
      <Solid d={ell(0, -114, 10, 10)} fill={isDark(color) ? "#ffd95a" : "#fff"} />
    </>;
    case "beanie": return <>
      <Solid d="M-44 0C-44 -64 44 -64 44 0Z" fill={color} />
      <Solid d={ell(0, -62, 12, 11)} fill={shade(color, 0.35)} />
      <Solid d={rr(-48, -8, 96, 22, 10)} fill={shade(color, -0.2)} />
      {[-34, -20, -6, 8, 22, 36].map((x) => <path key={x} d={`M${x} -5v16`} stroke={shade(color, -0.38)} strokeWidth={2} strokeLinecap="round" />)}
    </>;
    case "crown": return <>
      <Solid d="M-44 4L-44 -40L-22 -20L0 -52L22 -20L44 -40L44 4Z" fill={color} />
      <path d={rr(-44, -10, 88, 12, 2)} fill={shade(color, -0.25)} />
      {[[-44, -42], [0, -54], [44, -42]].map(([x, y], i) => <Solid key={i} d={ell(x, y, 5, 5)} fill={shade(color, 0.3)} />)}
      {[[-24, "#4cc38a"], [0, "#ff4f5e"], [24, "#3b82f6"]].map(([x, c]) => <Solid key={x} d={ell(x as number, -4, 5, 5)} fill={c as string} />)}
    </>;
  }
}

function Cap({ color, side }: { color: string; side: boolean }) {
  const brim = shade(color, -0.22);
  return side ? <>
    <Solid d="M28 2C55 0 76 6 80 13C62 18 40 16 18 11Z" fill={brim} />
    <Solid d="M-42 12C-42 -50 40 -50 40 12Z" fill={color} />
    <path d="M-4 -38C-10 -20 -10 0 -8 12" stroke={shade(color, -0.3)} strokeWidth={1.5} fill="none" />
    <Solid d={ell(-2, -38, 5, 3)} fill={brim} />
  </> : <>
    <Solid d="M-46 10C-46 -52 46 -52 46 10Z" fill={color} />
    {["M0 -37V8", "M-20 -32Q-26 -10 -24 8", "M20 -32Q26 -10 24 8"].map((d) =>
      <path key={d} d={d} stroke={shade(color, -0.3)} strokeWidth={1.5} fill="none" />)}
    <Solid d={ell(0, -37, 6, 3.5)} fill={brim} />
    <Solid d="M-50 8C-30 2 30 2 50 8C54 16 40 24 0 24C-40 24 -54 16 -50 8Z" fill={brim} />
  </>;
}

function Lens({ style, x, y, r, color }: { style: GlassesStyle; x: number; y: number; r: number; color: string }) {
  const sw = Math.max(1.6, r * 0.2);
  const frame = { stroke: color, strokeWidth: sw, strokeLinejoin: "round" as const };
  switch (style) {
    case "round": return <>
      <path d={ell(x, y, r, r)} fill="rgba(210, 235, 255, 0.28)" {...frame} />
      <path d={`M${x - r * 0.5} ${y - r * 0.35}q${r * 0.25} ${-r * 0.3} ${r * 0.6} ${-r * 0.3}`} stroke="rgba(255,255,255,0.8)" strokeWidth={sw * 0.6} strokeLinecap="round" fill="none" />
    </>;
    case "shades": return <>
      <path d={rr(x - r * 1.2, y - r * 0.85, r * 2.4, r * 1.7, r * 0.6)} fill="rgba(25, 20, 32, 0.92)" {...frame} />
      <path d={`M${x - r * 0.75} ${y - r * 0.35}l${r * 0.5} ${-r * 0.25}`} stroke="rgba(255,255,255,0.7)" strokeWidth={sw * 0.7} strokeLinecap="round" />
    </>;
    case "heart": return <path d={heart(x, y + r * 0.1, r * 1.1)} fill="rgba(255, 80, 140, 0.72)" {...frame} />;
    case "star": return <path d={star(x, y, r * 1.35)} fill="rgba(255, 210, 70, 0.78)" {...frame} />;
  }
}

function Glasses({ view, W, H, style, color, side }: { view: PetView; W: number; H: number; style: GlassesStyle; color: string; side: boolean }) {
  const r = Math.max(view.eye.rx * W, view.eye.ry * H) * (style === "shades" ? 1.25 : 1.5);
  const pts = view.eyes.map((e) => ({ x: e.x * W, y: e.y * H }));
  const sw = Math.max(1.6, r * 0.2);
  const half = style === "shades" ? r * 1.2 : r;
  const line = { stroke: color, strokeWidth: sw, strokeLinecap: "round" as const, fill: "none" };
  if (side || pts.length === 1) {
    const p = pts[0];
    return <g>
      <path d={`M${p.x - half} ${p.y - r * 0.2}L${view.head.x * W - view.head.w * W * 0.35} ${p.y - r * 0.5}`} {...line} />
      <Lens style={style} x={p.x} y={p.y} r={r} color={color} />
    </g>;
  }
  const [a, b] = pts[0].x < pts[1].x ? [pts[0], pts[1]] : [pts[1], pts[0]];
  return <g>
    <path d={`M${a.x - half} ${a.y - r * 0.2}l${-r * 0.5} ${-r * 0.25}M${b.x + half} ${b.y - r * 0.2}l${r * 0.5} ${-r * 0.25}`} {...line} />
    <path d={`M${a.x + half * 0.9} ${a.y - r * 0.25}Q${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - r * 0.7} ${b.x - half * 0.9} ${b.y - r * 0.25}`} {...line} />
    <Lens style={style} x={a.x} y={a.y} r={r} color={color} />
    <Lens style={style} x={b.x} y={b.y} r={r} color={color} />
  </g>;
}

function Collar({ view, W, H, color, tag, side }: { view: PetView; W: number; H: number; color: string; tag: TagStyle; side: boolean }) {
  const cx = view.neck.x * W, cy = view.neck.y * H, cw = view.neck.w * W;
  const t = Math.max(5, cw * (side ? 0.2 : 0.12)), sag = cw * (side ? 0.12 : 0.2);
  const d = `M${cx - cw / 2} ${cy - t / 2}Q${cx} ${cy + sag} ${cx + cw / 2} ${cy - t / 2}L${cx + cw / 2} ${cy + t / 2}Q${cx} ${cy + sag + t} ${cx - cw / 2} ${cy + t / 2}Z`;
  // The tag hangs off the bottom edge: in the middle from the front, toward the chest from the side.
  const u = side ? 0.78 : 0.5;
  const bx = (1 - u) ** 2 * (cx - cw / 2) + 2 * u * (1 - u) * cx + u * u * (cx + cw / 2);
  const by = (1 - u) ** 2 * (cy + t / 2) + 2 * u * (1 - u) * (cy + sag + t) + u * u * (cy + t / 2);
  const ts = Math.max(4, t * 0.9);
  return <g>
    <Solid d={d} fill={color} />
    <path d={`M${cx - cw / 2 + 2} ${cy}Q${cx} ${cy + sag + t / 2} ${cx + cw / 2 - 2} ${cy}`} stroke="rgba(255,255,255,0.35)" strokeWidth={Math.max(1, t * 0.15)} strokeDasharray={`${t * 0.5} ${t * 0.5}`} fill="none" />
    {tag !== "none" && <>
      <path d={ell(bx, by + ts * 0.15, ts * 0.32, ts * 0.32)} fill="none" stroke="#d9b45a" strokeWidth={Math.max(1, ts * 0.16)} />
      {tag === "heart" && <Solid d={heart(bx, by + ts * 1.15, ts)} fill="#ff6f9f" />}
      {tag === "star" && <Solid d={star(bx, by + ts * 1.15, ts * 1.05)} fill="#f5c542" />}
      {tag === "bell" && <>
        <Solid d={ell(bx, by + ts * 1.05, ts * 0.85, ts * 0.85)} fill="#f5c542" />
        <path d={`M${bx - ts * 0.6} ${by + ts * 1.25}h${ts * 1.2}`} stroke="rgba(90,60,20,0.6)" strokeWidth={Math.max(1, ts * 0.14)} strokeLinecap="round" />
      </>}
    </>}
  </g>;
}

// How far each hat reaches above where it meets the head, in the same 100-unit drawing space.
const HAT_RISE: Record<HatStyle, number> = { top: 88, party: 124, beanie: 73, crown: 59 };
const CAP_RISE = 42;

/** How many px the outfit sticks up above the top of a W×H sprite, so speech bubbles can clear it. */
export function headroom(view: PetView, W: number, H: number, outfit: Outfit) {
  const { hat, cap } = outfit;
  if (!hat.on && !cap.on) return 0;
  const scale = (hat.on ? HAT_SCALE[hat.style] : 0.8) * view.head.w * W / 100;
  return Math.max(0, (hat.on ? HAT_RISE[hat.style] : CAP_RISE) * scale - view.head.y * H);
}

// Where sparkles twinkle, as fractions of the sprite; more of them show as the shine goes up.
const SPARKLES = [[0.18, 0.2], [0.82, 0.32], [0.3, 0.72], [0.72, 0.62], [0.52, 0.08], [0.1, 0.5], [0.9, 0.78], [0.42, 0.42]];

/**
 * The outfit, drawn over a pet sprite of size W×H. It lives inside the sprite, so it squishes, hops and flips
 * with the pet. `side` picks the side-profile versions of the caps, glasses and collar.
 */
export default function Accessories({ view, W, H, outfit, side = false }: { view: PetView; W: number; H: number; outfit: Outfit; side?: boolean }) {
  const { collar, hat, cap, glasses, shine } = outfit;
  const head = view.head;
  const hatOn = hat.on || cap.on;
  const scale = (hat.on ? HAT_SCALE[hat.style] : 0.8) * head.w * W / 100;
  const amount = Math.max(0, Math.min(100, shine.amount)) / 100;
  return <>
    {shine.on && amount > 0 && (
      <div className="acc-shine" aria-hidden="true" style={{
        WebkitMaskImage: `url(${view.src})`, maskImage: `url(${view.src})`, opacity: 0.25 + amount * 0.75,
      } as CSSProperties} />
    )}
    <svg className="acc" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <defs>
        <linearGradient id="acc-gloss" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      {collar.on && <Collar view={view} W={W} H={H} color={collar.color} tag={collar.tag} side={side} />}
      {glasses.on && <Glasses view={view} W={W} H={H} style={glasses.style} color={glasses.color} side={side} />}
      {hatOn && (
        <g transform={`translate(${head.x * W} ${head.y * H}) rotate(${head.tilt ?? 0}) scale(${scale})`}>
          {hat.on ? <Hat style={hat.style} color={hat.color} /> : <Cap color={cap.color} side={side} />}
        </g>
      )}
    </svg>
    {shine.on && shine.sparkles && SPARKLES.slice(0, 2 + Math.round(amount * 6)).map(([x, y], i) => (
      <span key={i} className="acc-sparkle" aria-hidden="true"
        style={{ left: x * W, top: y * H, animationDelay: `${(i * 0.37) % 1.8}s`, fontSize: 9 + amount * 7 + (i % 3) * 2 }}>✦</span>
    ))}
  </>;
}
