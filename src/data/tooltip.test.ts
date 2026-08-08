import { describe, expect, it } from "vitest";
import { buildAbilityTooltipLines, buildQualityTooltipLines } from "./tooltip";
import type { GemDataPayload, GeneratedAbility } from "../types/data";

describe("PoE1 gem tooltip lines", () => {
  it("renders level ranges, constants, condition-selected lines, and unit transforms", () => {
    const ability: GeneratedAbility = {
      role: "primary", id: "IceNovaAltX", name: "Ice Nova of Frostbolts",
      valueStatIds: ["spell_minimum_base_cold_damage", "spell_maximum_base_cold_damage", "active_skill_base_area_of_effect_radius"],
      constantStats: {
        active_skill_base_area_of_effect_radius: 18,
        "base_chance_to_freeze_%": 25,
        ice_nova_number_of_frost_bolts_to_cast_on: 2,
        "ice_nova_damage_when_cast_on_frostbolt_+%_final": 50
      },
      levels: [
        { level: 1, values: [14, 20, 0] },
        { level: 20, values: [590, 885, 4] }
      ],
      tooltipDescriptionIds: {
        spell_minimum_base_cold_damage: "damage",
        active_skill_base_area_of_effect_radius: "radius",
        "base_chance_to_freeze_%": "freeze",
        ice_nova_number_of_frost_bolts_to_cast_on: "frostbolts",
        "ice_nova_damage_when_cast_on_frostbolt_+%_final": "more"
      }
    };
    const data = {
      schemaVersion: 1, source: { game: "Path of Exile 1", format: "test" }, gems: [],
      statDescriptions: {
        damage: { stats: ["spell_minimum_base_cold_damage", "spell_maximum_base_cold_damage"], lines: [{ limit: [["#", "#"], ["#", "#"]], text: "Deals {0} to {1} Cold Damage" }] },
        radius: { stats: ["active_skill_area_of_effect_description_mode", "active_skill_base_area_of_effect_radius", "active_skill_area_of_effect_radius"], lines: [
          { "1": { k: "locations_to_metres", v: 2 }, limit: [[0, 0], [10, 10], [0, 0]], text: "Base radius is {1} metre" },
          { "1": { k: "locations_to_metres", v: 2 }, limit: [[0, 0], ["!", 0], [0, 0]], text: "Base radius is {1} metres" },
          { "1": { k: "locations_to_metres", v: 3 }, limit: [[10, 10], ["!", 0], [1, "#"]], text: "Barnacle Snap radius is {2} metres" }
        ] },
        freeze: { stats: ["base_chance_to_freeze_%", "always_freeze"], lines: [
          { limit: [["#", "#"], [1, "#"]], text: "Always Freezes enemies" },
          { limit: [[1, 99], [0, 0]], text: "{0}% chance to Freeze enemies" }
        ] },
        frostbolts: { stats: ["ice_nova_number_of_frost_bolts_to_cast_on"], lines: [
          { limit: [[1, 1]], text: "Can expand from 1 Frostbolt Projectile" },
          { limit: [[2, "#"]], text: "Can expand from up to {0} Frostbolt Projectiles" }
        ] },
        more: { stats: ["ice_nova_damage_when_cast_on_frostbolt_+%_final"], lines: [
          { limit: [[1, "#"]], text: "Deals {0}% more Damage with Hits and Ailments when cast on Frostbolt" }
        ] }
      }
    } satisfies GemDataPayload;

    expect(buildAbilityTooltipLines(ability, data, 20).map((line) => line.text)).toEqual([
      "Deals (14-590) to (20-885) Cold Damage",
      "Base radius is (1.8-2.2) metres",
      "25% chance to Freeze enemies",
      "Can expand from up to 2 Frostbolt Projectiles",
      "Deals 50% more Damage with Hits and Ailments when cast on Frostbolt"
    ]);
  });

  it("renders a quality stat through the matching multi-stat tooltip template", () => {
    const ability: GeneratedAbility = {
      role: "primary",
      id: "Bodyswap",
      name: "Bodyswap",
      quality: [{ stat: "spell_base_fire_damage_%_maximum_life", perQuality: .3, tooltipDescriptionId: "bodyswap" }]
    };
    const data = {
      schemaVersion: 1, source: { game: "Path of Exile 1", format: "test" }, gems: [],
      statDescriptions: {
        bodyswap: {
          stats: ["spell_minimum_base_fire_damage", "spell_maximum_base_fire_damage", "spell_base_fire_damage_%_maximum_life"],
          lines: [
            { limit: [["#", "#"], [1, "#"], [0, 0]], text: "Deals {0} to {1} Fire Damage" },
            { limit: [[1, "#"], [1, "#"], [1, "#"]], text: "This Spell deals {0} to {1}, plus {2}% of your maximum Life, as base Fire Damage" },
            { limit: [[0, 0], [0, 0], [1, "#"]], text: "Deals {2:+d}% of your maximum Life, as base Fire Damage" }
          ]
        }
      }
    } satisfies GemDataPayload;

    expect(buildQualityTooltipLines(ability, data)).toEqual([{
      key: "quality:bodyswap:Deals +6% of your maximum Life, as base Fire Damage",
      text: "Deals +6% of your maximum Life, as base Fire Damage"
    }]);
  });

  it("adds duplicate PoB stat rows when rendering damage", () => {
    const ability: GeneratedAbility = {
      role: "primary",
      id: "AdjustedDamage",
      name: "Adjusted Damage",
      valueStatIds: [
        "spell_minimum_base_physical_damage",
        "spell_maximum_base_physical_damage",
        "spell_minimum_base_physical_damage",
        "spell_maximum_base_physical_damage"
      ],
      levels: [
        { level: 1, values: [100, 150, -80, -120] },
        { level: 20, values: [1337, 2005, -1069, -1604] }
      ],
      tooltipDescriptionIds: { spell_minimum_base_physical_damage: "damage" }
    };
    const data = {
      schemaVersion: 1, source: { game: "Path of Exile 1", format: "test" }, gems: [],
      statDescriptions: {
        damage: {
          stats: ["spell_minimum_base_physical_damage", "spell_maximum_base_physical_damage"],
          lines: [{ text: "Deals {0} to {1} Physical Damage" }]
        }
      }
    } satisfies GemDataPayload;

    expect(buildAbilityTooltipLines(ability, data, 20).map((line) => line.text)).toEqual([
      "Deals (20-268) to (30-401) Physical Damage"
    ]);
  });

  it("keeps normal gem text when its descriptor also contains a quality display flag", () => {
    const ability: GeneratedAbility = {
      role: "primary",
      id: "FlameSurge",
      name: "Flame Surge",
      valueStatIds: ["flame_whip_damage_+%_final_vs_burning_enemies"],
      flagStatIds: ["quality_display_flame_whip_is_gem"],
      levels: [
        { level: 1, values: [50] },
        { level: 20, values: [88] }
      ],
      tooltipDescriptionIds: {
        "flame_whip_damage_+%_final_vs_burning_enemies": "burning",
        quality_display_flame_whip_is_gem: "burning"
      }
    };
    const data = {
      schemaVersion: 1, source: { game: "Path of Exile 1", format: "test" }, gems: [],
      statDescriptions: {
        burning: {
          stats: ["flame_whip_damage_+%_final_vs_burning_enemies", "quality_display_flame_whip_is_gem"],
          lines: [
            { limit: [[1, "#"], [0, 0]], text: "{0:+d}% more Damage with Hits against Burning enemies" },
            { limit: [[1, "#"], ["#", "#"]], text: "{0}% more Damage with Hits against Burning enemies" }
          ]
        }
      }
    } satisfies GemDataPayload;

    expect(buildAbilityTooltipLines(ability, data, 20).map((line) => line.text)).toEqual([
      "(50-88)% more Damage with Hits against Burning enemies"
    ]);
  });
});
