import type { GlobalInputs, SkillResult, SkillSettings, SkillView } from "../types/app";
import type { AbilityLevel, CustomScaling, DamageRange, DamageType, GeneratedAbility } from "../types/data";
import { resolveSkillModifiers, type ResolvedSkillModifiers } from "./modifiers";
import { comparisonProfile, effectiveProfileModifiers } from "./profiles";

export function levelFor(ability: GeneratedAbility, requestedLevel: number): AbilityLevel | undefined {
  const levels = ability.levels ?? [];
  return levels.find((level) => level.level === requestedLevel)
    ?? [...levels].reverse().find((level) => level.level <= requestedLevel)
    ?? levels[0];
}

export function calculateSkill(
  view: SkillView,
  global: GlobalInputs,
  settings: SkillSettings
): SkillResult {
  const level = levelFor(view.ability, global.gemLevel);
  if (!level) return emptyResult(view, global.gemLevel, "No level data was exported for this ability.");

  const warnings: string[] = [];
  const profile = comparisonProfile(view, global.projectileOverlapSupports);
  const manualModifiers = resolveSkillModifiers(settings);
  const profileModifiers = profile ? effectiveProfileModifiers(profile, settings) : [];
  const modifiers = profile
    ? resolveSkillModifiers({ ...settings, modifiers: [...profileModifiers, ...settings.modifiers] })
    : manualModifiers;
  const ranges = level.damage?.ranges ?? [];
  const supplementalRanges = level.damage?.supplementalRanges ?? [];
  const supplementalDots = level.damage?.supplementalDamageOverTimePerSecond ?? [];
  const includedScopes = new Set(profile?.includedDamageScopes ?? []);
  const includedRanges = supplementalRanges.filter((range) => range.scope !== undefined && includedScopes.has(range.scope));
  const randomElement = view.ability.skillTypes?.includes("RandomElement") ?? false;
  const baseFlat = aggregateRanges(ranges, randomElement);
  const conditionalFlat = aggregateRanges(includedRanges, false);
  const flat = {
    min: baseFlat.min + conditionalFlat.min,
    max: baseFlat.max + conditionalFlat.max,
    types: unique([...baseFlat.types, ...conditionalFlat.types])
  };
  if (randomElement && ranges.length > 1) warnings.push("Random-element damage is averaged across the exported elemental ranges.");
  if (ranges.some((range) => range.source.includes(":per_") || range.source.includes(":vs_"))) {
    warnings.push("Conditional/per-unit flat damage is included once; use the override controls for specific settings.");
  }
  const excludedSupplemental = [
    ...supplementalRanges.filter((range) => range.scope === undefined || !includedScopes.has(range.scope)),
    ...supplementalDots
  ];
  if (excludedSupplemental.length) {
    const labels = unique(excludedSupplemental.map((entry) => supplementalScopeLabel(entry.scope))).join(", ");
    warnings.push(`Baseline excludes ${labels}; add the appropriate value in this skill's settings when needed.`);
  }

  const resource = resourceDamage(view.ability.customScaling ?? [], modifiers);
  const baseMin = flat.min + resource.hit;
  const baseMax = flat.max + resource.hit;
  const addedDamage = modifiers.addedDamage;
  const more = modifiers.moreDamageMultiplier;
  const minDamage = Math.max(0, (baseMin + addedDamage) * more);
  const maxDamage = Math.max(0, (baseMax + addedDamage) * more);
  const averageBeforeCrit = (minDamage + maxDamage) / 2;
  const critChance = effectiveCritChance(level.criticalStrikeChance ?? 0, global.critMode, global.criticalChanceScalingPercent);
  const averageHit = applyCrit(averageBeforeCrit, critChance, profile?.ignoreCriticalDamage ? "off" : global.critMode, global.critMultiplierPercent);
  const hits = modifiers.hits;
  const critEffectivenessMultiplier = global.critMode === "custom" && !profile?.ignoreCriticalDamage
    ? applyCrit(1, critChance, "custom", global.critMultiplierPercent)
    : 1;
  const averageDamageEffectivenessPercent = level.addedDamageEffectivenessPercent === undefined
    ? undefined
    : level.addedDamageEffectivenessPercent * more * hits * critEffectivenessMultiplier;
  const cooldown = numberValue(level.metadata?.cooldown);
  const storedUses = numberValue(level.metadata?.storedUses);
  const duration = skillEffectDurationSeconds(view.ability, level);
  // DoT is intentionally the raw exported baseline until ailments and
  // skill-specific DoT rules have their own calculation model.
  const dotDps = (level.damage?.damageOverTimePerSecond ?? []).reduce((sum, dot) => sum + dot.value, 0);

  if (view.gem.category === "attack") {
    const weaponDamagePercent = (level.attack?.attackDamagePercentOfBase ?? 0) * more;
    const attackSpeedPercent = Math.max(0, (level.attack?.attackSpeedPercentOfBase ?? 100) * modifiers.moreSpeedMultiplier);
    const attackTime = attackSpeedPercent > 0 ? 100 / attackSpeedPercent : undefined;
    return {
      level: level.level,
      minDamage,
      maxDamage,
      averageHit,
      hitCount: hits,
      hitDps: attackTime ? averageHit * hits / attackTime : 0,
      dotDps,
      critChance,
      cooldown,
      storedUses,
      duration,
      damageTypes: unique([...flat.types, ...resource.types]),
      damageEffectivenessPercent: level.addedDamageEffectivenessPercent,
      averageDamageEffectivenessPercent,
      averageDamageEffectivenessPerSecondPercent: attackTime && averageDamageEffectivenessPercent !== undefined
        ? averageDamageEffectivenessPercent / attackTime
        : undefined,
      weaponDamagePercent,
      attackSpeedPercent,
      attackTime,
      dpsPercent: attackTime ? weaponDamagePercent * hits / attackTime : undefined,
      cost: level.cost,
      warnings
    };
  }

  const castTime = adjustedCastTime(modifiers.overrideCastTime ?? view.ability.castTime, modifiers.moreSpeedMultiplier);
  const calculationInterval = spellCalculationInterval(castTime, cooldown, storedUses, global.useCooldownForCalculations, warnings);
  const hitDps = calculationInterval ? averageHit * hits / calculationInterval : 0;
  return {
    level: level.level,
    minDamage,
    maxDamage,
    averageHit,
    hitCount: hits,
    hitDps,
    dotDps,
    critChance,
    castTime,
    cooldown,
    storedUses,
    duration,
    damageTypes: unique([...flat.types, ...resource.types]),
    damageEffectivenessPercent: level.addedDamageEffectivenessPercent,
    averageDamageEffectivenessPercent,
    averageDamageEffectivenessPerSecondPercent: calculationInterval && averageDamageEffectivenessPercent !== undefined
      ? averageDamageEffectivenessPercent / calculationInterval
      : undefined,
    cost: level.cost,
    warnings
  };
}

function aggregateRanges(ranges: DamageRange[], randomElement: boolean): { min: number; max: number; types: DamageType[] } {
  const populated = ranges.filter((range) => (range.min ?? 0) !== 0 || (range.max ?? 0) !== 0);
  const divisor = randomElement && populated.length > 1 ? populated.length : 1;
  return {
    min: populated.reduce((sum, range) => sum + (range.min ?? 0), 0) / divisor,
    max: populated.reduce((sum, range) => sum + (range.max ?? 0), 0) / divisor,
    types: unique(populated.map((range) => range.type))
  };
}

function resourceDamage(scaling: CustomScaling[], modifiers: ResolvedSkillModifiers): { hit: number; types: DamageType[] } {
  let hit = 0;
  const types: DamageType[] = [];
  for (const entry of scaling) {
    const pool = entry.resource === "life"
      ? modifiers.maximumLife
      : entry.resource === "energy_shield"
        ? modifiers.maximumEnergyShield
        : entry.resource === "mana" ? modifiers.maximumMana : 0;
    if (entry.percent !== undefined) hit += pool * entry.percent / 100;
    types.push(entry.damageType);
  }
  return { hit, types: unique(types) };
}

function effectiveCritChance(base: number, mode: GlobalInputs["critMode"], scalingPercent: number): number {
  if (mode === "off") return 0;
  const chance = mode === "custom" ? base * Math.max(0, scalingPercent) / 100 : base;
  return Math.max(0, Math.min(100, chance));
}

function applyCrit(value: number, chance: number, mode: GlobalInputs["critMode"], multiplierPercent: number): number {
  if (mode === "off") return value;
  const multiplier = Math.max(1, multiplierPercent / 100);
  return value * (1 + chance / 100 * (multiplier - 1));
}

function adjustedCastTime(castTime: number | undefined, moreSpeedMultiplier: number): number | undefined {
  if (castTime === undefined || castTime <= 0) return undefined;
  return moreSpeedMultiplier > 0 ? castTime / moreSpeedMultiplier : undefined;
}

function spellCalculationInterval(
  castTime: number | undefined,
  cooldown: number | undefined,
  storedUses: number | undefined,
  enabled: boolean,
  warnings: string[]
): number | undefined {
  if (!enabled || cooldown === undefined || !Number.isFinite(cooldown) || cooldown <= 0) return castTime;
  const uses = storedUses !== undefined && Number.isFinite(storedUses) ? Math.max(1, Math.floor(storedUses)) : 1;
  const cooldownPerUse = cooldown / uses;
  const interval = castTime === undefined ? cooldownPerUse : Math.max(castTime, cooldownPerUse);
  warnings.push(`Cooldown calculation uses ${plainSeconds(cooldown)} ÷ ${uses} ${uses === 1 ? "use" : "uses"} = ${plainSeconds(cooldownPerUse)} per use${castTime !== undefined && castTime > cooldownPerUse ? "; cast time remains the limiting interval" : ""}.`);
  return interval;
}

function plainSeconds(value: number): string {
  return `${value.toFixed(5).replace(/\.?0+$/, "")} sec`;
}

const skillEffectDurationStats = [
  "base_skill_effect_duration",
  "base_secondary_skill_effect_duration",
  "base_tertiary_skill_effect_duration"
] as const;

function skillEffectDurationSeconds(ability: GeneratedAbility, level: AbilityLevel): number | undefined {
  for (const stat of skillEffectDurationStats) {
    const constant = ability.constantStats?.[stat];
    if (typeof constant === "number" && Number.isFinite(constant) && constant > 0) return constant / 1000;

    const index = ability.valueStatIds?.indexOf(stat) ?? -1;
    const levelValue = index >= 0 ? level.values?.[index] : undefined;
    if (typeof levelValue === "number" && Number.isFinite(levelValue) && levelValue > 0) return levelValue / 1000;
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function supplementalScopeLabel(scope: string | undefined): string {
  switch (scope) {
    case "actor-condition": return "enemy-conditional damage";
    case "global-effect": return "buff or aura damage";
    case "minion": return "minion damage";
    case "player-stat": return "player-stat-scaled damage";
    case "skill-part": return "non-default skill-part damage";
    default: return "conditional damage";
  }
}

function emptyResult(view: SkillView, level: number, warning: string): SkillResult {
  return {
    level,
    minDamage: 0,
    maxDamage: 0,
    averageHit: 0,
    hitCount: 1,
    hitDps: 0,
    dotDps: 0,
    critChance: 0,
    damageTypes: [],
    warnings: [warning]
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
