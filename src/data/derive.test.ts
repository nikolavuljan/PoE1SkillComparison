import { describe, expect, it } from "vitest";
import { buildSkillViews, collectClickableTags, defaultFilters, matchesFilters, overviewTags } from "./derive";
import type { SkillView } from "../types/app";
import type { GemDataPayload } from "../types/data";

const view = {
  key: "fireball",
  gem: { id: "fireball", gameId: "Fireball", familyId: "Fireball", name: "Fireball", baseTypeName: "Fireball", category: "spell", tags: ["spell", "projectile"], abilities: [], hasDirectDamage: true },
  ability: { role: "primary", id: "Fireball", name: "Fireball", description: "A fiery projectile that explodes." },
  flags: ["Spell", "Projectile", "Area"],
  searchText: "fireball a fiery projectile that explodes spell projectile area"
} satisfies SkillView;

describe("skill filtering", () => {
  it("searches exported textual descriptions", () => {
    expect(matchesFilters(view, { ...defaultFilters, query: "explodes" })).toBe(true);
    expect(matchesFilters(view, { ...defaultFilters, query: "channel" })).toBe(false);
  });

  it("matches every selected gem tag", () => {
    expect(matchesFilters(view, { ...defaultFilters, selectedTags: ["spell", "projectile"] })).toBe(true);
    expect(matchesFilters(view, { ...defaultFilters, selectedTags: ["spell", "area"] })).toBe(false);
  });

  it("always removes records without direct damage", () => {
    expect(matchesFilters({ ...view, gem: { ...view.gem, hasDirectDamage: false } }, defaultFilters)).toBe(true);
  });

  it("only offers tags from damaging gems and excludes exporter plumbing", () => {
    const supportView = { ...view, key: "support", gem: { ...view.gem, tags: ["support", "fire"], hasDirectDamage: false } };
    expect(collectClickableTags([view, supportView])).toEqual(["projectile", "spell"]);
  });

  it("keeps generic tags out of the compact overview", () => {
    expect(overviewTags(["spell", "intelligence", "cold", "area", "grants_active_skill"]))
      .toEqual(["cold", "area"]);
  });

  it("indexes only the condition-selected radius description", () => {
    const ability = {
      role: "primary", id: "Discharge", name: "Discharge", description: "Discharges charges.",
      constantStats: { active_skill_base_area_of_effect_radius: 30 },
      tooltipDescriptionIds: { active_skill_base_area_of_effect_radius: "radius" }
    };
    const data: GemDataPayload = {
      schemaVersion: 1,
      source: { game: "Path of Exile 1", format: "test" },
      gems: [{
        id: "discharge", gameId: "Discharge", familyId: "Discharge", name: "Discharge", baseTypeName: "Discharge",
        category: "spell", tags: ["spell"], abilities: [ability], hasDirectDamage: true
      }],
      statDescriptions: { radius: {
        stats: ["active_skill_area_of_effect_description_mode", "active_skill_base_area_of_effect_radius", "active_skill_area_of_effect_radius"],
        lines: [
          { limit: [[0, 0], ["!", 0], [0, 0]], text: "Base radius is {1} metres" },
          { limit: [[10, 10], ["!", 0], [1, "#"]], text: "Barnacle Snap radius is {2} metres" }
        ]
      } },
    };

    const [discharge] = buildSkillViews(data);
    expect(discharge.searchText).toContain("base radius is 30 metres");
    expect(discharge.searchText).not.toContain("barnacle");
  });
});
