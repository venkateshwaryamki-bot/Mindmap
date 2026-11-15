import { useEffect, useMemo } from "react";
import type { MindMap, MindNode } from "@shared/model";
import type { LayoutResult } from "../layout";
import { Icon } from "./Icon";

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
  playing: boolean;
  setPlaying: (p: boolean) => void;
  onExit: () => void;
  focusOn: (ids: string[], maxScale?: number) => void;
  fit: () => void;
  getLayout: () => LayoutResult | null;
}

export function PresentControls({ map, step, setStep, playing, setPlaying, onExit, focusOn, fit, getLayout }: PresentProps) {
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

  // Autoplay
  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setStep(step + 1), 3500);
    return () => window.clearTimeout(t);
  }, [playing, step, last, setStep, setPlaying]);

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
    <>
      <div className="present-top">
        <span className="present-count">
          {step + 1} / {steps.length}
        </span>
        <span className="present-title">{step === 0 ? map.title : current}</span>
        <button type="button" className="present-btn" onClick={onExit} aria-label="Exit presentation">
          <Icon name="x" />
        </button>
      </div>
      <div className="present-bottom">
        <button type="button" className="present-btn" disabled={step === 0} onClick={() => setStep(step - 1)} aria-label="Previous">
          <Icon name="arrowLeft" />
        </button>
        <button type="button" className="present-play" onClick={() => (step >= last ? (setStep(0), setPlaying(true)) : setPlaying(!playing))} aria-label={playing ? "Pause" : "Play"}>
          <Icon name={playing ? "pause" : "play"} size={26} />
        </button>
        <button type="button" className="present-btn" disabled={step >= last} onClick={() => setStep(step + 1)} aria-label="Next">
          <Icon name="arrowRight" />
        </button>
      </div>
    </>
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
      <button type="button" className="icon-btn" onClick={onExit} aria-label="Exit quiz">
        <Icon name="x" />
      </button>
      <div className="study-info">
        <strong>{done ? "🎉 All recalled!" : "Recall it, then tap to check"}</strong>
        <span>
          {revealed} / {total} revealed
        </span>
        <div className="progress">
          <div style={{ width: `${total ? (revealed / total) * 100 : 0}%` }} />
        </div>
      </div>
      <button type="button" className="btn" onClick={onReset}>
        <Icon name="quiz" size={16} /> Hide all
      </button>
      <button type="button" className="btn primary" disabled={done} onClick={onRevealAll}>
        Show all
      </button>
    </div>
  );
}
