import type { GlobalInputs, SkillModifier, SkillModifierType, SkillSettings, StorageState } from "../types/app";

const STORAGE_KEY = "poe1-skill-comparison:v2";

export const defaultGlobalInputs: GlobalInputs = {
  gemLevel: 21,
  projectileOverlapSupports: true,
  useCooldownForCalculations: true,
  critMode: "custom",
  critMultiplierPercent: 300,
  criticalChanceScalingPercent: 500
};

export const defaultSkillSettings: SkillSettings = {
  settingDescription: "",
  modifiers: []
};

export function readStorage(): StorageState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshStorage();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!isRecord(parsed) || parsed.version !== 2) return freshStorage();
    const savedGlobal = isRecord(parsed.global) ? parsed.global as Partial<GlobalInputs> : {};
    return {
      version: 2,
      global: {
        gemLevel: savedGlobal.gemLevel ?? defaultGlobalInputs.gemLevel,
        projectileOverlapSupports: typeof savedGlobal.projectileOverlapSupports === "boolean" ? savedGlobal.projectileOverlapSupports : defaultGlobalInputs.projectileOverlapSupports,
        useCooldownForCalculations: typeof savedGlobal.useCooldownForCalculations === "boolean" ? savedGlobal.useCooldownForCalculations : defaultGlobalInputs.useCooldownForCalculations,
        critMode: normalizeCritMode(savedGlobal.critMode),
        critMultiplierPercent: savedGlobal.critMultiplierPercent ?? defaultGlobalInputs.critMultiplierPercent,
        criticalChanceScalingPercent: savedGlobal.criticalChanceScalingPercent ?? defaultGlobalInputs.criticalChanceScalingPercent
      },
      skills: normalizeSkills(parsed.skills)
    };
  } catch {
    return freshStorage();
  }
}

export function writeStorage(value: StorageState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // The app remains usable when storage is unavailable or full.
  }
}

export function settingsFor(state: StorageState, key: string): SkillSettings {
  const saved = state.skills[key];
  return saved ? {
    settingDescription: saved.settingDescription,
    modifiers: [...saved.modifiers],
    ...(saved.profileModifierOverrides ? { profileModifierOverrides: { ...saved.profileModifierOverrides } } : {})
  } : freshSkillSettings();
}

export function freshStorage(): StorageState {
  return { version: 2, global: { ...defaultGlobalInputs }, skills: {} };
}

export function freshSkillSettings(): SkillSettings {
  return { ...defaultSkillSettings, modifiers: [] };
}

function normalizeCritMode(value: unknown): GlobalInputs["critMode"] {
  if (value === "off" || value === "base" || value === "custom") return value;
  return defaultGlobalInputs.critMode;
}

const modifierTypes = new Set<SkillModifierType>([
  "hit_count", "more_damage", "more_speed", "added_damage", "override_cast_time",
  "maximum_life", "maximum_energy_shield", "maximum_mana"
]);

function normalizeSkills(value: unknown): Record<string, SkillSettings> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, settings]) => [key, normalizeSkillSettings(settings)]));
}

function normalizeSkillSettings(value: unknown): SkillSettings {
  if (!isRecord(value) || !Array.isArray(value.modifiers)) return freshSkillSettings();
  const settingDescription = typeof value.settingDescription === "string" ? value.settingDescription.slice(0, 500) : "";
  const usedIds = new Set<string>();
  const modifiers = value.modifiers.flatMap((entry): SkillModifier[] => {
    if (!isRecord(entry)
      || typeof entry.id !== "string"
      || !entry.id
      || usedIds.has(entry.id)
      || !modifierTypes.has(entry.type as SkillModifierType)
      || typeof entry.value !== "number"
      || !Number.isFinite(entry.value)) return [];
    usedIds.add(entry.id);
    return [{ id: entry.id, type: entry.type as SkillModifierType, value: entry.value }];
  });
  const profileModifierOverrides = normalizeProfileOverrides(value.profileModifierOverrides);
  return { settingDescription, modifiers, ...(profileModifierOverrides ? { profileModifierOverrides } : {}) };
}

function normalizeProfileOverrides(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).flatMap(([id, raw]) => {
    return id && typeof raw === "number" && Number.isFinite(raw) ? [[id, raw] as const] : [];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
