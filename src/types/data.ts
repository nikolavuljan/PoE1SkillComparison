export type GemCategory = "spell" | "attack" | "support" | "other" | string;
export type DamageType = "physical" | "fire" | "cold" | "lightning" | "chaos";

export interface GemDataPayload {
  schemaVersion: number;
  source: {
    game: string;
    format: string;
    skillDamageBaseEffectiveness?: number;
    skillDamageIncrementalEffectiveness?: number;
  };
  filters?: {
    activeDamageOnly?: boolean;
    strategy?: string;
    requiredAllTags?: string[];
    requiredAnyTags?: string[];
    excludedTags?: string[];
  };
  gems: GeneratedGem[];
  statDescriptions: Record<string, StatDescription>;
}

export interface GeneratedGem {
  id: string;
  gameId: string;
  familyId: string;
  variantId?: string;
  grantedEffectId?: string;
  secondaryGrantedEffectId?: string;
  name: string;
  baseTypeName: string;
  category: GemCategory;
  tags: string[];
  tagString?: string;
  transfigured?: boolean;
  vaal?: boolean;
  naturalMaxLevel?: number;
  attributeRequirements?: {
    strengthWeight?: number;
    dexterityWeight?: number;
    intelligenceWeight?: number;
  };
  abilities: GeneratedAbility[];
  hasDirectDamage?: boolean;
  extra?: Record<string, unknown>;
}

export interface GeneratedAbility {
  role: "primary" | "secondary" | "additional" | string;
  id: string;
  name: string;
  baseTypeName?: string;
  sourceFile?: string;
  color?: number;
  description?: string;
  skillTypes?: string[];
  baseFlags?: string[];
  castTime?: number;
  baseCastsPerSecond?: number;
  parts?: AbilityPart[];
  levelScaling?: {
    baseEffectiveness?: number;
    incrementalEffectiveness?: number;
    formula?: string;
  };
  statDescriptionScope?: string;
  statIds?: string[];
  notMinionStatIds?: string[];
  constantStats?: Record<string, unknown>;
  customScaling?: CustomScaling[];
  quality?: QualityStat[];
  valueStatIds?: string[];
  flagStatIds?: string[];
  levels?: AbilityLevel[];
  tooltipDescriptionIds?: Record<string, string>;
  calculation?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

export interface AbilityPart {
  id: number;
  name: string;
  area?: boolean;
  [key: string]: unknown;
}

export interface CustomScaling {
  stat: string;
  damageType: DamageType;
  resource: "life" | "energy_shield" | "mana" | string;
  percent?: number;
  percentPerSecond?: number;
  kind?: string;
}

export interface QualityStat {
  stat: string;
  perQuality: number;
  tooltipDescriptionId?: string;
  extra?: unknown[];
}

export interface AbilityLevel {
  level: number;
  actorLevel?: number;
  levelRequirement?: number;
  sourceValues?: number[];
  values?: number[];
  statInterpolation?: number[];
  damage?: {
    ranges?: DamageRange[];
    damageOverTimePerSecond?: DotRange[];
    supplementalRanges?: DamageRange[];
    supplementalDamageOverTimePerSecond?: DotRange[];
  };
  addedDamageEffectiveness?: number;
  addedDamageEffectivenessPercent?: number;
  addedDamageEffectivenessSource?: "explicit" | "implicit-hit-default";
  criticalStrikeChance?: number;
  attack?: {
    attackSpeedPercentOfBase?: number;
    attackDamagePercentOfBase?: number;
  };
  cost?: Record<string, number>;
  metadata?: Record<string, unknown>;
}

export interface DamageRange {
  source: string;
  kind: "base" | "added" | string;
  type: DamageType;
  min?: number;
  max?: number;
  scope?: DamageScope;
  statIds?: string[];
  modifiers?: string[];
  skillParts?: number[];
}

export interface DotRange {
  stat: string;
  source: string;
  type: DamageType;
  value: number;
  scope?: DamageScope;
  modifiers?: string[];
  skillParts?: number[];
}

export type DamageScope = "baseline" | "global-effect" | "minion" | "player-stat" | "actor-condition" | "skill-part" | string;

export interface StatDescription {
  stats?: string[];
  lines?: StatDescriptionLine[];
  name?: string;
}

export interface StatDescriptionLine {
  text?: string;
  limit?: unknown;
  gem_quality?: boolean;
  [key: string]: unknown;
}
