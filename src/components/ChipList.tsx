import { createPortal } from "react-dom";
import { displayName } from "../data/derive";
import { useAnchoredPopover } from "./useAnchoredPopover";

interface Props {
  title: string;
  values: string[];
  previewValues?: string[];
  visibleCount?: number;
}

export function ChipList({ title, values, previewValues, visibleCount = 3 }: Props) {
  const clean = [...new Set(values)].filter(Boolean);
  const preview = previewValues === undefined
    ? clean
    : [...new Set(previewValues)].filter((value) => clean.includes(value));
  const { position, open, close } = useAnchoredPopover({ width: 440, height: 300 });
  const shown = preview.slice(0, visibleCount);

  if (!clean.length) return <span className="muted">–</span>;

  return (
    <>
      <span className="chip-list">
        {shown.map((value) => <span key={value} title={displayName(value)}>{displayName(value)}</span>)}
        {clean.length > shown.length ? (
          <button
            type="button"
            className="chip-overflow"
            aria-label={`Show all ${title.toLowerCase()}`}
            onMouseEnter={(event) => open(event.currentTarget)}
            onMouseLeave={close}
            onFocus={(event) => open(event.currentTarget)}
            onBlur={close}
          >+{clean.length - shown.length}</button>
        ) : null}
      </span>
      {position ? createPortal(
        <aside className="chip-tooltip" style={position} role="tooltip">
          <strong>{title}</strong>
          <div>{clean.map((value) => <code key={value}>{displayName(value)}</code>)}</div>
        </aside>,
        document.body
      ) : null}
    </>
  );
}
