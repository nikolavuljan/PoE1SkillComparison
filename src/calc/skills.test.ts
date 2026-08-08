import { describe, expect, it } from "vitest";
import { calculateSkill, levelFor } from "./skills";
import { defaultGlobalInputs, defaultSkillSettings } from "../data/storage";
import type { SkillModifier, SkillSettings, SkillView } from "../types/app";

function view(overrides: Partial<SkillView["ability"]> = {}, category: "spell" | "attack" = "spell"): SkillView {
  const ability: SkillView["ability"] = {
    role: "primary",
    id: "TestSkill",
    name: "Test Skill",
    description: "Deals test damage.",
    castTime: 0.8,
    skillTypes: category === "spell" ? ["Spell", "Damage"] : ["Attack", "Damage"],
    levels: [{
      level: 20,
      damage: { ranges: [{ source: category, kind: "base", type: "fire", min: 100, max: 200 }] },
      addedDamageEffectiveness: 2,
      addedDamageEffectivenessPercent: 200,
      criticalStrikeChance: 10,
      attack: category === "attack" ? { attackSpeedPercentOfBase: 125, attackDamagePercentOfBase: 160 } : undefined
    }],
    ...overrides
  };
  return {
    key: "Metadata/Items/Gems/Test",
    gem: {
      id: "Metadata/Items/Gems/Test",
      gameId: "Test",
      familyId: "Test",
      name: "Test Skill",
      baseTypeName: "Test Skill",
      category,
      tags: [category, "grants_active_skill"],
      abilities: [ability],
      hasDirectDamage: true
    },
    ability,
    flags: [],
    searchText: "test skill deals test damage"
  };
}

describe("PoE1 skill calculations", () => {
  it("uses the closest exported level at or below the requested level", () => {
    const ability = view({ levels: [{ level: 1 }, { level: 10 }, { level: 20 }] }).ability;
    expect(levelFor(ability, 15)?.level).toBe(10);
    expect(levelFor(ability, 20)?.level).toBe(20);
  });

  it("reads base skill-effect duration without mistaking duration modifiers for time values", () => {
    const skill = view({
      constantStats: { base_skill_effect_duration: 2500 },
      valueStatIds: ["stun_duration_+%_vs_enemies_that_are_on_full_life"],
      levels: [{
        level: 20,
        values: [39],
        damage: { ranges: [{ source: "spell", kind: "base", type: "fire", min: 100, max: 200 }] }
      }]
    });

    expect(calculateSkill(skill, { ...defaultGlobalInputs, critMode: "off" }, defaultSkillSettings).duration).toBe(2.5);
  });

  it("adds custom flat damage per hit without applying damage effectiveness", () => {
    const result = calculateSkill(view(), { ...defaultGlobalInputs, critMode: "off" }, settings(
      { id: "added", type: "added_damage", value: 15 }
    ));
    expect(result.minDamage).toBe(115);
    expect(result.maxDamage).toBe(215);
    expect(result.averageHit).toBe(165);
    expect(result.hitDps).toBeCloseTo(206.25);
    expect(result.damageEffectivenessPercent).toBe(200);
    expect(result.averageDamageEffectivenessPercent).toBe(200);
    expect(result.averageDamageEffectivenessPerSecondPercent).toBe(250);
  });

  it("composes duplicate more multipliers, sums added damage, and uses the final hit override", () => {
    const result = calculateSkill(view(), { ...defaultGlobalInputs, critMode: "off" }, settings(
      { id: "more-1", type: "more_damage", value: 50 },
      { id: "more-2", type: "more_damage", value: 20 },
      { id: "added-1", type: "added_damage", value: 10 },
      { id: "added-2", type: "added_damage", value: 5 },
      { id: "hits-1", type: "hit_count", value: 2 },
      { id: "hits-2", type: "hit_count", value: 4 }
    ));
    expect(result.minDamage).toBeCloseTo(207);
    expect(result.maxDamage).toBeCloseTo(387);
    expect(result.hitDps).toBeCloseTo(1485);
    expect(result.averageDamageEffectivenessPercent).toBeCloseTo(1440);
    expect(result.averageDamageEffectivenessPerSecondPercent).toBeCloseTo(1800);
  });

  it("keeps exported DoT unchanged by hit, damage, resource, and supplemental settings", () => {
    const skill = view({
      customScaling: [{ stat: "life_dot", damageType: "fire", resource: "life", percentPerSecond: 10 }],
      levels: [{
        level: 20,
        damage: {
          ranges: [],
          damageOverTimePerSecond: [{ stat: "base_dot", source: "spell", type: "fire", value: 50 }],
          supplementalDamageOverTimePerSecond: [{ stat: "conditional_dot", source: "spell", type: "fire", value: 100, scope: "actor-condition" }]
        },
        criticalStrikeChance: 0
      }]
    });
    const result = calculateSkill(skill, { ...defaultGlobalInputs, critMode: "off" }, settings(
      { id: "more", type: "more_damage", value: 200 },
      { id: "hits", type: "hit_count", value: 7 },
      { id: "life", type: "maximum_life", value: 5000 }
    ));

    expect(result.dotDps).toBe(50);
  });

  it("applies a base cast-time override before more cast-speed modifiers", () => {
    const result = calculateSkill(view(), { ...defaultGlobalInputs, critMode: "off" }, settings(
      { id: "cast", type: "override_cast_time", value: .5 },
      { id: "speed", type: "more_speed", value: 100 }
    ));
    expect(result.castTime).toBe(.25);
    expect(result.hitDps).toBe(600);
    expect(result.averageDamageEffectivenessPercent).toBe(200);
    expect(result.averageDamageEffectivenessPerSecondPercent).toBe(800);
  });

  it("can disable cooldown throughput calculations", () => {
    const skill = view({ levels: [{
      level: 20,
      damage: { ranges: [{ source: "spell", kind: "base", type: "fire", min: 100, max: 200 }] },
      criticalStrikeChance: 0,
      metadata: { cooldown: 4, storedUses: 3 }
    }] });
    const result = calculateSkill(skill, {
      ...defaultGlobalInputs,
      critMode: "off",
      useCooldownForCalculations: false
    }, defaultSkillSettings);
    expect(result.cooldown).toBe(4);
    expect(result.storedUses).toBe(3);
    expect(result.hitDps).toBeCloseTo(187.5);
  });

  it("optionally divides cooldown by stored uses for spell throughput", () => {
    const skill = view({ levels: [{
      level: 20,
      damage: { ranges: [{ source: "spell", kind: "base", type: "fire", min: 100, max: 200 }] },
      addedDamageEffectivenessPercent: 200,
      criticalStrikeChance: 0,
      metadata: { cooldown: 8, storedUses: 3 }
    }] });
    const result = calculateSkill(skill, {
      ...defaultGlobalInputs,
      critMode: "off",
      useCooldownForCalculations: true
    }, defaultSkillSettings);

    expect(result.castTime).toBe(.8);
    expect(result.hitDps).toBeCloseTo(56.25);
    expect(result.averageDamageEffectivenessPerSecondPercent).toBeCloseTo(75);
    expect(result.warnings).toContain("Cooldown calculation uses 8 sec ÷ 3 uses = 2.66667 sec per use.");
  });

  it("does not calculate supplemental damage and explains how to opt into it", () => {
    const skill = view({ levels: [{
      level: 20,
      damage: {
        ranges: [{ source: "spell", kind: "base", type: "fire", min: 100, max: 200 }],
        supplementalRanges: [{
          source: "global:vs_burning_enemies",
          kind: "added",
          type: "fire",
          min: 30,
          max: 60,
          scope: "actor-condition"
        }]
      },
      criticalStrikeChance: 0
    }] });
    const result = calculateSkill(skill, { ...defaultGlobalInputs, critMode: "off" }, defaultSkillSettings);

    expect(result.averageHit).toBe(150);
    expect(result.warnings).toContain("Baseline excludes enemy-conditional damage; add the appropriate value in this skill's settings when needed.");
  });

  it("includes exported burning-enemy flat damage for both Fire Trap profiles", () => {
    const skill = view({
      id: "FireTrapAltX",
      levels: [{
        level: 20,
        damage: {
          ranges: [{ source: "spell", kind: "base", type: "fire", min: 100, max: 200 }],
          supplementalRanges: [{
            source: "global:vs_burning_enemies",
            kind: "added",
            type: "fire",
            min: 30,
            max: 60,
            scope: "actor-condition"
          }]
        },
        criticalStrikeChance: 0
      }]
    });
    const withoutOverlap = calculateSkill(skill, {
      ...defaultGlobalInputs,
      critMode: "off",
      projectileOverlapSupports: false
    }, defaultSkillSettings);
    const withOverlap = calculateSkill(skill, {
      ...defaultGlobalInputs,
      critMode: "off",
      projectileOverlapSupports: true
    }, defaultSkillSettings);

    expect(withoutOverlap.averageHit).toBe(195);
    expect(withoutOverlap.hitCount).toBe(1.5);
    expect(withOverlap.averageHit).toBe(195);
    expect(withOverlap.hitCount).toBe(1.5);
    expect(withOverlap.warnings).not.toContain("Baseline excludes enemy-conditional damage; add the appropriate value in this skill's settings when needed.");
  });

  it("adds resource-pool scaling for Forbidden Rite-style skills", () => {
    const skill = view({ customScaling: [
      { stat: "life", damageType: "chaos", resource: "life", percent: 14 },
      { stat: "es", damageType: "chaos", resource: "energy_shield", percent: 5 }
    ] });
    const result = calculateSkill(skill, { ...defaultGlobalInputs, critMode: "off" }, settings(
      { id: "life", type: "maximum_life", value: 5000 },
      { id: "es", type: "maximum_energy_shield", value: 1000 }
    ));
    expect(result.minDamage).toBe(850);
    expect(result.maxDamage).toBe(950);
    expect(result.damageTypes).toContain("chaos");
  });

  it("uses attack speed and weapon damage percentages independently of flat added damage", () => {
    const result = calculateSkill(view({}, "attack"), { ...defaultGlobalInputs, critMode: "off" }, defaultSkillSettings);
    expect(result.weaponDamagePercent).toBe(160);
    expect(result.attackTime).toBeCloseTo(.8);
    expect(result.dpsPercent).toBeCloseTo(200);
    expect(result.averageDamageEffectivenessPerSecondPercent).toBeCloseTo(250);
  });

  it("scales base critical chance in custom mode", () => {
    const skill = view({ levels: [{
      level: 20,
      damage: { ranges: [{ source: "spell", kind: "base", type: "fire", min: 100, max: 100 }] },
      addedDamageEffectivenessPercent: 200,
      criticalStrikeChance: 6
    }] });
    const result = calculateSkill(skill, {
      ...defaultGlobalInputs,
      critMode: "custom",
      criticalChanceScalingPercent: 500
    }, defaultSkillSettings);
    expect(result.critChance).toBe(30);
    expect(result.averageHit).toBeCloseTo(160);
    expect(result.averageDamageEffectivenessPercent).toBeCloseTo(320);
    expect(result.averageDamageEffectivenessPerSecondPercent).toBeCloseTo(400);
  });

  it("does not apply base critical mode to damage-effectiveness comparisons", () => {
    const skill = view({ levels: [{
      level: 20,
      damage: { ranges: [{ source: "spell", kind: "base", type: "fire", min: 100, max: 100 }] },
      addedDamageEffectivenessPercent: 200,
      criticalStrikeChance: 6
    }] });
    const result = calculateSkill(skill, { ...defaultGlobalInputs, critMode: "base" }, defaultSkillSettings);

    expect(result.averageHit).toBeGreaterThan(100);
    expect(result.averageDamageEffectivenessPercent).toBe(200);
    expect(result.averageDamageEffectivenessPerSecondPercent).toBe(250);
  });

  it("leaves skills unchanged when the secondary profile has no registered entry", () => {
    const skill = view();
    const result = calculateSkill(skill, {
      ...defaultGlobalInputs,
      critMode: "off",
      projectileOverlapSupports: true
    }, defaultSkillSettings);

    expect(result.averageHit).toBe(150);
    expect(result.hitDps).toBeCloseTo(187.5);
  });

  it("applies hit, support-penalty, and custom-flat defaults", () => {
    const skill = view();
    skill.ability.id = "ForbiddenRite";
    const result = calculateSkill(skill, { ...defaultGlobalInputs, critMode: "off", projectileOverlapSupports: true }, defaultSkillSettings);

    expect(result.minDamage).toBeCloseTo(1221);
    expect(result.maxDamage).toBeCloseTo(1276.5);
    expect(result.hitDps).toBeCloseTo(9365.625);
    expect(result.averageDamageEffectivenessPercent).toBeCloseTo(666);
  });

  it("uses Forbidden Rite's clean two-hit baseline when overlap supports are disabled", () => {
    const skill = view();
    skill.ability.id = "ForbiddenRite";
    const result = calculateSkill(skill, {
      ...defaultGlobalInputs,
      critMode: "off",
      projectileOverlapSupports: false
    }, defaultSkillSettings);

    expect(result.minDamage).toBe(2200);
    expect(result.maxDamage).toBe(2300);
    expect(result.hitCount).toBe(2);
    expect(result.hitDps).toBe(5625);
    expect(result.averageDamageEffectivenessPercent).toBe(400);
  });

  it("lets manual replacement settings override profile defaults", () => {
    const skill = view();
    skill.ability.id = "BallLightning";
    const result = calculateSkill(skill, { ...defaultGlobalInputs, critMode: "off", projectileOverlapSupports: true }, settings(
      { id: "manual-hits", type: "hit_count", value: 2 }
    ));
    expect(result.hitDps).toBeCloseTo(375);
  });

  it("can disable critical damage for a profile without hiding crit chance", () => {
    const skill = view();
    skill.ability.id = "BladefallAltY";
    const result = calculateSkill(skill, { ...defaultGlobalInputs, projectileOverlapSupports: true }, defaultSkillSettings);
    expect(result.critChance).toBe(50);
    expect(result.averageHit).toBeCloseTo(106.875);
  });
});

function settings(...modifiers: SkillModifier[]): SkillSettings {
  return { settingDescription: "", modifiers };
}
