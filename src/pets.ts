export type PetId = "ghost" | "cat" | "blob" | "dragon" | "redpanda" | "perry" | "dog";

type Pt = { x: number; y: number };

/** One drawing of the pet. Everything is a fraction of the sprite's width/height. */
export interface PetView {
  src: string;
  ar: number;
  /** Eye centres and radii, for the eyelid overlays and glasses. */
  eyes: Pt[];
  eye: { rx: number; ry: number };
  /** The boop spot. */
  nose: Pt;
  /** Where accessories sit: `head` is the middle of a hat's brim, `neck` the middle of a collar; `w` is how wide
   *  each should be, `tilt` turns a hat with a head drawn at an angle. A collar's `sag` (a fraction of its width)
   *  sets how much it curves; `wrap` draws it past the body and trims it to the outline, for a pet with no neck. */
  head: Pt & { w: number; tilt?: number };
  neck: Pt & { w: number; sag?: number; wrap?: boolean };
  /** Already wears a hat of its own (Perry's fedora), so hats and caps are left off. */
  hatless?: boolean;
}

export interface PetDef extends PetView {
  id: PetId;
  name: string;
  /** This pet's ElevenLabs voice id, used for speech unless the user picks another one in Settings. */
  voice: string;
  /** Rendered width in px; height follows the sprite's aspect ratio. */
  w: number;
  /** A side profile, shown while walking. It faces right, like the front views. */
  side?: PetView;
  lid: string;
  personality: string;
  boops: string[];
  greetings: string[];
}

export const PETS: Record<PetId, PetDef> = {
  ghost: {
    id: "ghost", name: "Boo", voice: "LuGehgQzANI7rZvV9FaW", src: "/pets/ghost.png", w: 168, ar: 404 / 420,
    eyes: [{ x: 0.3, y: 0.4 }, { x: 0.6, y: 0.4 }], eye: { rx: 0.075, ry: 0.085 },
    nose: { x: 0.46, y: 0.53 }, head: { x: 0.45, y: 0.1, w: 0.62 }, neck: { x: 0.45, y: 0.6, w: 0.7 }, lid: "#f4f4fa",
    personality: "a gentle ghost",
    boops: ["Hi!", "Hello.", "Need something?"],
    greetings: ["Good morning.", "Hi, I'm here.", "Ready when you are."],
  },
  cat: {
    id: "cat", name: "Mochi", voice: "LonL4yaVTCHZvZ55FxWP", src: "/pets/cat.png", w: 138, ar: 420 / 353,
    eyes: [{ x: 0.34, y: 0.41 }, { x: 0.81, y: 0.42 }], eye: { rx: 0.07, ry: 0.075 },
    nose: { x: 0.59, y: 0.44 }, head: { x: 0.5, y: 0.1, w: 0.62, tilt: 3 }, neck: { x: 0.55, y: 0.7, w: 0.6 }, lid: "#f2b04c",
    personality: "an orange cat",
    boops: ["Hi!", "Hello.", "Need something?"],
    greetings: ["Good morning.", "Hi, I'm here.", "Ready when you are."],
  },
  blob: {
    id: "blob", name: "Jelly", voice: "pUp183J2hYPdgcWbsdFh", src: "/pets/blob.png", w: 168, ar: 350 / 420,
    eyes: [{ x: 0.33, y: 0.47 }, { x: 0.66, y: 0.47 }], eye: { rx: 0.056, ry: 0.07 },
    nose: { x: 0.5, y: 0.56 }, head: { x: 0.5, y: 0.15, w: 0.8 }, neck: { x: 0.5, y: 0.72, w: 1.06, sag: 0.05, wrap: true }, lid: "#cda1f4",
    personality: "a blob",
    boops: ["Hi!", "Hello.", "Need something?"],
    greetings: ["Good morning.", "Hi, I'm here.", "Ready when you are."],
  },
  dragon: {
    id: "dragon", name: "Ember", voice: "oqIbQNK795HI8KT2ShVS", src: "/pets/dragon.png", w: 124, ar: 420 / 328,
    eyes: [{ x: 0.46, y: 0.37 }, { x: 0.82, y: 0.36 }], eye: { rx: 0.085, ry: 0.07 },
    nose: { x: 0.64, y: 0.43 }, head: { x: 0.64, y: 0.19, w: 0.56, tilt: 4 }, neck: { x: 0.6, y: 0.56, w: 0.4 }, lid: "#68d0b5",
    personality: "a baby dragon",
    boops: ["Hi!", "Hello.", "Need something?"],
    greetings: ["Good morning.", "Hi, I'm here.", "Ready when you are."],
  },
  redpanda: {
    id: "redpanda", name: "Maple", voice: "MbHndtEUDfvZnhc7GRoM", src: "/pets/redpanda.png", w: 150, ar: 420 / 389,
    eyes: [{ x: 0.2, y: 0.39 }, { x: 0.53, y: 0.41 }], eye: { rx: 0.055, ry: 0.058 },
    nose: { x: 0.34, y: 0.45 }, head: { x: 0.43, y: 0.1, w: 0.56, tilt: -3 }, neck: { x: 0.42, y: 0.62, w: 0.48 }, lid: "#dc9060",
    personality: "a red panda",
    boops: ["Hi!", "Hello.", "Need something?"],
    greetings: ["Good morning.", "Hi, I'm here.", "Ready when you are."],
  },
  perry: {
    id: "perry", name: "Perry", voice: "0gMAxuCkfi36a6UQMpAe", src: "/pets/perry.png", w: 132, ar: 420 / 308,
    eyes: [{ x: 0.195, y: 0.42 }, { x: 0.645, y: 0.42 }], eye: { rx: 0.075, ry: 0.06 },
    nose: { x: 0.42, y: 0.55 }, head: { x: 0.42, y: 0.22, w: 0.76 }, neck: { x: 0.42, y: 0.64, w: 0.62 }, lid: "#3d93b8",
    hatless: true,
    side: {
      src: "/pets/perry-side.png", ar: 402 / 420, hatless: true,
      eyes: [{ x: 0.69, y: 0.34 }], eye: { rx: 0.045, ry: 0.05 },
      nose: { x: 0.88, y: 0.43 }, head: { x: 0.58, y: 0.29, w: 0.6, tilt: -4 }, neck: { x: 0.64, y: 0.55, w: 0.34 },
    },
    personality: "a platypus",
    boops: ["Hi!", "Hello.", "Need something?"],
    greetings: ["Good morning.", "Hi, I'm here.", "Ready when you are."],
  },
  dog: {
    id: "dog", name: "Biscuit", voice: "vSHrQ6rq3nLVfdUPTJRD", src: "/pets/dog.png", w: 150, ar: 420 / 375,
    eyes: [{ x: 0.34, y: 0.33 }, { x: 0.65, y: 0.33 }], eye: { rx: 0.06, ry: 0.05 },
    nose: { x: 0.5, y: 0.39 }, head: { x: 0.5, y: 0.11, w: 0.58 }, neck: { x: 0.5, y: 0.57, w: 0.38 }, lid: "#b8693a",
    side: {
      src: "/pets/dog-side.png", ar: 332 / 420,
      eyes: [{ x: 0.79, y: 0.29 }], eye: { rx: 0.035, ry: 0.05 },
      nose: { x: 0.97, y: 0.31 }, head: { x: 0.84, y: 0.1, w: 0.5, tilt: 6 }, neck: { x: 0.8, y: 0.56, w: 0.2 },
    },
    personality: "a puppy",
    boops: ["Hi!", "Hello.", "Need something?"],
    greetings: ["Good morning.", "Hi, I'm here.", "Ready when you are."],
  },
};

export const PET_IDS = Object.keys(PETS) as PetId[];
export const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
