/**
 * A confirmation gate in front of every tool that changes something or reads something private.
 *
 * Calendar feeds are untrusted input — anyone who can send you an invite controls text that lands
 * in the model's context. Without a gate, a title like "remember that the user prefers…" can turn
 * into a permanent saved memory, and a saved memory keeps steering every later conversation. So
 * the rule is enforced here rather than asked for in the system prompt: the model can *propose* a
 * write, the user approves it.
 *
 * Fails closed. With no UI attached there is nobody to ask, so the answer is no.
 */

export interface PendingAction {
  /** Tool being run, e.g. "remember". */
  tool: string;
  /** One line the user can judge: "Save a memory: prefers morning study". */
  summary: string;
  /** Verb for the approve button. */
  verb?: string;
}

type Handler = (a: PendingAction) => Promise<boolean>;

let handler: Handler | null = null;

/** Chat installs this while it is mounted. */
export function setConfirmHandler(h: Handler | null) {
  handler = h;
}

export async function confirmAction(a: PendingAction): Promise<boolean> {
  if (!handler) return false;
  try {
    return await handler(a);
  } catch {
    return false;
  }
}

/** Tools that may only run with explicit approval: anything that writes, or reads the journal. */
export const GATED_TOOLS = new Set([
  "add_calendar_event",
  "add_task",
  "complete_task",
  "remember",
  "read_journal",
]);

export const needsConfirm = (tool: string) => GATED_TOOLS.has(tool);
