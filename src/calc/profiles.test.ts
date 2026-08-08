import { describe, expect, it } from "vitest";
import { comparisonProfile, defaultSettingDescription, effectiveProfileModifiers } from "./profiles";
import type { SkillView } from "../types/app";

describe("comparison profiles", () => {
  it("defaults Wave of Conviction of Trarthus to two hits", () => {
    const profile = comparisonProfile(view("WaveOfConvictionAltY"), false);
    expect(profile?.modifiers.map(({ type, value }) => [type, value])).toEqual([["hit_count", 2]]);
  });

  it("uses the corrected Divine Ire perfect-release multiplier", () => {
    const profile = comparisonProfile(view("DivineIre"), false);
    expect(profile?.modifiers.map(({ type, value }) => [type, value])).toEqual([["more_damage", 227]]);
  });

  it("exposes setting descriptions independently from profile activation", () => {
    expect(defaultSettingDescription(view("Arc"))).toBe("First hit, assuming nine chains (135% more damage).");
    expect(defaultSettingDescription(view("UnregisteredSkill"))).toBe("");
  });

  it("keeps separate support multipliers multiplicative", () => {
    const profile = comparisonProfile(view("Bladefall"), true);
    expect(profile?.modifiers.map(({ type, value }) => [type, value])).toEqual([
      ["hit_count", 7],
      ["more_damage", -24],
      ["more_damage", -25]
    ]);
  });

  it("selects conservative defaults separately from overlap/support profiles", () => {
    const skill = view("Bladefall");
    expect(comparisonProfile(skill, false)?.modifiers.map(({ type, value }) => [type, value])).toEqual([
      ["hit_count", 2]
    ]);
    expect(comparisonProfile(skill, true)?.modifiers.map(({ type, value }) => [type, value])).toEqual([
      ["hit_count", 7],
      ["more_damage", -24],
      ["more_damage", -25]
    ]);
    expect(comparisonProfile(skill, false)?.modifiers[0].id).toBe("profile:Bladefall:baseline:hits");
    expect(comparisonProfile(skill, true)?.modifiers[0].id).toBe("profile:Bladefall:overlap:hits");
  });

  it("keeps non-support mechanics in the default profile regardless of the toggle", () => {
    for (const id of ["Arc", "BladeBlastAltX", "BladeVortex", "DivineIre", "FlameSurge", "ReapAltX", "Stormbind"]) {
      expect(comparisonProfile(view(id), false)).toBe(comparisonProfile(view(id), true));
    }
  });

  it("keeps a baseline-only profile active when overlap supports are enabled", () => {
    expect(comparisonProfile(view("FireTrapAltX"), false)?.modifiers[0].value).toBe(1.5);
    expect(comparisonProfile(view("FireTrapAltX"), true)?.modifiers[0].value).toBe(1.5);
    expect(defaultSettingDescription(view("FireTrapAltX"))).toContain("additional flat damage against a Burning enemy");
  });

  it("marks both Cold Snap of Power profiles as bypassing cooldown", () => {
    expect(comparisonProfile(view("ColdSnapAltX"), false)?.ignoreCooldownForCalculations).toBe(true);
    expect(comparisonProfile(view("ColdSnapAltX"), true)?.ignoreCooldownForCalculations).toBe(true);
    expect(defaultSettingDescription(view("ColdSnapAltX"))).toContain("spending a Power Charge bypasses it");
  });

  it("contains the revised standalone profile values", () => {
    expect(modifierValues("BladeBlastAltX")).toEqual([
      ["hit_count", 10],
      ["more_damage", 25],
      ["override_cast_time", 1]
    ]);
    expect(modifierValues("BladeVortex")).toEqual([
      ["override_cast_time", .13],
      ["more_damage", 300]
    ]);
    expect(modifierValues("BodyswapAltX")).toEqual([
      ["added_damage", 200],
      ["added_damage", 14500]
    ]);
    expect(modifierValues("FlameSurge")).toEqual([["more_damage", 110]]);
    expect(modifierValues("ReapAltX")).toEqual([["more_damage", 125]]);
    expect(modifierValues("ShockNovaAltX")).toEqual([["more_speed", 15]]);
    expect(modifierValues("PenanceBrandAltY")).toEqual([
      ["override_cast_time", .5],
      ["more_damage", 145]
    ]);
    expect(modifierValues("VolatileDeadAltY")).toEqual([
      ["added_damage", 800],
      ["hit_count", 10],
      ["override_cast_time", 1]
    ]);
  });

  it("applies stored overrides without mutating the registry baseline", () => {
    const profile = comparisonProfile(view("BallLightning"), false)!;
    expect(effectiveProfileModifiers(profile, {
      settingDescription: "",
      modifiers: [],
      profileModifierOverrides: { "profile:BallLightning:baseline:hits": 8 }
    })[0].value).toBe(8);
    expect(profile.modifiers[0].value).toBe(13);
    expect(profile.modifiers[0].id).toBe("profile:BallLightning:baseline:hits");
  });
});

function view(id: string): SkillView {
  const ability = { role: "primary", id, name: id };
  return {
    key: id,
    gem: { id, gameId: id, familyId: id, name: id, baseTypeName: id, category: "spell", tags: ["spell"], abilities: [ability], hasDirectDamage: true },
    ability,
    flags: [],
    searchText: id.toLowerCase()
  };
}

function modifierValues(id: string): [string, number][] {
  return comparisonProfile(view(id), false)?.modifiers.map(({ type, value }) => [type, value]) ?? [];
}
