import { beforeEach, describe, expect, it } from "vitest";
import { freshStorage, readStorage, settingsFor, writeStorage } from "./storage";

const STORAGE_KEY = "poe1-skill-comparison:v2";

describe("browser skill-settings storage", () => {
  beforeEach(() => localStorage.clear());

  it("uses the requested comparison defaults", () => {
    expect(freshStorage().global).toMatchObject({
      gemLevel: 21,
      projectileOverlapSupports: true,
      useCooldownForCalculations: true,
      critMode: "custom",
      criticalChanceScalingPercent: 500,
      critMultiplierPercent: 300
    });
  });

  it("round-trips global and per-skill settings", () => {
    const state = freshStorage();
    state.global.gemLevel = 28;
    state.global.projectileOverlapSupports = true;
    state.global.useCooldownForCalculations = true;
    state.skills.Fireball = { settingDescription: "Ignite setup", modifiers: [
      { id: "hits", type: "hit_count", value: 3 },
      { id: "more", type: "more_damage", value: 20 }
    ], profileModifierOverrides: { "profile:Fireball:baseline:hits": 8 } };
    writeStorage(state);

    const loaded = readStorage();
    expect(loaded.global.gemLevel).toBe(28);
    expect(loaded.global.projectileOverlapSupports).toBe(true);
    expect(loaded.global.useCooldownForCalculations).toBe(true);
    expect(settingsFor(loaded, "Fireball")).toEqual(state.skills.Fireball);
  });

  it("gives newly imported gem IDs empty settings", () => {
    const state = freshStorage();
    state.skills.Fireball = { settingDescription: "Saved", modifiers: [{ id: "hits", type: "hit_count", value: 3 }] };
    expect(settingsFor(state, "BrandNewGem")).toEqual({ settingDescription: "", modifiers: [] });
  });

  it("falls back safely when saved JSON is corrupt", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    expect(readStorage()).toEqual(freshStorage());
  });

  it("rejects a different storage schema version", () => {
    const state = freshStorage();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, version: 1 }));
    expect(readStorage()).toEqual(freshStorage());
  });

  it("falls back from an invalid critical mode", () => {
    const state = freshStorage();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, global: { ...state.global, critMode: "always" } }));
    expect(readStorage().global.critMode).toBe("custom");
  });
});
