/** What the pet works on while it's locked in: a sticker-style laptop that pops in and out with focus mode. */
export type GearState = "in" | "out";

/** The laptop the pet works on, sitting in front of it with its screen glowing. */
export function Laptop({ width, state }: { width: number; state: GearState }) {
  return (
    <div className={`desk gear-pop ${state}`} style={{ width, ["--d" as string]: "0.05s" }} aria-hidden="true">
      <svg className="laptop" viewBox="0 0 112 60">
        <ellipse className="glow" cx="56" cy="4" rx="40" ry="9" />
        <rect className="lid" x="18" y="4" width="76" height="44" rx="7" />
        <path className="sticker" d="M56 34c-7-4.5-11-8.5-11-12.5a5.5 5.5 0 0 1 11-1.5 5.5 5.5 0 0 1 11 1.5c0 4-4 8-11 12.5Z" />
        <path className="base" d="M8 48h96l-7 9H15Z" />
      </svg>
    </div>
  );
}
