import type { ColumnSizingState } from "@tanstack/react-table";
import type { Tab } from "../types/app";

const STORAGE_KEY = "poe1-skill-comparison:table-layout:v2";

interface SavedTableLayout {
  version: 2;
  columnSizing: Record<Tab, ColumnSizingState>;
}

export function readColumnSizing(tab: Tab): ColumnSizingState {
  return readLayout().columnSizing[tab];
}

export function writeColumnSizing(tab: Tab, columnSizing: ColumnSizingState): void {
  try {
    const current = readLayout();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...current,
      columnSizing: { ...current.columnSizing, [tab]: columnSizing }
    } satisfies SavedTableLayout));
  } catch {
    // Resizing remains available when storage is unavailable or full.
  }
}

function readLayout(): SavedTableLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshLayout();
    const parsed = JSON.parse(raw) as Partial<SavedTableLayout>;
    return {
      version: 2,
      columnSizing: {
        spells: validSizing(parsed.columnSizing?.spells),
        attacks: validSizing(parsed.columnSizing?.attacks)
      }
    };
  } catch {
    return freshLayout();
  }
}

function freshLayout(): SavedTableLayout {
  return { version: 2, columnSizing: { spells: {}, attacks: {} } };
}

function validSizing(value: unknown): ColumnSizingState {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] =>
    typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] > 0
  ));
}
