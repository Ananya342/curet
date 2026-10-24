import { invoke } from "@tauri-apps/api/core";
import { GoogleGenAI } from "@google/genai";
import { eventsRange, fmtDay, fmtTime, kvGet, memories, nowSec, startOfDay, tasks } from "../api";
import { PETS, PetId } from "../pets";
import { declarations, runTool } from "./tools";

export interface Msg { role: "user" | "model"; text: string }
// Default model. If Gemini rejects the name, chat falls back to FALLBACK_MODEL so it keeps working.
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const FALLBACK_MODEL = "gemini-flash-latest";

async function context(petId: PetId) {
  const now = new Date();
  const day = startOfDay(now);
  const [evs, open, mem] = await Promise.all([eventsRange(day, day + 2 * 86400), tasks.list(), memories.list(null, 5)]);
  const line = (e: (typeof evs)[number]) =>
    `- ${e.kind === "deadline" ? "[DEADLINE] " : ""}${e.title} — ${e.all_day ? fmtDay(e.start) + " (all day)" : `${fmtDay(e.start)} ${fmtTime(e.start)}–${fmtTime(e.end)}`}`;
  const pet = PETS[petId];
  return `You are ${pet.name}, ${pet.personality}, a tiny desktop companion. Reply warmly in 1–3 short sentences, at most one emoji.
The calendar below covers today and tomorrow; use get_events only for other dates. Never invent events. Use tools to find free time, add tasks, add events (only when asked) and remember lasting preferences.
Now: ${now.toLocaleString([], { dateStyle: "full", timeStyle: "short" })}.
Calendar:
${evs.length ? evs.slice(0, 15).map(line).join("\n") : "(empty or not connected)"}
Tasks:
${open.length ? open.slice(0, 10).map((t) => `- #${t.id} ${t.title}${t.due ? ` (due ${fmtDay(t.due)})` : ""}`).join("\n") : "(none)"}
Remembered:
${mem.length ? mem.map((m) => `- ${m.fact}`).join("\n") : "(nothing)"}`;
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

/** Latency notes go to the app log (visible when Curet is run from a terminal). */
const timing = (msg: string) => { invoke("log", { msg: `gemini ${msg}` }).catch(() => {}); };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isBusy = (e: unknown) => /\b(500|503)\b|UNAVAILABLE|overloaded|high demand|INTERNAL/i.test(String(e));

export async function ask(
  history: Msg[], text: string, petId: PetId,
  onStatus?: (s: string) => void, onText?: (soFar: string) => void,
): Promise<string> {
  onStatus?.("Thinking…");
  const key = await kvGet("gemini_key");
  if (!key) throw new Error("NO_KEY");
  const chosen = await kvGet("gemini_model");
  // Try your model first, then the fallback, so one overloaded model doesn't stop the chat.
  let models = [...new Set([chosen || DEFAULT_MODEL, FALLBACK_MODEL])];
  let model = models[0];
  const t0 = performance.now();
  const ai = new GoogleGenAI({ apiKey: key });
  const contents: any[] = [...history, { role: "user", text }].map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  const systemInstruction = await context(petId);

  const base = { systemInstruction, tools: [{ functionDeclarations: declarations as any }] };
  // Thinking models reason silently before the first word, which is slow for a quick chat. Keep it minimal;
  // if this model rejects the setting, fall back to its defaults.
  let thinking: Record<string, unknown> | null = /2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: "minimal" };

  for (let round = 0; round < 6; round++) {
    const tryOpen = async (m: string) => {
      for (;;) {
        try { return await ai.models.generateContentStream({ model: m, contents, config: thinking ? { ...base, thinkingConfig: thinking as any } : base }); }
        catch (e) {
          if (!thinking || !/thinking/i.test(String(e))) throw e;
          // Some models reject "minimal": step down to "low" rather than their slow default.
          thinking = thinking.thinkingLevel === "minimal" ? { thinkingLevel: "low" } : null;
        }
      }
    };
    // Overloaded (503) or flaky (500) responses are usually brief: retry quietly, then move to the next model.
    let stream: Awaited<ReturnType<typeof tryOpen>> | undefined;
    let lastErr: unknown;
    outer: for (let mi = 0; mi < models.length; mi++) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try { stream = await tryOpen(models[mi]); model = models[mi]; models = models.slice(mi); break outer; }
        catch (e) {
          lastErr = e;
          if (/404|not found|NOT_FOUND/i.test(String(e))) break;
          if (isBusy(e)) { onStatus?.("Gemini is busy, trying again…"); timing(`${models[mi]} busy (attempt ${attempt + 1})`); await sleep(attempt ? 1600 : 700); continue; }
          throw e;
        }
      }
    }
    if (!stream) throw lastErr;
    let first = true;

    let soFar = "";
    const parts: any[] = [];
    const calls: { name?: string; args?: unknown }[] = [];
    for await (const chunk of stream) {
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        parts.push(part);
        if (first) { first = false; timing(`round ${round + 1}: first output after ${Math.round(performance.now() - t0)} ms (${model})`); }
        if (part.functionCall) calls.push(part.functionCall);
        else if (part.text && !part.thought) { soFar += part.text; onText?.(soFar); }
      }
    }
    if (!calls.length) { timing(`done in ${Math.round(performance.now() - t0)} ms, ${round + 1} round(s)`); return soFar.trim() || "…"; }

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
  if (/\b(500|503)\b|UNAVAILABLE|overloaded|high demand/i.test(m)) return "Gemini is overloaded right now. I tried twice and a backup model. Give it a minute, then ask again.";
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(m)) return "Gemini’s rate limit is full for now. Wait a minute, then ask again.";
  if (/404|not found|NOT_FOUND/i.test(m)) return "Gemini doesn’t know that model name. Clear the model field in Settings to use the default.";
  return "Something went wrong talking to Gemini. Try again in a moment.";
};

export { nowSec };
