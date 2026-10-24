import { useEffect, useRef, useState } from "react";
import { PETS, PetId, PetView } from "../pets";
import { DEFAULT_OUTFIT, GlassesStyle, HatStyle, Outfit, SWATCHES, TagStyle, getOutfit, setOutfit } from "../accessories";
import Accessories from "../pet/Accessories";

const HATS: { id: HatStyle; label: string }[] = [
  { id: "top", label: "Top hat" }, { id: "party", label: "Party" }, { id: "beanie", label: "Beanie" }, { id: "crown", label: "Crown" },
];
const GLASSES: { id: GlassesStyle; label: string }[] = [
  { id: "round", label: "Round" }, { id: "shades", label: "Shades" }, { id: "heart", label: "Hearts" }, { id: "star", label: "Stars" },
];
const TAGS: { id: TagStyle; label: string }[] = [
  { id: "heart", label: "Heart" }, { id: "bell", label: "Bell" }, { id: "star", label: "Star" }, { id: "none", label: "No tag" },
];

export function Dressed({ view, w, outfit, side }: { view: PetView; w: number; outfit: Outfit; side?: boolean }) {
  const h = w * view.ar;
  return (
    <div className="sprite" style={{ width: w, height: h }}>
      <img src={view.src} alt="" draggable={false} />
      <Accessories view={view} W={w} H={h} outfit={outfit} side={side} />
    </div>
  );
}

function Seg<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: { id: T; label: string }[]; onPick: (v: T) => void }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onPick(o.id)}>{o.label}</button>)}
    </div>
  );
}

function Colors({ label, value, onPick }: { label: string; value: string; onPick: (c: string) => void }) {
  return (
    <div className="swatches" role="group" aria-label={label}>
      {SWATCHES.map((c) => <button key={c} type="button" aria-label={c} aria-pressed={c === value.toLowerCase()} style={{ background: c }} onClick={() => onPick(c)} />)}
      <input type="color" value={value} onChange={(e) => onPick(e.target.value)} aria-label={`Custom ${label.toLowerCase()}`} />
    </div>
  );
}

/** Dress the pet up: each accessory toggles on and opens its own options. Saved as you go. */
export default function Wardrobe({ petId, onOutfit }: { petId: PetId; onOutfit?: (o: Outfit) => void }) {
  const [outfit, setLocal] = useState<Outfit>(DEFAULT_OUTFIT);
  const saveTimer = useRef<number>(0);
  const def = PETS[petId];

  useEffect(() => { getOutfit().then(setLocal); }, []);
  useEffect(() => { onOutfit?.(outfit); }, [outfit, onOutfit]);

  const change = <K extends keyof Outfit>(k: K, patch: Partial<Outfit[K]>) => {
    setLocal((cur) => {
      const next = { ...cur, [k]: { ...cur[k], ...patch } };
      // A hat and a cap don't fit on one head.
      if (k === "hat" && next.hat.on) next.cap = { ...next.cap, on: false };
      if (k === "cap" && next.cap.on) next.hat = { ...next.hat, on: false };
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => setOutfit(next), 150);
      return next;
    });
  };

  const Row = ({ k, label, children }: { k: keyof Outfit; label: string; children: React.ReactNode }) => (
    <div className="acc-row">
      <label>
        <input type="checkbox" checked={outfit[k].on} onChange={(e) => change(k, { on: e.target.checked })} />
        {label}
      </label>
      {outfit[k].on && <div className="acc-opts">{children}</div>}
    </div>
  );

  return (
    <section aria-labelledby="h-wardrobe" className="wardrobe">
      <h2 id="h-wardrobe">Dress up {def.name}</h2>
      <div className="dressed" aria-hidden="true">
        <Dressed view={def} w={def.side ? 92 : 110} outfit={outfit} />
        {def.side && <Dressed view={def.side} w={104} outfit={outfit} side />}
      </div>
      {Row({ k: "hat", label: "Hat", children: <>
        <Seg label="Hat style" value={outfit.hat.style} options={HATS} onPick={(style) => change("hat", { style })} />
        <Colors label="Hat colour" value={outfit.hat.color} onPick={(color) => change("hat", { color })} />
      </> })}
      {Row({ k: "cap", label: "Cap", children:
        <Colors label="Cap colour" value={outfit.cap.color} onPick={(color) => change("cap", { color })} /> })}
      {Row({ k: "glasses", label: "Sunglasses", children: <>
        <Seg label="Glasses style" value={outfit.glasses.style} options={GLASSES} onPick={(style) => change("glasses", { style })} />
        <Colors label="Frame colour" value={outfit.glasses.color} onPick={(color) => change("glasses", { color })} />
      </> })}
      {Row({ k: "collar", label: "Collar", children: <>
        <Seg label="Collar tag" value={outfit.collar.tag} options={TAGS} onPick={(tag) => change("collar", { tag })} />
        <Colors label="Collar colour" value={outfit.collar.color} onPick={(color) => change("collar", { color })} />
      </> })}
      {Row({ k: "shine", label: "Shininess", children: <>
        <input type="range" min={5} max={100} value={outfit.shine.amount} aria-label="How shiny"
          onChange={(e) => change("shine", { amount: Number(e.target.value) })} />
        <label className="small">
          <input type="checkbox" checked={outfit.shine.sparkles} onChange={(e) => change("shine", { sparkles: e.target.checked })} />
          Sparkles
        </label>
      </> })}
    </section>
  );
}
