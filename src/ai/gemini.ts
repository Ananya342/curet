import { GoogleGenAI } from "@google/genai";
import { eventsRange, fmtDay, fmtTime, kvGet, memories, nowSec, startOfDay, tasks } from "../api";
import { PETS, PetId } from "../pets";
import { declarations, runTool } from "./tools";

export interface Msg { role: "user" | "model"; text: string }
export const DEFAULT_MODEL = "gemini-flash-latest";

async function context(petId: PetId) {
  const now = new Date();
  const day = startOfDay(now);
  const evs = await eventsRange(day, day + 3 * 86400);
  const line = (e: (typeof evs)[number]) =>
    `- ${e.kind === "deadline" ? "[DEADLINE] " : ""}${e.title} — ${e.all_day ? fmtDay(e.start) + " (all day)" : `${fmtDay(e.start)} ${fmtTime(e.start)}–${fmtTime(e.end)}`}${e.link ? ` (${e.link})` : ""}`;
  const open = await tasks.list();
  const mem = await memories.list(null, 10);
  const pet = PETS[petId];
  return `You are ${pet.name}, ${pet.personality}. You live on the user's Mac desktop as their tiny life-assistant companion.
Stay in character but be genuinely useful: short, warm, concrete replies (1–4 sentences unless asked for a plan). Use at most one emoji.
Use the tools to read the calendar, find free time, manage tasks and remember things. Never invent events — if the calendar is empty or not connected, say so and mention Settings.
When the user shares a lasting preference, goal or project, call remember. When they ask to be reminded or add something to do, call add_task.
Now: ${now.toLocaleString([], { dateStyle: "full", timeStyle: "short" })} (${Intl.DateTimeFormat().resolvedOptions().timeZone}).
Next 3 days:
${evs.length ? evs.slice(0, 40).map(line).join("\n") : "(nothing on the calendar)"}
Open tasks:
${open.length ? open.map((t) => `- #${t.id} ${t.title}${t.due ? ` (due ${fmtDay(t.due)})` : ""}`).join("\n") : "(none)"}
What you remember about the user:
${mem.length ? mem.map((m) => `- ${m.fact}`).join("\n") : "(nothing yet)"}`;
}

const STATUS: Record<string, string> = {
  get_events: "Checking your calendar…",
  find_free_time: "Looking for free time…",
  add_task: "Adding a task…",
  list_tasks: "Reading your tasks…",
  complete_task: "Ticking that off…",
  remember: "Remembering that…",
  recall: "Thinking back…",
};

/** `onStatus` reports what the pet is doing while it works, e.g. "Checking your calendar…". */
export async function ask(history: Msg[], text: string, petId: PetId, onStatus?: (s: string) => void): Promise<string> {
  onStatus?.("Thinking…");
  const key = await kvGet("gemini_key");
  if (!key) throw new Error("NO_KEY");
  const model = (await kvGet("gemini_model")) || DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey: key });
  const contents: any[] = [...history, { role: "user", text }].map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  const systemInstruction = await context(petId);

  for (let round = 0; round < 6; round++) {
    const res = await ai.models.generateContent({
      model,
      contents,
      config: { systemInstruction, tools: [{ functionDeclarations: declarations as any }] },
    });
    const calls = res.functionCalls ?? [];
    if (!calls.length) return (res.text ?? "").trim() || "…";
    contents.push(res.candidates![0].content);
    const parts = [];
    for (const c of calls) {
      let result: unknown;
      onStatus?.(STATUS[c.name ?? ""] ?? "Working on it…");
      try { result = await runTool(c.name!, (c.args ?? {}) as Record<string, any>); }
      catch (e) { result = { error: String(e) }; }
      parts.push({ functionResponse: { name: c.name, response: { result } } });
    }
    contents.push({ role: "user", parts });
  }
  return "Hmm, I got tangled up in my own paws. Try asking again?";
}

export const friendlyError = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  if (m === "NO_KEY") return "I need a Gemini API key to think. Add one in Settings — it’s free at aistudio.google.com/apikey.";
  if (/API key|API_KEY|403|401/i.test(m)) return "Gemini didn’t accept that API key. Check it in Settings, or paste a fresh one.";
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(m)) return "Gemini’s rate limit is full for now. Wait a minute, then ask again.";
  if (/404|not found|NOT_FOUND/i.test(m)) return "Gemini doesn’t know that model name. Clear the model field in Settings to use the default.";
  return `Something went wrong: ${m.slice(0, 200)}. Try again in a moment.`;
};

export { nowSec };
