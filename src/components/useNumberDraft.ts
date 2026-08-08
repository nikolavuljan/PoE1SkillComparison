import { useEffect, useRef, useState } from "react";

interface Options {
  value: number;
  min: number;
  max?: number;
  emptyValue?: number;
  onChange: (value: number) => void;
}

export function useNumberDraft({ value, min, max, emptyValue, onChange }: Options) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(String(value));
  }, [value]);

  function update(raw: string) {
    setDraft(raw);
    if (!raw.trim()) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < min || (max !== undefined && parsed > max)) return;
    onChange(roundInputNumber(parsed));
  }

  function commit() {
    if (!draft.trim()) {
      if (emptyValue === undefined) {
        setDraft(String(value));
      } else {
        const next = clamp(emptyValue, min, max);
        setDraft(String(next));
        if (next !== value) onChange(next);
      }
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = roundInputNumber(clamp(parsed, min, max));
    setDraft(String(next));
    if (next !== value) onChange(next);
  }

  return { inputRef, draft, update, commit };
}

function clamp(value: number, min: number, max: number | undefined): number {
  return Math.max(min, max === undefined ? value : Math.min(max, value));
}

function roundInputNumber(value: number): number {
  return Math.round(value * 100000) / 100000;
}
