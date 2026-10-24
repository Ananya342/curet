export type PetId = "ghost" | "cat" | "blob" | "dragon" | "redpanda";

export interface PetDef {
  id: PetId;
  name: string;
  src: string;
  /** Rendered width in px; height follows the sprite's aspect ratio. */
  w: number;
  ar: number;
  /** Eye centres and radii as fractions of the sprite's width/height, for the eyelid overlays. */
  eyes: { x: number; y: number }[];
  eye: { rx: number; ry: number };
  /** The boop spot. */
  nose: { x: number; y: number };
  lid: string;
  personality: string;
  boops: string[];
  greetings: string[];
}

export const PETS: Record<PetId, PetDef> = {
  ghost: {
    id: "ghost", name: "Boo", src: "/pets/ghost.png", w: 168, ar: 404 / 420,
    eyes: [{ x: 0.3, y: 0.4 }, { x: 0.6, y: 0.4 }], eye: { rx: 0.075, ry: 0.085 },
    nose: { x: 0.46, y: 0.53 }, lid: "#f4f4fa",
    personality: "a shy, gentle little ghost who giggles easily and sprinkles in a soft 'hehe' or 'boo!' now and then",
    boops: ["eep! hehe", "boo… that tickles!", "you found my nose!", "*floats happily*"],
    greetings: ["boo! good morning", "hehe, I'm awake!", "oh! hi hi"],
  },
  cat: {
    id: "cat", name: "Mochi", src: "/pets/cat.png", w: 138, ar: 420 / 353,
    eyes: [{ x: 0.34, y: 0.41 }, { x: 0.81, y: 0.42 }], eye: { rx: 0.07, ry: 0.075 },
    nose: { x: 0.59, y: 0.44 }, lid: "#f2b04c",
    personality: "a sleepy, affectionate orange cat who is a little sassy, loves naps and occasionally says 'mew' or 'purr'",
    boops: ["mew!", "nyaa… again?", "*purrrr*", "hey, that's my nose!"],
    greetings: ["mrrrow… morning", "*stretches* mew!", "purr… you're up!"],
  },
  blob: {
    id: "blob", name: "Jelly", src: "/pets/blob.png", w: 168, ar: 350 / 420,
    eyes: [{ x: 0.33, y: 0.47 }, { x: 0.66, y: 0.47 }], eye: { rx: 0.056, ry: 0.07 },
    nose: { x: 0.5, y: 0.56 }, lid: "#cda1f4",
    personality: "a cheerful, bouncy purple blob who is endlessly upbeat and goes 'boing!' when excited",
    boops: ["boing!", "blorp!", "squish squish!", "hehe, boop!"],
    greetings: ["boing! good morning!", "blorp… I'm up!", "yay, you're here!"],
  },
  dragon: {
    id: "dragon", name: "Ember", src: "/pets/dragon.png", w: 124, ar: 420 / 328,
    eyes: [{ x: 0.46, y: 0.37 }, { x: 0.82, y: 0.36 }], eye: { rx: 0.085, ry: 0.07 },
    nose: { x: 0.64, y: 0.43 }, lid: "#68d0b5",
    personality: "a brave but adorable baby dragon who takes your schedule very seriously and sneezes tiny puffs of smoke",
    boops: ["rawr! (a tiny one)", "*sneezes a smoke puff*", "hey! royal nose!", "grr… hehe"],
    greetings: ["rawr! morning, hero", "*yawns a tiny flame*", "ready for adventure!"],
  },
  redpanda: {
    id: "redpanda", name: "Maple", src: "/pets/redpanda.png", w: 150, ar: 420 / 389,
    eyes: [{ x: 0.2, y: 0.39 }, { x: 0.53, y: 0.41 }], eye: { rx: 0.055, ry: 0.058 },
    nose: { x: 0.34, y: 0.45 }, lid: "#dc9060",
    personality: "a curious, bubbly red panda who loves snacks and gets excited about small wins",
    boops: ["squeak!", "hehe, nose boop!", "snack time?", "*wiggles tail*"],
    greetings: ["good morning! snacks?", "*wiggles tail* hi!", "ooh you're here!"],
  },
};

export const PET_IDS = Object.keys(PETS) as PetId[];
export const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
