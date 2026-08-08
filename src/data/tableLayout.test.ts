import { beforeEach, describe, expect, it } from "vitest";
import { readColumnSizing, writeColumnSizing } from "./tableLayout";

const STORAGE_KEY = "poe1-skill-comparison:table-layout:v2";

describe("table layout storage", () => {
  beforeEach(() => localStorage.clear());

  it("keeps separate column widths for spell and attack tables", () => {
    writeColumnSizing("spells", { skill: 320, hitDps: 140 });
    writeColumnSizing("attacks", { skill: 280 });

    expect(readColumnSizing("spells")).toEqual({ skill: 320, hitDps: 140 });
    expect(readColumnSizing("attacks")).toEqual({ skill: 280 });
  });

  it("ignores corrupt or invalid saved widths", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2,
      columnSizing: { spells: { skill: -2, hitDps: 135, tags: "wide" }, attacks: null }
    }));

    expect(readColumnSizing("spells")).toEqual({ hitDps: 135 });
    expect(readColumnSizing("attacks")).toEqual({});
  });
});
