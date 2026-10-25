import { useEffect, useRef, useState } from "react";
import { PETS, PetId } from "../pets";
import { kvGet, kvSet } from "../api";
import { Markdown } from "./Markdown";
import { Msg, ask, friendlyError, replyWithoutLead } from "../ai/gemini";

/**
 * Reveals `target` a few characters per frame, like ChatGPT, however chunky the stream underneath is. It keeps a
 * steady reading pace and speeds up when it falls behind, so a long reply never lags far behind Gemini.
 */
function useTypewriter(target: string) {
  const [shown, setShown] = useState(0);
  const pos = useRef(0);
  const goal = useRef(target);
  useEffect(() => {
    // If the start of the text changed (a lead-in got trimmed), carry on from what still matches.
    const prev = goal.current;
    goal.current = target;
    let same = 0;
    while (same < pos.current && same < prev.length && prev[same] === target[same]) same++;
    if (same < pos.current) { pos.current = same; setShown(same); }
  }, [target]);
  useEffect(() => {
    // A timer rather than animation frames, so a reply still finishes if the panel is hidden halfway through.
    let last = performance.now();
    const t = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(1000, now - last);
      last = now;
      const backlog = goal.current.length - pos.current;
      if (backlog <= 0) return;
      // ~45 chars/s when caught up, much faster when far behind.
      pos.current = Math.min(goal.current.length, pos.current + Math.max(0.045 * dt, backlog * 0.006 * dt));
      setShown(Math.floor(pos.current));
    }, 16);
    return () => window.clearInterval(t);
  }, []);
  const reset = () => { pos.current = 0; goal.current = ""; setShown(0); };
  return { text: target.slice(0, shown), caughtUp: shown >= target.length && goal.current === target, reset };
}

const SUGGESTIONS = ["What’s on today?", "When am I free tomorrow?", "Help me plan my day", "What’s due this week?"];

export default function Chat({ petId }: { petId: PetId }) {
  const pet = PETS[petId];
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  // The finished reply, held back until the typewriter has caught up with it.
  const [final, setFinal] = useState<{ msgs: Msg[] } | null>(null);
  const typed = useTypewriter(draft ? replyWithoutLead(draft, final != null) ?? "" : "");
  const [undo, setUndo] = useState<Msg[] | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const undoTimer = useRef<number>(0);

  useEffect(() => {
    kvGet("chat").then((s) => { try { s && setMsgs(JSON.parse(s)); } catch { /* ignore */ } });
    field.current?.focus();
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy, typed.text]);

  // Commit the reply once it's fully on screen.
  useEffect(() => {
    if (!final || !typed.caughtUp) return;
    setMsgs(final.msgs);
    setFinal(null);
    setBusy(false);
    setDraft("");
    setStatus("");
    typed.reset();
    kvSet("chat", JSON.stringify(final.msgs.slice(-40)));
    field.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [final, typed.caughtUp]);

  const grow = () => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };
  useEffect(grow, [text]);

  const send = async (t = text) => {
    t = t.trim();
    if (busy) return;
    if (!t) { field.current?.focus(); return; }
    setText("");
    setUndo(null);
    const history = msgs.slice(-10);
    const next = [...msgs, { role: "user" as const, text: t }];
    setMsgs(next);
    setBusy(true);
    setStatus("");
    typed.reset();
    let reply: string;
    try { reply = await ask(history, t, petId, setStatus, setDraft); } catch (e) { reply = friendlyError(e); }
    // Let the typewriter finish the last of it, then the effect above commits the message.
    setDraft(reply);
    setFinal({ msgs: [...next, { role: "model" as const, text: reply }] });
  };

  // Clearing is easy to regret, so offer a short undo instead of a confirmation dialog.
  const clear = () => {
    setUndo(msgs);
    setMsgs([]);
    kvSet("chat", null);
    window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndo(null), 7000);
  };
  const restore = () => {
    if (!undo) return;
    setMsgs(undo);
    kvSet("chat", JSON.stringify(undo.slice(-40)));
    setUndo(null);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chat">
      <div className="log" role="log" aria-live="polite" aria-label="Conversation">
        {msgs.length === 0 && (
          <div className="empty">
            <img src={pet.src} alt="" draggable={false} />
            <h2><span translate="no">{pet.name}</span> can read your calendar.</h2>
            <p>Ask about your day, find a free hour, or hand over a to-do.</p>
            <div className="chips">
              {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="you">{m.text}</div>
          ) : (
            <div key={i} className="turn">
              <img src={pet.src} alt="" draggable={false} />
              <div>
                <div className="who" translate="no">{pet.name}</div>
                <Markdown text={replyWithoutLead(m.text) ?? m.text} />
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="turn">
            <img src={pet.src} alt="" draggable={false} />
            <div>
              <div className="who" translate="no">{pet.name}</div>
              {typed.text
                ? <Markdown text={typed.text} typing />
                : <p className="status"><span className="paws" aria-hidden="true"><i /><i /><i /></span>{status || "Thinking…"}</p>}
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      {undo && (
        <div className="toast" role="status">
          Chat cleared.
          <button className="link" onClick={restore}>Undo</button>
        </div>
      )}

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="field">
          <textarea
            ref={field}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            placeholder={`Ask ${pet.name} anything…`}
            aria-label={`Message ${pet.name}`}
            autoComplete="off"
            spellCheck
          />
          <button type="submit" className="send" aria-label="Send message" aria-busy={busy}>
            {busy ? <span className="spin" aria-hidden="true" /> : (
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M8 13V3m0 0L3.5 7.5M8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
            )}
          </button>
        </div>
        {msgs.length > 0 && (
          <button type="button" className="quiet" onClick={clear}>New chat</button>
        )}
      </form>
    </div>
  );
}
