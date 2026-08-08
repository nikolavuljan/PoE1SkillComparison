import type { Filters, SkillView, Tab } from "../types/app";
import type { GemDataPayload, GeneratedAbility } from "../types/data";
import { buildAbilityTooltipLines } from "./tooltip";

export const defaultFilters: Filters = {
  query: "",
  tagQuery: "",
  selectedTags: []
};

export function buildSkillViews(data: GemDataPayload): SkillView[] {
  return data.gems.flatMap((gem) => {
    const ability = gem.abilities.find((entry) => entry.role === "primary") ?? gem.abilities[0];
    if (!ability) return [];
    const descriptorText = buildAbilityTooltipLines(ability, data, gem.naturalMaxLevel ?? 20)
      .map((line) => line.text);
    const flags = unique([
      ...gem.tags,
      ...(ability.skillTypes ?? []),
      ...(ability.baseFlags ?? []),
      ...(ability.valueStatIds ?? []),
      ...(ability.flagStatIds ?? []),
      ...Object.keys(ability.constantStats ?? {})
    ]);
    return [{
      key: gem.id,
      gem,
      ability,
      flags,
      searchText: [gem.name, ability.description, ...gem.tags, ...flags, ...descriptorText].filter(Boolean).join("\n").toLowerCase()
    }];
  });
}

export function viewsForTab(views: SkillView[], tab: Tab): SkillView[] {
  const category = tab === "spells" ? "spell" : "attack";
  return views.filter((view) => view.gem.category === category);
}

export function matchesFilters(view: SkillView, filters: Filters): boolean {
  if (filters.query.trim() && !view.searchText.includes(filters.query.trim().toLowerCase())) return false;
  if (filters.tagQuery.trim()) {
    const query = filters.tagQuery.trim().toLowerCase();
    if (!view.flags.some((flag) => flag.toLowerCase().includes(query))) return false;
  }
  if (filters.selectedTags.length && !filters.selectedTags.every((tag) => view.gem.tags.includes(tag))) return false;
  return true;
}

export function collectTagOptions(views: SkillView[]): string[] {
  return unique(views.flatMap((view) => view.flags)).sort((a, b) => a.localeCompare(b));
}

export function collectClickableTags(views: SkillView[]): string[] {
  const hidden = new Set(["grants_active_skill", "support"]);
  return unique(views.filter((view) => view.gem.hasDirectDamage).flatMap((view) => view.gem.tags))
    .filter((tag) => !hidden.has(tag))
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));
}

export function overviewTags(tags: string[]): string[] {
  const lowPriority = new Set(["grants_active_skill", "spell", "attack", "intelligence", "strength", "dexterity"]);
  return tags.filter((tag) => !lowPriority.has(tag));
}

export function displayName(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function primaryDescription(ability: GeneratedAbility): string {
  return ability.description ?? "No description was provided by Path of Building.";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
