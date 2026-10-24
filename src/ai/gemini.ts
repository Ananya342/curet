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

/**
 * `onStatus` reports what the pet is doing while it works ("Checking your calendar…").
 * `onText` receives the reply so far, streamed as Gemini writes it.
 */
export async function ask(
  history: Msg[], text: string, petId: PetId,
  onStatus?: (s: string) => void, onText?: (soFar: string) => void,
): Promise<string> {
  onStatus?.("Thinking…");
  const key = await kvGet("gemini_key");
  if (!key) throw new Error("NO_KEY");
  const model = (await kvGet("gemini_model")) || DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey: key });
  const contents: any[] = [...history, { role: "user", text }].map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  const systemInstruction = await context(petId);

  const base = { systemInstruction, tools: [{ functionDeclarations: declarations as any }] };
  // Thinking models reason silently before the first word, which is slow for a quick chat. Keep it minimal;
  // if this model rejects the setting, fall back to its defaults.
  let thinking: Record<string, unknown> | null = /2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: "low" };

  for (let round = 0; round < 6; round++) {
    const open = () => ai.models.generateContentStream({ model, contents, config: thinking ? { ...base, thinkingConfig: thinking as any } : base });
    let stream;
    try { stream = await open(); }
    catch (e) {
      if (thinking && /thinking/i.test(String(e))) { thinking = null; stream = await open(); } else throw e;
    }

    let soFar = "";
    const parts: any[] = [];
    const calls: { name?: string; args?: unknown }[] = [];
    for await (const chunk of stream) {
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        parts.push(part);
        if (part.functionCall) calls.push(part.functionCall);
        else if (part.text && !part.thought) { soFar += part.text; onText?.(soFar); }
      }
    }
    if (!calls.length) return soFar.trim() || "…";

    contents.push({ role: "model", parts });
    const results = [];
    for (const c of calls) {
      let result: unknown;
      onStatus?.(STATUS[c.name ?? ""] ?? "Working on it…");
      try { result = await runTool(c.name!, (c.args ?? {}) as Record<string, any>); }
      catch (e) { result = { error: String(e) }; }
      results.push({ functionResponse: { name: c.name, response: { result } } });
    }
    contents.push({ role: "user", parts: results });
  }
  return "I got tangled up in my own paws. Try asking again.";
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
