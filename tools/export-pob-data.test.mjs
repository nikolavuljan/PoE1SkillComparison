import { describe, expect, it } from "vitest";
import { damageSummary, normalizeLevels } from "./export-pob-data.mjs";

const raw = (value) => ({ __raw: value });

describe("PoB damage export", () => {
  it("adds repeated stat ids before building a baseline range", () => {
    const result = damageSummary([
      ["spell_minimum_base_physical_damage", 1337],
      ["spell_maximum_base_physical_damage", 2005],
      ["spell_minimum_base_physical_damage", -1069],
      ["spell_maximum_base_physical_damage", -1604]
    ], undefined, {
      spell_minimum_base_physical_damage: [raw('skill("PhysicalMin", nil)')],
      spell_maximum_base_physical_damage: [raw('skill("PhysicalMax", nil)')]
    });

    expect(result.ranges).toEqual([expect.objectContaining({ min: 268, max: 401 })]);
    expect(result.ranges[0]).not.toHaveProperty("scope");
  });

  it("infers 100% effectiveness for an omitted value on a flat-hit skill", () => {
    const skill = {
      levels: { 1: { 1: 100, 2: 200 } },
      stats: ["spell_minimum_base_fire_damage", "spell_maximum_base_fire_damage"]
    };
    const { rows } = normalizeLevels(skill, skill.stats, [], {}, {});

    expect(rows[0].addedDamageEffectiveness).toBe(1);
    expect(rows[0].addedDamageEffectivenessPercent).toBe(100);
    expect(rows[0].addedDamageEffectivenessSource).toBe("implicit-hit-default");
  });

  it("does not infer hit effectiveness for a pure damage-over-time skill", () => {
    const skill = {
      levels: { 1: { 1: 600 } },
      stats: ["base_fire_damage_to_deal_per_minute"]
    };
    const { rows } = normalizeLevels(skill, skill.stats, [], {}, {});

    expect(rows[0].damage.damageOverTimePerSecond[0].value).toBe(10);
    expect(rows[0]).not.toHaveProperty("addedDamageEffectiveness");
    expect(rows[0]).not.toHaveProperty("addedDamageEffectivenessSource");
  });

  it("keeps external and non-default-part damage out of the baseline", () => {
    const result = damageSummary([
      ["spell_minimum_base_fire_damage", 100],
      ["spell_maximum_base_fire_damage", 200],
      ["global_minimum_added_fire_damage_vs_burning_enemies", 30],
      ["global_maximum_added_fire_damage_vs_burning_enemies", 60],
      ["flask_throw_minimum_cold_damage_if_used_sapphire_flask", 40],
      ["flask_throw_maximum_cold_damage_if_used_sapphire_flask", 80]
    ], {
      flask_throw_minimum_cold_damage_if_used_sapphire_flask: [raw('mod("ColdMin", "BASE", nil, 0, 0, { type = "SkillPart", skillPartList = { 2, 5, 6, 8 } })')],
      flask_throw_maximum_cold_damage_if_used_sapphire_flask: [raw('mod("ColdMax", "BASE", nil, 0, 0, { type = "SkillPart", skillPartList = { 2, 5, 6, 8 } })')]
    }, {
      spell_minimum_base_fire_damage: [raw('skill("FireMin", nil)')],
      spell_maximum_base_fire_damage: [raw('skill("FireMax", nil)')],
      global_minimum_added_fire_damage_vs_burning_enemies: [raw('mod("FireMin", "BASE", nil, 0, 0, { type = "ActorCondition", actor = "enemy", var = "Burning" })')],
      global_maximum_added_fire_damage_vs_burning_enemies: [raw('mod("FireMax", "BASE", nil, 0, 0, { type = "ActorCondition", actor = "enemy", var = "Burning" })')]
    });

    expect(result.ranges).toEqual([expect.objectContaining({ min: 100, max: 200 })]);
    expect(result.supplementalRanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ min: 30, max: 60, scope: "actor-condition" }),
      expect.objectContaining({ min: 40, max: 80, scope: "skill-part" })
    ]));
  });
});
