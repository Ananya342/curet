import { emitTo } from "@tauri-apps/api/event";
import { kvGet, kvSet } from "./api";

export type HatStyle = "top" | "party" | "beanie" | "crown";
export type GlassesStyle = "round" | "shades" | "heart" | "star";
export type TagStyle = "heart" | "bell" | "star" | "none";

/** What the pet is wearing. One outfit, shared by every pet; each pet says where things sit on it. */
export interface Outfit {
  collar: { on: boolean; color: string; tag: TagStyle };
  hat: { on: boolean; style: HatStyle; color: string };
  cap: { on: boolean; color: string };
  glasses: { on: boolean; style: GlassesStyle; color: string };
  /** A glossy sheen that sweeps across the pet, with sparkles. `amount` runs 0–100. */
  shine: { on: boolean; amount: number; sparkles: boolean };
}

export const DEFAULT_OUTFIT: Outfit = {
  collar: { on: false, color: "#8b5cf6", tag: "heart" },
  hat: { on: false, style: "top", color: "#3a2a2a" },
  cap: { on: false, color: "#ff4f5e" },
  glasses: { on: false, style: "round", color: "#3a2a2a" },
  shine: { on: false, amount: 60, sparkles: true },
};

export const SWATCHES = ["#3a2a2a", "#ff4f5e", "#ff9248", "#ffd95a", "#4cc38a", "#3b82f6", "#8b5cf6", "#ff8fb8", "#ffffff"];

const merge = (raw: unknown): Outfit => {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Outfit, object>>;
  const out = { ...DEFAULT_OUTFIT };
  for (const k of Object.keys(DEFAULT_OUTFIT) as (keyof Outfit)[]) out[k] = { ...DEFAULT_OUTFIT[k], ...(o[k] ?? {}) } as never;
  return out;
};

export const getOutfit = async (): Promise<Outfit> => {
  try { return merge(JSON.parse((await kvGet("outfit")) ?? "{}")); } catch { return DEFAULT_OUTFIT; }
};

export const setOutfit = async (o: Outfit) => {
  await kvSet("outfit", JSON.stringify(o));
  await emitTo("pet", "outfit-changed", o);
};
