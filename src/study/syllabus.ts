import { GoogleGenAI, Type } from "@google/genai";
import { invoke } from "@tauri-apps/api/core";
import { geminiKey } from "../ai/gemini";

// Reading a whole syllabus well matters more than speed, so this uses the strongest model first and
// falls back if the account doesn't have it.
const MODELS = ["gemini-3.5-pro", "gemini-pro-latest", "gemini-3.5-flash", "gemini-flash-latest"];

export type ItemKind = "exam" | "quiz" | "assignment" | "project" | "other";
export interface SyllabusItem {
  title: string;
  kind: ItemKind;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, 24-hour, when the syllabus gives one. */
  time?: string;
  duration_minutes?: number;
  location?: string;
  /** Percent of the final grade this one item is worth, when the syllabus says. */
  weight?: number;
}
export interface Syllabus { course: string; items: SyllabusItem[] }

const schema = {
  type: Type.OBJECT,
  properties: {
    course: { type: Type.STRING, description: "Short course code or name, e.g. 'CS 241'" },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "What it is, e.g. 'Midterm 1' or 'Essay 2 due'" },
          kind: { type: Type.STRING, enum: ["exam", "quiz", "assignment", "project", "other"] },
          date: { type: Type.STRING, description: "YYYY-MM-DD" },
          time: { type: Type.STRING, description: "Start (or due) time as HH:MM, 24-hour. Omit if not stated." },
          duration_minutes: { type: Type.NUMBER, description: "Only if stated or obvious from a time range" },
          location: { type: Type.STRING },
          weight: { type: Type.NUMBER, description: "Percent of the final course grade this single item is worth, e.g. 20 for 20%. Omit if the syllabus doesn't say." },
        },
        required: ["title", "kind", "date"],
      },
    },
  },
  required: ["course", "items"],
};

const prompt = () => `You are reading a university course syllabus. List every dated assessment in it: exams (midterms, finals, tests), quizzes, assignments, projects and other graded deadlines.
Rules:
- Only include items with a specific date. Skip weekly patterns without dates ("quizzes every Friday") and anything marked TBA.
- Today is ${new Date().toDateString()}. When the syllabus leaves out the year, pick the year that puts the date in the current or next term.
- Give times in 24-hour HH:MM, only when the syllabus states them. If it gives a range (e.g. 7–9pm), set time to the start and duration_minutes to the length.
- Keep titles short and clear, as they'd appear on a calendar. Don't repeat the course name in each title.
- weight is the percent of the final grade that one item is worth, read from the grading breakdown. When a category is split across several items (e.g. "Quizzes 20%" with 5 dated quizzes), divide it evenly (4 each) unless the syllabus says otherwise (e.g. lowest dropped: still divide by the number listed). When a category's weight isn't stated, omit weight. Never guess.`;

const toBase64 = (buf: ArrayBuffer) => {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** The file as a part Gemini can read: PDFs and photos as data, text files as text. */
async function filePart(file: File) {
  const type = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : /\.(png|jpe?g|heic|webp)$/i.test(file.name) ? "image/jpeg" : "text/plain");
  if (type.startsWith("text/") || /\.(md|txt|csv)$/i.test(file.name)) return { text: `Syllabus (${file.name}):\n\n${await file.text()}` };
  if (type === "application/pdf" || type.startsWith("image/")) return { inlineData: { mimeType: type, data: toBase64(await file.arrayBuffer()) } };
  throw new Error("UNSUPPORTED");
}

const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(new Date(`${d}T12:00`).getTime());

export async function readSyllabus(input: File | string, onStatus?: (s: string) => void): Promise<Syllabus> {
  const key = await geminiKey();
  if (!key) throw new Error("NO_KEY");
  const ai = new GoogleGenAI({ apiKey: key });
  const part = typeof input === "string" ? { text: `Syllabus:\n\n${input}` } : await filePart(input);
  let lastErr: unknown;
  for (const model of MODELS) {
    try {
      onStatus?.(`Reading it closely with ${model.replace(/^gemini-/, "Gemini ")}…`);
      const t0 = performance.now();
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [part, { text: prompt() }] }],
        config: { responseMimeType: "application/json", responseSchema: schema as any },
      });
      invoke("log", { msg: `syllabus: ${model} in ${Math.round(performance.now() - t0)} ms` }).catch(() => {});
      const out = JSON.parse(res.text ?? "{}") as Syllabus;
      const items = (out.items ?? [])
        .filter((i) => i.title && validDate(i.date))
        .map((i) => ({
          ...i,
          time: i.time && /^\d{1,2}:\d{2}$/.test(i.time) ? i.time.padStart(5, "0") : undefined,
          weight: typeof i.weight === "number" && i.weight > 0 && i.weight <= 100 ? i.weight : undefined,
        }))
        .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
      return { course: (out.course ?? "").trim(), items };
    } catch (e) {
      lastErr = e;
      // Try the next model only when this one is missing, overloaded or out of quota (free keys often get no Pro
      // quota); a bad key or a bad file won't get better.
      if (!/404|not found|NOT_FOUND|\b(429|500|503)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded/i.test(String(e))) throw e;
    }
  }
  throw lastErr;
}

/** Exams and quizzes are what you'd want on your calendar first, so they start ticked. */
export const suggested = (i: SyllabusItem) => i.kind === "exam" || i.kind === "quiz";
