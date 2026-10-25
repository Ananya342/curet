import { pick } from "../pets";

/** Same window as the Rust side's wind-down nudge: 12:30 AM until 4 AM. */
export function isLateNight(d = new Date()) {
  const h = d.getHours();
  return (h === 0 && d.getMinutes() >= 30) || (h >= 1 && h < 4);
}

const LINES = [
  "It's {t}! Why are you still awake? 👀",
  "{t}?? Even the stars are yawning.",
  "Psst… it's {t}. Your bed misses you.",
  "Still up at {t}? I'm a little worried about you.",
  "It's {t}. Whatever it is, it'll still be there in the morning.",
  "Sleep is a study tool too, you know. It's {t}.",
  "*yawns* it's {t}… are we pulling an all-nighter?",
  "Why are you awake at {t}?! Bed. Now. 😤",
  "{t} already? Your future self is begging you to sleep.",
  "I'd tuck you in if I had arms. It's {t}.",
];

/** A "why are you still up?" line with the actual time in it, e.g. "It's 2:35 AM! …". */
export function lateLine(d = new Date()) {
  const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return pick(LINES).replace("{t}", t);
}
