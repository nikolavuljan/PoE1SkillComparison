import type { AbilityLevel, GeneratedAbility, GemDataPayload, QualityStat, StatDescription, StatDescriptionLine } from "../types/data";

const HIDDEN_DESCRIPTION_STATS = new Set([
  "base_is_projectile",
  "is_area_damage",
  "base_skill_show_average_damage_instead_of_dps",
  "can_perform_skill_while_moving",
  "display_statset_hide_usage_stats"
]);

export interface TooltipStatLine {
  key: string;
  text: string;
}

export function buildAbilityTooltipLines(ability: GeneratedAbility, data: GemDataPayload, requestedLevel: number): TooltipStatLine[] {
  const lines: TooltipStatLine[] = [];
  const seenDescriptions = new Set<string>();
  const seenText = new Set<string>();

  for (const descriptionId of Object.values(ability.tooltipDescriptionIds ?? {})) {
    if (seenDescriptions.has(descriptionId)) continue;
    seenDescriptions.add(descriptionId);
    const description = data.statDescriptions[descriptionId];
    if (!description || shouldSkip(description)) continue;
    const rendered = renderDescription(ability, description, requestedLevel);
    if (!rendered || seenText.has(rendered)) continue;
    seenText.add(rendered);
    lines.push({ key: `${descriptionId}:${rendered}`, text: rendered });
  }

  return lines;
}

export function buildQualityTooltipLines(ability: GeneratedAbility, data: GemDataPayload, qualityPercent = 20): TooltipStatLine[] {
  const groups = new Map<string, QualityStat[]>();
  const unresolved: QualityStat[] = [];
  for (const quality of ability.quality ?? []) {
    if (!quality.tooltipDescriptionId || !data.statDescriptions[quality.tooltipDescriptionId]) {
      unresolved.push(quality);
      continue;
    }
    const group = groups.get(quality.tooltipDescriptionId) ?? [];
    group.push(quality);
    groups.set(quality.tooltipDescriptionId, group);
  }

  const lines: TooltipStatLine[] = [];
  for (const [descriptionId, qualityStats] of groups) {
    const description = data.statDescriptions[descriptionId];
    const values = (description.stats ?? []).map((stat) => qualityStats
      .filter((quality) => quality.stat === stat)
      .reduce((sum, quality) => sum + quality.perQuality * qualityPercent, 0));
    const rendered = renderDescriptionValues(description, values, false);
    if (rendered) lines.push({ key: `quality:${descriptionId}:${rendered}`, text: rendered });
    else unresolved.push(...qualityStats);
  }

  for (const quality of unresolved) {
    lines.push({
      key: `quality:${quality.stat}`,
      text: `${readableStatName(quality.stat)}: ${plain(quality.perQuality * qualityPercent)}`
    });
  }
  return lines;
}

function renderDescription(ability: GeneratedAbility, description: StatDescription, requestedLevel: number): string | null {
  const stats = description.stats ?? [];
  const values = stats.map((stat) => statValue(ability, stat, requestedLevel));
  if (!values.some((value) => value !== undefined && !isZero(value))) return null;
  return renderDescriptionValues(description, values, true);
}

function renderDescriptionValues(
  description: StatDescription,
  values: Array<number | [number, number] | undefined>,
  excludeQualityLines: boolean
): string | null {
  const candidates = (description.lines ?? []).filter((line) => !excludeQualityLines || !line.gem_quality);
  const line = candidates.find((entry) => lineMatchesLimits(entry, values));
  if (!line?.text) return null;
  return fillTemplate(line.text, values.map((value, index) => formatStatValue(value, line, index)));
}

function statValue(ability: GeneratedAbility, stat: string, requestedLevel: number): number | [number, number] | undefined {
  const constant = sumNumbers(ability.constantStats?.[stat]);
  const indexes = matchingIndexes(ability.valueStatIds ?? [], stat);
  if (indexes.length) {
    const selected = selectedLevel(ability.levels ?? [], requestedLevel);
    const first = firstPopulatedLevel(ability.levels ?? [], indexes);
    const currentValue = sumIndexes(selected?.values, indexes);
    const firstValue = sumIndexes(first?.values, indexes);
    const current = (currentValue ?? 0) + (constant ?? 0);
    const initial = (firstValue ?? currentValue ?? 0) + (constant ?? 0);
    return initial !== current ? [initial, current] : current;
  }
  if (constant !== undefined) return constant;
  if (ability.flagStatIds?.includes(stat) || ability.baseFlags?.includes(stat)) return 1;
  return undefined;
}

function sumIndexes(values: number[] | undefined, indexes: number[]): number | undefined {
  const populated = indexes.map((index) => numeric(values?.[index])).filter((value): value is number => value !== undefined);
  return populated.length ? populated.reduce((sum, value) => sum + value, 0) : undefined;
}

function selectedLevel(levels: AbilityLevel[], requested: number): AbilityLevel | undefined {
  return levels.find((level) => level.level === requested)
    ?? [...levels].reverse().find((level) => level.level <= requested)
    ?? levels[0];
}

function firstPopulatedLevel(levels: AbilityLevel[], indexes: number[]): AbilityLevel | undefined {
  return levels.find((level) => indexes.some((index) => numeric(level.values?.[index]) !== undefined));
}

function shouldSkip(description: StatDescription): boolean {
  const stats = description.stats ?? [];
  if (stats.length && stats.every((stat) => HIDDEN_DESCRIPTION_STATS.has(stat) || stat.startsWith("quality_display_"))) return true;
  const lines = description.lines ?? [];
  return Boolean(lines.length && lines.every((line) => line.gem_quality));
}

function lineMatchesLimits(line: StatDescriptionLine, values: Array<number | [number, number] | undefined>): boolean {
  const limits = Array.isArray(line.limit) ? line.limit : [];
  if (!limits.length) return true;
  return limits.every((rawLimit, index) => {
    if (!Array.isArray(rawLimit)) return true;
    const [min, max] = rawLimit;
    if (min === "#" && max === "#") return true;
    const value = currentValue(values[index]) ?? 0;
    if (min === "!") return value !== max;
    if (typeof min === "number" && value < min) return false;
    if (typeof max === "number" && value > max) return false;
    return true;
  });
}

function fillTemplate(template: string, values: string[]): string {
  return template.replace(/\{(\d+)(?::[^}]+)?\}/g, (_match, index: string) => values[Number(index)] ?? "-");
}

function formatStatValue(value: number | [number, number] | undefined, line: StatDescriptionLine, index: number): string {
  const transformed = transformValue(value, transformFor(line, index));
  if (Array.isArray(transformed)) {
    const [first, current] = transformed;
    if (first !== current) return signedRange(first, current, line.text ?? "");
    return signedNumber(current, line.text ?? "");
  }
  return transformed === undefined ? "-" : signedNumber(transformed, line.text ?? "");
}

function transformValue(value: number | [number, number] | undefined, transform: unknown): number | [number, number] | undefined {
  const apply = (entry: number) => applyTransform(entry, transform);
  if (Array.isArray(value)) return [apply(value[0]), apply(value[1])];
  return value === undefined ? undefined : apply(value);
}

function applyTransform(value: number, transform: unknown): number {
  if (!transform || typeof transform !== "object" || !("k" in transform)) return value;
  const key = String((transform as { k: unknown }).k);
  if (key.startsWith("milliseconds_to_seconds")) return value / 1000;
  if (key.startsWith("divide_by_ten")) return value / 10;
  if (key.startsWith("locations_to_metres")) return value / 10;
  if (key.startsWith("per_minute_to_per_second")) return value / 60;
  if (key === "divide_by_one_hundred_and_negate") return -value / 100;
  if (key.startsWith("divide_by_one_hundred")) return value / 100;
  if (key === "multiplicative_damage_modifier") return value + 100;
  if (key === "invert_chance") return 100 - value;
  if (key === "negate") return -value;
  return value;
}

function transformFor(line: StatDescriptionLine, index: number): unknown {
  const handlers = Object.entries(line)
    .filter(([key]) => /^\d+$/.test(key))
    .map(([, value]) => value)
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object");
  return handlers.find((handler) => handler.v === index + 1 && typeof handler.k === "string")
    ?? line[String(index + 1)];
}

function signedRange(first: number, current: number, template: string): string {
  const prefix = template.includes(":+d") && first >= 0 && current >= 0 ? "+" : "";
  return `${prefix}(${plain(first)}-${plain(current)})`;
}

function signedNumber(value: number, template: string): string {
  const prefix = template.includes(":+d") && value >= 0 ? "+" : "";
  return `${prefix}${plain(value)}`;
}

function plain(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function sumNumbers(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!Array.isArray(value)) return undefined;
  const values = value.flat(Infinity).filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry));
  return values.length ? values.reduce((sum, entry) => sum + entry, 0) : undefined;
}

function matchingIndexes(values: string[], stat: string): number[] {
  const indexes: number[] = [];
  values.forEach((value, index) => { if (value === stat) indexes.push(index); });
  return indexes;
}

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function currentValue(value: number | [number, number] | undefined): number | undefined {
  return Array.isArray(value) ? value[1] : value;
}

function isZero(value: number | [number, number]): boolean {
  return Array.isArray(value) ? value[0] === 0 && value[1] === 0 : value === 0;
}

function readableStatName(stat: string): string {
  return stat
    .replace(/_\+%_final/g, " more")
    .replace(/_\+%/g, " increased")
    .replace(/_%/g, " percent")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
