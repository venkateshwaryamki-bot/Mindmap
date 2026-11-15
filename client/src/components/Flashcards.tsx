import { useMemo, useState } from "react";
import { type MindMap, type MindNode, pathTo } from "@shared/model";

interface Card {
  id: string;
  context: string;
  front: string;
  hint: string;
  back: string[];
  note?: string;
}

export function buildCards(map: MindMap): Card[] {
  const cards: Card[] = [];
  const visit = (n: MindNode) => {
    const crumbs = pathTo(map.root, n.id).slice(0, -1).map((p) => p.text);
    const label = `${n.marker ? n.marker + " " : ""}${n.text}`;
    if (n.children.length) {
      cards.push({
        id: n.id,
        context: crumbs.join(" › "),
        front: label,
        hint: `Recall the ${n.children.length} point${n.children.length > 1 ? "s" : ""}`,
        back: n.children.map((c) => `${c.marker ? c.marker + " " : ""}${c.text}`),
        note: n.note,
      });
    } else if (n.note) {
      cards.push({ id: n.id, context: crumbs.join(" › "), front: label, hint: "Explain this", back: [], note: n.note });
    }
    for (const c of n.children) visit(c);
  };
  visit(map.root);
  return cards;
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function Flashcards({ map, onExit }: { map: MindMap; onExit: () => void }) {
  const all = useMemo(() => buildCards(map), [map]);
  const [queue, setQueue] = useState<Card[]>(all);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const [again, setAgain] = useState<Set<string>>(new Set());
  const [seen, setSeen] = useState(0);

  const card = queue[0];
  const restart = (cards: Card[]) => {
    setQueue(cards);
    setKnown(0);
    setAgain(new Set());
    setSeen(0);
    setFlipped(false);
  };
  const answer = (ok: boolean) => {
    if (!card) return;
    setFlipped(false);
    setSeen((s) => s + 1);
    if (ok) {
      setKnown((k) => k + 1);
      setQueue((q) => q.slice(1));
    } else {
      setAgain((s) => new Set(s).add(card.id));
      setQueue((q) => [...q.slice(1), card]);
    }
  };

  return (
    <div className="flashcards">
      <header className="fc-head">
        <button type="button" className="btn" onClick={onExit}>
          ✕ Close
        </button>
        <div className="fc-score">
          <span>🃏 {all.length} cards</span>
          <span className="ok">✓ {known}</span>
          <span className="again">↺ {again.size}</span>
        </div>
        <button type="button" className="btn" onClick={() => restart(shuffle(all))}>
          🔀 Shuffle
        </button>
      </header>

      {all.length === 0 ? (
        <div className="fc-done">
          <div className="fc-emoji">🗂️</div>
          <h2>No cards yet</h2>
          <p>Flashcards are made from topics that have sub-topics or notes. Add some and come back.</p>
        </div>
      ) : card ? (
        <>
          <div className="progress fc-progress">
            <div style={{ width: `${(known / all.length) * 100}%` }} />
          </div>
          <button type="button" className={`fc-card${flipped ? " flipped" : ""}`} onClick={() => setFlipped((f) => !f)}>
            <div className="fc-face fc-front">
              {card.context && <div className="fc-context">{card.context}</div>}
              <div className="fc-question">{card.front}</div>
              <div className="fc-hint">{card.hint} · tap to flip</div>
            </div>
            <div className="fc-face fc-back">
              <div className="fc-question small">{card.front}</div>
              {card.back.length > 0 && (
                <ul>
                  {card.back.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
              {card.note && <p className="fc-note">{card.note}</p>}
            </div>
          </button>
          <div className="fc-actions">
            <button type="button" className="btn big again" onClick={() => answer(false)}>
              ↺ Again
            </button>
            <button type="button" className="btn big ok" onClick={() => answer(true)}>
              ✓ Got it
            </button>
          </div>
          <p className="muted center small">Reviewed {seen} · {queue.length} left</p>
        </>
      ) : (
        <div className="fc-done">
          <div className="fc-emoji">🎉</div>
          <h2>Deck complete!</h2>
          <p>
            You knew {all.length - again.size} of {all.length} cards on the first try.
          </p>
          <div className="fc-actions">
            {again.size > 0 && (
              <button type="button" className="btn big again" onClick={() => restart(all.filter((c) => again.has(c.id)))}>
                Practise the {again.size} missed
              </button>
            )}
            <button type="button" className="btn big ok" onClick={() => restart(shuffle(all))}>
              Study again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
