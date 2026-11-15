import { useEffect, useMemo } from "react";
import type { MindMap, MindNode } from "@shared/model";
import type { LayoutResult } from "../layout";

export type StudyMode = "present" | "quiz";

/** Presentation steps: the central topic, then each topic's children in reading order. */
export function presentationSteps(map: MindMap): { parent: string; reveal: string[] }[] {
  const steps: { parent: string; reveal: string[] }[] = [{ parent: map.root.id, reveal: [] }];
  const visit = (n: MindNode) => {
    if (n.collapsed || !n.children.length) return;
    steps.push({ parent: n.id, reveal: n.children.map((c) => c.id) });
    for (const c of n.children) visit(c);
  };
  visit(map.root);
  return steps;
}

export function visibleAtStep(steps: { reveal: string[] }[], step: number): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i <= step && i < steps.length; i++) for (const id of steps[i].reveal) set.add(id);
  return set;
}

interface PresentProps {
  map: MindMap;
  step: number;
  setStep: (n: number) => void;
  onExit: () => void;
  focusOn: (ids: string[], maxScale?: number) => void;
  fit: () => void;
  getLayout: () => LayoutResult | null;
}

export function PresentControls({ map, step, setStep, onExit, focusOn, fit, getLayout }: PresentProps) {
  const steps = useMemo(() => presentationSteps(map), [map]);
  const last = steps.length - 1;

  useEffect(() => {
    const s = steps[Math.min(step, last)];
    const t = window.setTimeout(() => {
      if (step === 0) focusOn([map.root.id], 1.6);
      else if (step >= last && last > 0) fit();
      else focusOn([s.parent, ...s.reveal], 1.4);
    }, 40);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, steps.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", " ", "PageDown", "Enter"].includes(e.key)) {
        e.preventDefault();
        setStep(Math.min(last, step + 1));
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) {
        e.preventDefault();
        setStep(Math.max(0, step - 1));
      } else if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [step, last, setStep, onExit]);

  const current = getLayout()?.byId.get(steps[Math.min(step, last)].parent)?.node.text;
  return (
    <div className="study-bar">
      <button type="button" className="btn" onClick={onExit}>
        ✕ Exit
      </button>
      <div className="study-info">
        <strong>{step === 0 ? map.title : current}</strong>
        <span>
          Slide {step + 1} of {steps.length}
        </span>
      </div>
      <button type="button" className="btn big" disabled={step === 0} onClick={() => setStep(step - 1)} aria-label="Previous">
        ◀
      </button>
      <button type="button" className="btn big primary" disabled={step >= last} onClick={() => setStep(step + 1)} aria-label="Next">
        ▶
      </button>
    </div>
  );
}

interface QuizProps {
  total: number;
  revealed: number;
  onRevealAll: () => void;
  onReset: () => void;
  onExit: () => void;
}

export function QuizControls({ total, revealed, onRevealAll, onReset, onExit }: QuizProps) {
  const done = revealed >= total;
  return (
    <div className="study-bar">
      <button type="button" className="btn" onClick={onExit}>
        ✕ Exit
      </button>
      <div className="study-info">
        <strong>{done ? "🎉 All recalled!" : "Recall, then tap a card to check"}</strong>
        <span>
          {revealed} / {total} revealed
        </span>
        <div className="progress">
          <div style={{ width: `${total ? (revealed / total) * 100 : 0}%` }} />
        </div>
      </div>
      <button type="button" className="btn" onClick={onReset}>
        ↺ Hide all
      </button>
      <button type="button" className="btn primary" disabled={done} onClick={onRevealAll}>
        Show all
      </button>
    </div>
  );
}
