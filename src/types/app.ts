import type { DamageType, GeneratedAbility, GeneratedGem } from "./data";

export type Tab = "spells" | "attacks";
export type CritMode = "off" | "base" | "custom";

export interface SkillView {
  key: string;
  gem: GeneratedGem;
  ability: GeneratedAbility;
  searchText: string;
  flags: string[];
}

export interface GlobalInputs {
  gemLevel: number;
  projectileOverlapSupports: boolean;
  useCooldownForCalculations: boolean;
  critMode: CritMode;
  critMultiplierPercent: number;
  criticalChanceScalingPercent: number;
}

export type SkillModifierType =
  | "hit_count"
  | "more_damage"
  | "more_speed"
  | "added_damage"
  | "override_cast_time"
  | "maximum_life"
  | "maximum_energy_shield"
  | "maximum_mana";

export interface SkillModifier {
  id: string;
  type: SkillModifierType;
  value: number;
}

export interface SkillSettings {
  settingDescription: string;
  modifiers: SkillModifier[];
  profileModifierOverrides?: Record<string, number>;
}

export interface StorageState {
  version: 2;
  global: GlobalInputs;
  skills: Record<string, SkillSettings>;
}

export interface Filters {
  query: string;
  tagQuery: string;
  selectedTags: string[];
}

export interface SkillResult {
  minDamage: number;
  maxDamage: number;
  averageHit: number;
  hitCount: number;
  hitDps: number;
  dotDps: number;
  critChance: number;
  castTime?: number;
  cooldown?: number;
  storedUses?: number;
  duration?: number;
  damageTypes: DamageType[];
  damageEffectivenessPercent?: number;
  weaponDamagePercent?: number;
  attackSpeedPercent?: number;
  attackTime?: number;
  dpsPercent?: number;
  cost?: Record<string, number>;
  level: number;
  warnings: string[];
  averageDamageEffectivenessPercent?: number;
  averageDamageEffectivenessPerSecondPercent?: number;
}
