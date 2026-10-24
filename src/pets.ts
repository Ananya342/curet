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
   *  each should be, `tilt` turns a hat with a head drawn at an angle. */
  head: Pt & { w: number; tilt?: number };
  neck: Pt & { w: number };
}

export interface PetDef extends PetView {
  id: PetId;
  name: string;
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
    id: "ghost", name: "Boo", src: "/pets/ghost.png", w: 168, ar: 404 / 420,
    eyes: [{ x: 0.3, y: 0.4 }, { x: 0.6, y: 0.4 }], eye: { rx: 0.075, ry: 0.085 },
    nose: { x: 0.46, y: 0.53 }, head: { x: 0.45, y: 0.07, w: 0.62 }, neck: { x: 0.45, y: 0.6, w: 0.7 }, lid: "#f4f4fa",
    personality: "a shy, gentle little ghost who giggles easily and sprinkles in a soft 'hehe' or 'boo!' now and then",
    boops: ["eep! hehe", "boo… that tickles!", "you found my nose!", "*floats happily*"],
    greetings: ["boo! good morning", "hehe, I'm awake!", "oh! hi hi"],
  },
  cat: {
    id: "cat", name: "Mochi", src: "/pets/cat.png", w: 138, ar: 420 / 353,
    eyes: [{ x: 0.34, y: 0.41 }, { x: 0.81, y: 0.42 }], eye: { rx: 0.07, ry: 0.075 },
    nose: { x: 0.59, y: 0.44 }, head: { x: 0.5, y: 0.1, w: 0.62, tilt: 3 }, neck: { x: 0.55, y: 0.7, w: 0.6 }, lid: "#f2b04c",
    personality: "a sleepy, affectionate orange cat who is a little sassy, loves naps and occasionally says 'mew' or 'purr'",
    boops: ["mew!", "nyaa… again?", "*purrrr*", "hey, that's my nose!"],
    greetings: ["mrrrow… morning", "*stretches* mew!", "purr… you're up!"],
  },
  blob: {
    id: "blob", name: "Jelly", src: "/pets/blob.png", w: 168, ar: 350 / 420,
    eyes: [{ x: 0.33, y: 0.47 }, { x: 0.66, y: 0.47 }], eye: { rx: 0.056, ry: 0.07 },
    nose: { x: 0.5, y: 0.56 }, head: { x: 0.5, y: 0.08, w: 0.6 }, neck: { x: 0.5, y: 0.7, w: 0.8 }, lid: "#cda1f4",
    personality: "a cheerful, bouncy purple blob who is endlessly upbeat and goes 'boing!' when excited",
    boops: ["boing!", "blorp!", "squish squish!", "hehe, boop!"],
    greetings: ["boing! good morning!", "blorp… I'm up!", "yay, you're here!"],
  },
  dragon: {
    id: "dragon", name: "Ember", src: "/pets/dragon.png", w: 124, ar: 420 / 328,
    eyes: [{ x: 0.46, y: 0.37 }, { x: 0.82, y: 0.36 }], eye: { rx: 0.085, ry: 0.07 },
    nose: { x: 0.64, y: 0.43 }, head: { x: 0.62, y: 0.17, w: 0.42, tilt: 4 }, neck: { x: 0.6, y: 0.56, w: 0.38 }, lid: "#68d0b5",
    personality: "a brave but adorable baby dragon who takes your schedule very seriously and sneezes tiny puffs of smoke",
    boops: ["rawr! (a tiny one)", "*sneezes a smoke puff*", "hey! royal nose!", "grr… hehe"],
    greetings: ["rawr! morning, hero", "*yawns a tiny flame*", "ready for adventure!"],
  },
  redpanda: {
    id: "redpanda", name: "Maple", src: "/pets/redpanda.png", w: 150, ar: 420 / 389,
    eyes: [{ x: 0.2, y: 0.39 }, { x: 0.53, y: 0.41 }], eye: { rx: 0.055, ry: 0.058 },
    nose: { x: 0.34, y: 0.45 }, head: { x: 0.43, y: 0.1, w: 0.56, tilt: -3 }, neck: { x: 0.42, y: 0.62, w: 0.48 }, lid: "#dc9060",
    personality: "a curious, bubbly red panda who loves snacks and gets excited about small wins",
    boops: ["squeak!", "hehe, nose boop!", "snack time?", "*wiggles tail*"],
    greetings: ["good morning! snacks?", "*wiggles tail* hi!", "ooh you're here!"],
  },
  perry: {
    id: "perry", name: "Perry", src: "/pets/perry.png", w: 132, ar: 420 / 308,
    eyes: [{ x: 0.195, y: 0.42 }, { x: 0.645, y: 0.42 }], eye: { rx: 0.075, ry: 0.06 },
    nose: { x: 0.42, y: 0.55 }, head: { x: 0.42, y: 0.22, w: 0.7 }, neck: { x: 0.42, y: 0.64, w: 0.62 }, lid: "#3d93b8",
    side: {
      src: "/pets/perry-side.png", ar: 402 / 420,
      eyes: [{ x: 0.69, y: 0.34 }], eye: { rx: 0.045, ry: 0.05 },
      nose: { x: 0.88, y: 0.43 }, head: { x: 0.66, y: 0.26, w: 0.48 }, neck: { x: 0.64, y: 0.55, w: 0.34 },
    },
    personality: "a calm, mysterious teal platypus secret agent in a brown fedora who is quietly heroic, speaks in short cool lines, and now and then makes a soft 'krrrr' chatter",
    boops: ["krrrr!", "*tips fedora*", "agent P, reporting!", "…krrrr (that tickled)"],
    greetings: ["*tips fedora* morning", "krrrr… mission: today", "agent P is on duty"],
  },
  dog: {
    id: "dog", name: "Biscuit", src: "/pets/dog.png", w: 150, ar: 420 / 375,
    eyes: [{ x: 0.34, y: 0.33 }, { x: 0.65, y: 0.33 }], eye: { rx: 0.06, ry: 0.05 },
    nose: { x: 0.5, y: 0.39 }, head: { x: 0.5, y: 0.1, w: 0.48 }, neck: { x: 0.5, y: 0.57, w: 0.36 }, lid: "#b8693a",
    side: {
      src: "/pets/dog-side.png", ar: 332 / 420,
      eyes: [{ x: 0.79, y: 0.29 }], eye: { rx: 0.035, ry: 0.05 },
      nose: { x: 0.97, y: 0.31 }, head: { x: 0.84, y: 0.1, w: 0.32, tilt: 6 }, neck: { x: 0.8, y: 0.56, w: 0.2 },
    },
    personality: "a sweet, waggy Cavalier puppy who is loyal, easily excited, loves walks and treats, and sprinkles in a happy 'woof!' or 'arf!'",
    boops: ["arf!", "*wags tail*", "woof! again again!", "*licks your finger*"],
    greetings: ["woof! good morning!", "*tail wags* you're up!", "arf arf! walk time?"],
  },
};

export const PET_IDS = Object.keys(PETS) as PetId[];
export const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
