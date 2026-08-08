import type { SkillModifier, SkillModifierType, SkillSettings } from "../types/app";

export interface ResolvedSkillModifiers {
  hits: number;
  moreDamageMultiplier: number;
  moreSpeedMultiplier: number;
  addedDamage: number;
  overrideCastTime: number | null;
  maximumLife: number;
  maximumEnergyShield: number;
  maximumMana: number;
}

export const replacementModifierTypes = new Set<SkillModifierType>([
  "hit_count",
  "override_cast_time",
  "maximum_life",
  "maximum_energy_shield",
  "maximum_mana"
]);

export function resolveSkillModifiers(settings: SkillSettings): ResolvedSkillModifiers {
  const resolved: ResolvedSkillModifiers = {
    hits: 1,
    moreDamageMultiplier: 1,
    moreSpeedMultiplier: 1,
    addedDamage: 0,
    overrideCastTime: null,
    maximumLife: 0,
    maximumEnergyShield: 0,
    maximumMana: 0
  };

  // Multipliers compose, flat additions accumulate, and assignment-style
  // modifiers naturally use the last entry in display order.
  for (const modifier of settings.modifiers) {
    const value = finiteValue(modifier.value);
    switch (modifier.type) {
      case "hit_count": resolved.hits = Math.max(0, value); break;
      case "more_damage": resolved.moreDamageMultiplier *= Math.max(0, 1 + value / 100); break;
      case "more_speed": resolved.moreSpeedMultiplier *= Math.max(0, 1 + value / 100); break;
      case "added_damage": resolved.addedDamage += Math.max(0, value); break;
      case "override_cast_time": resolved.overrideCastTime = Math.max(0.01, value); break;
      case "maximum_life": resolved.maximumLife = Math.max(0, value); break;
      case "maximum_energy_shield": resolved.maximumEnergyShield = Math.max(0, value); break;
      case "maximum_mana": resolved.maximumMana = Math.max(0, value); break;
    }
  }
  return resolved;
}

export function isSupersededModifier(modifiers: SkillModifier[], index: number): boolean {
  const modifier = modifiers[index];
  return replacementModifierTypes.has(modifier.type)
    && modifiers.slice(index + 1).some((entry) => entry.type === modifier.type);
}

function finiteValue(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
