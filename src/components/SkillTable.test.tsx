import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSkillSettings } from "../data/storage";
import type { SkillResult, SkillView } from "../types/app";
import type { GemDataPayload } from "../types/data";
import { SkillTable, type SkillRow } from "./SkillTable";

const data: GemDataPayload = {
  schemaVersion: 1,
  source: { game: "Path of Exile", format: "test" },
  gems: [],
  statDescriptions: {},
};

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

describe("SkillTable", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    localStorage.clear();
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
    host = document.createElement("div");
    document.body.append(host);
  });

  afterEach(() => host.remove());

  it("sorts through TanStack and preserves the custom settings detail row", async () => {
    const root = createRoot(host);
    const rows = [skillRow("Low damage", 100), skillRow("High damage", 500)];

    await act(async () => root.render(
      <SkillTable tab="spells" rows={rows} data={data} onSettingsChange={() => {}} />
    ));

    const skillCells = [...host.querySelectorAll<HTMLElement>(".skill-cell")];
    expect(skillCells.map((cell) => cell.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("High damage"), expect.stringContaining("Low damage")]));
    expect(skillCells[0].textContent).toContain("High damage");

    await act(async () => skillCells[0].click());
    expect(host.querySelector(".settings-row")).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>(".setting-description input")?.placeholder).toContain("7 chains");

    await act(async () => skillCells[0].click());
    expect(host.querySelector(".settings-row")).toBeNull();

    await act(async () => root.unmount());
  });

  it("keeps the settings row open when recalculated row data is supplied", async () => {
    const root = createRoot(host);
    let rows = [skillRow("Arc", 500)];

    await act(async () => root.render(
      <SkillTable tab="spells" rows={rows} data={data} onSettingsChange={() => {}} />
    ));
    await act(async () => host.querySelector<HTMLElement>(".skill-cell")!.click());

    rows = [{ ...rows[0], settings: { ...rows[0].settings, modifiers: [{ id: "more", type: "more_damage", value: 12.5 }] } }];
    await act(async () => root.render(
      <SkillTable tab="spells" rows={rows} data={data} onSettingsChange={() => {}} />
    ));

    expect(host.querySelector(".settings-row")).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>('input[value="12.5"]')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it("shows total damage across the hit count in the Average dmg column", async () => {
    const root = createRoot(host);

    await act(async () => root.render(
      <SkillTable tab="spells" rows={[skillRow("Three hits", 400, 3)]} data={data} onSettingsChange={() => {}} />
    ));

    expect(host.querySelector<HTMLElement>('td[data-column-id="average"]')?.textContent).toBe("900");

    await act(async () => root.unmount());
  });

  it("auto-fits every column when the table opens and can refit on double-click", async () => {
    const root = createRoot(host);
    let measuredWidth = 177;
    const measure = vi.spyOn(HTMLTableElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLTableElement) {
      return rectangle(this.classList.contains("column-auto-measure") ? measuredWidth : 0);
    });

    await act(async () => root.render(
      <SkillTable tab="spells" rows={[skillRow("Arc", 500)]} data={data} onSettingsChange={() => {}} />
    ));

    const headers = [...host.querySelectorAll<HTMLElement>("thead [data-column-id]")];
    const hitDpsHeader = headers.find((header) => header.dataset.columnId === "hitDps")!;
    const hitDpsColumn = host.querySelectorAll<HTMLTableColElement>("colgroup col")[headers.indexOf(hitDpsHeader)];
    expect(hitDpsColumn.style.width).toBe("178px");

    measuredWidth = 205;
    await act(async () => hitDpsHeader.querySelector<HTMLElement>(".column-resizer")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(hitDpsColumn.style.width).toBe("206px");

    measure.mockRestore();
    await act(async () => root.unmount());
  });
});

function rectangle(width: number): DOMRect {
  return { x: 0, y: 0, width, height: 20, top: 0, right: width, bottom: 20, left: 0, toJSON: () => ({}) };
}

function skillRow(name: string, hitDps: number, hitCount = 1): SkillRow {
  const ability = { role: "primary", id: name, name, customScaling: [], quality: [] };
  const view: SkillView = {
    key: name,
    gem: {
      id: name,
      gameId: name,
      familyId: name,
      name,
      baseTypeName: name,
      category: "spell",
      tags: ["Spell"],
      abilities: [ability],
      hasDirectDamage: true
    },
    ability,
    searchText: name,
    flags: []
  };
  const result: SkillResult = {
    minDamage: hitDps / 2,
    maxDamage: hitDps,
    averageHit: hitDps * .75,
    hitCount,
    hitDps,
    dotDps: 0,
    critChance: 5,
    castTime: 1,
    damageTypes: ["lightning"],
    level: 20,
    warnings: []
  };
  return { view, result, settings: { ...defaultSkillSettings, modifiers: [] }, defaultDescription: "" };
}
