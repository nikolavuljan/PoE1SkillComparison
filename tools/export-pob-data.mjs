#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const RAW = "__raw";
const DEFAULT_POB = "../Path of Building Community/Data";
const DEFAULT_OUT = "data/generated";
const SKILL_FILES = [
  "Skills/act_int.lua",
  "Skills/act_str.lua",
  "Skills/act_dex.lua",
  "Skills/other.lua",
  "Skills/minion.lua",
  "Skills/spectre.lua",
  "Skills/glove.lua",
  "Skills/sup_int.lua",
  "Skills/sup_str.lua",
  "Skills/sup_dex.lua"
];
const DAMAGE_TYPES = "physical|fire|cold|lightning|chaos";

function parseArgs(argv) {
  const args = { pob: DEFAULT_POB, out: DEFAULT_OUT, pretty: false, activeDamageOnly: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--pob") args.pob = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--pretty") args.pretty = true;
    else if (arg === "--active-damage-only" || arg === "--damage-skills-only") args.activeDamageOnly = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node tools/export-pob-data.mjs [options]\n\nOptions:\n  --pob <dir>             PoB Data directory (default: ${DEFAULT_POB})\n  --out <dir>             Output directory (default: ${DEFAULT_OUT})\n  --pretty                Pretty-print gem-data.json\n  --active-damage-only    Keep active attack/spell gems, excluding support, mark, and pact tags\n`);
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

class LuaParser {
  constructor(text, file) {
    this.text = text;
    this.file = file;
    this.i = 0;
  }

  eof() { return this.i >= this.text.length; }
  peek(offset = 0) { return this.text[this.i + offset]; }
  startsWith(value) { return this.text.startsWith(value, this.i); }

  skipTrivia() {
    while (!this.eof()) {
      if (/\s/.test(this.peek())) { this.i += 1; continue; }
      if (this.startsWith("--[[")) {
        const end = this.text.indexOf("]]", this.i + 4);
        this.i = end < 0 ? this.text.length : end + 2;
        continue;
      }
      if (this.startsWith("--")) {
        const end = this.text.indexOf("\n", this.i + 2);
        this.i = end < 0 ? this.text.length : end + 1;
        continue;
      }
      break;
    }
  }

  error(message) {
    const line = this.text.slice(0, this.i).split(/\r?\n/).length;
    throw new Error(`${this.file}:${line}: ${message}`);
  }

  consume(value) {
    this.skipTrivia();
    if (!this.startsWith(value)) this.error(`Expected ${JSON.stringify(value)}`);
    this.i += value.length;
  }

  identifier() {
    this.skipTrivia();
    const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.text.slice(this.i));
    if (!match) return null;
    this.i += match[0].length;
    return match[0];
  }

  dottedIdentifier() {
    const start = this.i;
    if (!this.identifier()) { this.i = start; return null; }
    while (this.peek() === "." || this.peek() === ":") {
      this.i += 1;
      if (!this.identifier()) this.error("Expected dotted identifier");
    }
    return this.text.slice(start, this.i);
  }

  string() {
    this.skipTrivia();
    const quote = this.peek();
    if (quote !== "\"" && quote !== "'") this.error("Expected string");
    this.i += 1;
    let out = "";
    while (!this.eof()) {
      const ch = this.peek();
      this.i += 1;
      if (ch === quote) return out;
      if (ch === "\\") {
        const next = this.peek();
        this.i += 1;
        out += ({ n: "\n", r: "\r", t: "\t", "\"": "\"", "'": "'", "\\": "\\" })[next] ?? next;
      } else out += ch;
    }
    this.error("Unterminated string");
  }

  number() {
    this.skipTrivia();
    const match = /^[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?/.exec(this.text.slice(this.i));
    if (!match) return null;
    this.i += match[0].length;
    return Number(match[0]);
  }

  bracketKey() {
    this.consume("[");
    this.skipTrivia();
    let key;
    if (this.peek() === "\"" || this.peek() === "'") key = this.string();
    else {
      const start = this.i;
      let depth = 1;
      while (!this.eof() && depth) {
        const ch = this.peek();
        if (ch === "\"" || ch === "'") { this.string(); continue; }
        if (ch === "[") depth += 1;
        if (ch === "]") depth -= 1;
        if (depth) this.i += 1;
      }
      key = this.text.slice(start, this.i).trim();
    }
    this.consume("]");
    return key;
  }

  rawBalanced(open, close) {
    this.skipTrivia();
    const start = this.i;
    let depth = 0;
    while (!this.eof()) {
      if (this.startsWith("--")) { this.skipTrivia(); continue; }
      const ch = this.peek();
      if (ch === "\"" || ch === "'") { this.string(); continue; }
      if (ch === open) depth += 1;
      if (ch === close) depth -= 1;
      this.i += 1;
      if (depth === 0) return this.text.slice(start, this.i).trim();
    }
    this.error(`Unterminated ${open}${close}`);
  }

  rawExpression(start) {
    this.i = start;
    let parens = 0;
    let braces = 0;
    while (!this.eof()) {
      if (this.startsWith("--")) break;
      const ch = this.peek();
      if (ch === "\"" || ch === "'") { this.string(); continue; }
      if (ch === "(") parens += 1;
      if (ch === ")") parens -= 1;
      if (ch === "{") braces += 1;
      if (ch === "}") { if (!parens && !braces) break; braces -= 1; }
      if ((ch === "," || ch === ";") && !parens && !braces) break;
      this.i += 1;
    }
    return { [RAW]: this.text.slice(start, this.i).trim() };
  }

  rawFunction() {
    this.skipTrivia();
    const start = this.i;
    const word = /[A-Za-z_][A-Za-z0-9_]*/y;
    let depth = 0;
    while (!this.eof()) {
      if (this.startsWith("--[[")) { this.skipTrivia(); continue; }
      if (this.startsWith("--")) { this.skipTrivia(); continue; }
      if (this.peek() === "\"" || this.peek() === "'") { this.string(); continue; }
      word.lastIndex = this.i;
      const match = word.exec(this.text);
      if (match) {
        if (["function", "if", "for", "while", "repeat"].includes(match[0])) depth += 1;
        else if (match[0] === "end" || match[0] === "until") depth -= 1;
        this.i = word.lastIndex;
        if (depth === 0) return { [RAW]: this.text.slice(start, this.i).trim() };
      } else this.i += 1;
    }
    this.error("Unterminated function");
  }

  value() {
    this.skipTrivia();
    if (this.peek() === "{") return this.table();
    if (this.peek() === "\"" || this.peek() === "'") return this.string();
    const start = this.i;
    const number = this.number();
    if (number !== null) {
      this.skipTrivia();
      return [",", ";", "}"].includes(this.peek()) ? number : this.rawExpression(start);
    }
    const ident = this.dottedIdentifier();
    if (!ident) this.error(`Unexpected value near ${JSON.stringify(this.text.slice(this.i, this.i + 20))}`);
    if (ident === "true") return true;
    if (ident === "false") return false;
    if (ident === "nil") return null;
    this.skipTrivia();
    if (ident === "function") { this.i = start; return this.rawFunction(); }
    if (this.peek() === "(") this.rawBalanced("(", ")");
    this.skipTrivia();
    return [",", ";", "}"].includes(this.peek()) ? { [RAW]: this.text.slice(start, this.i).trim() } : this.rawExpression(start);
  }

  table() {
    this.consume("{");
    const entries = [];
    let arrayIndex = 1;
    while (!this.eof()) {
      this.skipTrivia();
      if (this.peek() === "}") { this.i += 1; return tableFromEntries(entries); }
      let key;
      let value;
      if (this.peek() === "[") {
        key = this.bracketKey();
        this.consume("=");
        value = this.value();
      } else {
        const start = this.i;
        const ident = this.identifier();
        this.skipTrivia();
        if (ident && this.peek() === "=") {
          this.i += 1;
          key = ident;
          value = this.value();
        } else {
          this.i = start;
          key = arrayIndex++;
          value = this.value();
        }
      }
      entries.push([key, value]);
      this.skipTrivia();
      if (this.peek() === "," || this.peek() === ";") this.i += 1;
    }
    this.error("Unterminated table");
  }
}

function tableFromEntries(entries) {
  if (!entries.length) return [];
  const numeric = entries.every(([key]) => /^\d+$/.test(String(key)));
  if (numeric) {
    const pairs = entries.map(([key, value]) => [Number(key), value]).sort((a, b) => a[0] - b[0]);
    if (pairs.every(([key], index) => key === index + 1)) return pairs.map(([, value]) => value);
  }
  return Object.fromEntries(entries.map(([key, value]) => [String(key), value]));
}

function parseReturnTable(text, file) {
  const index = text.indexOf("return");
  if (index < 0) throw new Error(`${file}: no return value`);
  const parser = new LuaParser(text, file);
  parser.i = index + 6;
  return parser.value();
}

function parseSkillAssignments(text, file) {
  const parser = new LuaParser(text, file);
  const out = [];
  while (!parser.eof()) {
    const next = text.indexOf("skills[", parser.i);
    if (next < 0) break;
    parser.i = next + 6;
    const id = parser.bracketKey();
    parser.consume("=");
    out.push({ id, value: parser.value() });
  }
  return out;
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.entries(value)
    .filter(([key]) => /^\d+$/.test(key))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, item]) => item);
  return [];
}

function positionalArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== "object") return [];
  const numericKeys = Object.keys(value).filter((key) => /^\d+$/.test(key)).map(Number);
  const length = numericKeys.length ? Math.max(...numericKeys) : 0;
  return Array.from({ length }, (_, index) => value[String(index + 1)]);
}

function trueKeys(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).filter(([, enabled]) => enabled === true).map(([key]) => key.startsWith(prefix) ? key.slice(prefix.length) : key);
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => {
    if (item === undefined || item === null) return false;
    if (Array.isArray(item)) return item.length > 0;
    if (typeof item === "object") return Object.keys(item).length > 0;
    return true;
  }));
}

function levelEntries(levels) {
  if (!levels || typeof levels !== "object") return [];
  if (Array.isArray(levels)) return levels.map((row, index) => [index + 1, row]);
  return Object.entries(levels).map(([level, row]) => [Number(level), row]).filter(([level]) => Number.isFinite(level)).sort((a, b) => a[0] - b[0]);
}

function parseGameConstants(text) {
  const block = /data\.gameConstants\s*=\s*\{([\s\S]*?)\n\}/.exec(text)?.[1] ?? "";
  const out = {};
  for (const match of block.matchAll(/\["([^"]+)"\]\s*=\s*([-+\d.eE]+)/g)) out[match[1]] = Number(match[2]);
  return out;
}

function luaRound(value) {
  return value < 0 ? Math.ceil(value - 0.5) : Math.floor(value + 0.5);
}

function roundTo(value, places = 6) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function constantRows(value) {
  return asArray(value).filter((row) => Array.isArray(row) && typeof row[0] === "string");
}

function constantsByStat(rows) {
  const out = {};
  for (const [stat, ...values] of rows) {
    const value = values.length === 1 ? values[0] : values;
    if (out[stat] === undefined) out[stat] = value;
    else out[stat] = Array.isArray(out[stat]) ? [...out[stat], value] : [out[stat], value];
  }
  return out;
}

function availableEffectiveness(skill, actorLevel, gameConstants) {
  const base = gameConstants.SkillDamageBaseEffectiveness;
  const incremental = gameConstants.SkillDamageIncrementalEffectiveness;
  if (!Number.isFinite(base) || !Number.isFinite(incremental)) return null;
  return (base + incremental * (actorLevel - 1))
    * (skill.baseEffectiveness ?? 1)
    * (1 + (skill.incrementalEffectiveness ?? 0)) ** (actorLevel - 1);
}

function rawExpressions(value, out = []) {
  if (!value || typeof value !== "object") return out;
  if (typeof value[RAW] === "string") out.push(value[RAW]);
  for (const [key, entry] of Object.entries(value)) if (key !== RAW) rawExpressions(entry, out);
  return out;
}

function mappingForStat(stat, skillStatMap, commonStatMap) {
  if (skillStatMap && Object.prototype.hasOwnProperty.call(skillStatMap, stat)) return skillStatMap[stat];
  return commonStatMap?.[stat];
}

function damageSemantics(stat, skillStatMap, commonStatMap) {
  const raw = rawExpressions(mappingForStat(stat, skillStatMap, commonStatMap)).join("\n");
  const modifiers = [...new Set([...raw.matchAll(/type\s*=\s*"([^"]+)"/g)].map((match) => match[1]))];
  const outputs = [...new Map([...raw.matchAll(/"(Physical|Fire|Cold|Lightning|Chaos)(Min|Max|Dot)"/g)]
    .map((match) => {
      const output = { type: match[1].toLowerCase(), output: match[2].toLowerCase() };
      return [`${output.type}|${output.output}`, output];
    })).values()];
  const skillParts = [...raw.matchAll(/skillPart\s*=\s*(\d+)/g)].map((match) => Number(match[1]));
  for (const match of raw.matchAll(/skillPartList\s*=\s*\{([^}]*)\}/g)) {
    for (const value of match[1].matchAll(/\d+/g)) skillParts.push(Number(value[0]));
  }

  let scope = "baseline";
  if (raw.includes('"MinionModifier"')) scope = "minion";
  else if (modifiers.includes("GlobalEffect")) scope = "global-effect";
  else if (modifiers.includes("PerStat") || modifiers.includes("PercentStat")) scope = "player-stat";
  else if (modifiers.includes("ActorCondition")) scope = "actor-condition";
  else if (modifiers.includes("SkillPart") && skillParts.length && !skillParts.includes(1)) scope = "skill-part";

  return compactObject({ scope, modifiers, skillParts: [...new Set(skillParts)], outputs });
}

function aggregateStatEntries(entries) {
  const totals = new Map();
  for (const [stat, value] of entries) {
    if (typeof stat !== "string" || typeof value !== "number" || !Number.isFinite(value)) continue;
    totals.set(stat, (totals.get(stat) ?? 0) + value);
  }
  return [...totals.entries()];
}

function mergeDamageRange(map, key, descriptor, value, stat, semantics) {
  const entry = map.get(key) ?? {
    source: descriptor.source,
    kind: descriptor.kind,
    type: descriptor.type,
    scope: semantics.scope,
    statIds: [],
    modifiers: [],
    skillParts: []
  };
  const bound = descriptor.bound;
  entry[bound] = (entry[bound] ?? 0) + value;
  entry.statIds ??= [];
  entry.modifiers ??= [];
  entry.skillParts ??= [];
  entry.statIds.push(stat);
  entry.modifiers.push(...(semantics.modifiers ?? []));
  entry.skillParts.push(...(semantics.skillParts ?? []));
  entry.statIds = [...new Set(entry.statIds)];
  entry.modifiers = [...new Set(entry.modifiers)];
  entry.skillParts = [...new Set(entry.skillParts)];
  map.set(key, compactObject(entry));
}

function rangeDescriptor(stat, semantics) {
  const rangePattern = new RegExp(`^(.*?)(minimum|maximum)_(base|added)_(${DAMAGE_TYPES})_damage(?:_(.+))?$`);
  const match = rangePattern.exec(stat);
  if (match) {
    const baseSource = match[1].replace(/_$/, "") || "generic";
    return {
      source: match[5] ? `${baseSource}:${match[5]}` : baseSource,
      kind: match[3],
      type: match[4],
      bound: match[2] === "minimum" ? "min" : "max",
      group: `${baseSource}|${match[5] ?? ""}|${match[3]}|${match[4]}`
    };
  }

  // Some skill-specific stats (for example Explosive Concoction flask damage)
  // do not use PoE's usual "base"/"added" naming. PoB's stat map is the
  // authoritative fallback for identifying their damage output.
  const mapped = (semantics.outputs ?? []).filter((output) => output.output === "min" || output.output === "max");
  if (mapped.length !== 1) return null;
  const output = mapped[0];
  const boundWord = output.output === "min" ? "minimum" : "maximum";
  const group = stat.replace(new RegExp(`(^|_)${boundWord}(?=_|$)`), "$1amount");
  return {
    source: group,
    kind: stat.includes("_base_") ? "base" : stat.includes("_added_") ? "added" : "mapped",
    type: output.type,
    bound: output.output,
    group: `${group}|${output.type}`
  };
}

function damageSummary(statEntries, skillStatMap, commonStatMap) {
  const ranges = new Map();
  const supplementalRanges = new Map();
  const dotPerSecond = [];
  const supplementalDotPerSecond = [];
  const dotPattern = new RegExp(`^(.*?)(${DAMAGE_TYPES})_damage_to_deal_per_minute(?:$|_)`);
  for (const [stat, value] of aggregateStatEntries(statEntries)) {
    const semantics = damageSemantics(stat, skillStatMap, commonStatMap);
    const descriptor = rangeDescriptor(stat, semantics);
    if (descriptor) {
      const target = semantics.scope === "baseline" ? ranges : supplementalRanges;
      mergeDamageRange(target, `${semantics.scope}|${descriptor.group}`, descriptor, value, stat, semantics);
      continue;
    }
    const match = dotPattern.exec(stat);
    if (match) {
      const metadata = semantics.scope === "baseline" ? {} : {
        scope: semantics.scope,
        modifiers: semantics.modifiers,
        skillParts: semantics.skillParts
      };
      const entry = compactObject({
        stat,
        source: match[1].replace(/_$/, "") || "base",
        type: match[2],
        value: value / 60,
        ...metadata
      });
      (semantics.scope === "baseline" ? dotPerSecond : supplementalDotPerSecond).push(entry);
    }
  }
  const baselineRanges = [...ranges.values()].map(({ scope: _scope, statIds: _statIds, modifiers: _modifiers, skillParts: _skillParts, ...range }) => range);
  return compactObject({
    ranges: baselineRanges,
    damageOverTimePerSecond: dotPerSecond,
    supplementalRanges: [...supplementalRanges.values()],
    supplementalDamageOverTimePerSecond: supplementalDotPerSecond
  });
}

function customScaling(constants) {
  const out = [];
  const pattern = new RegExp(`(?:^|_)base_(${DAMAGE_TYPES})_damage_%_maximum_(life|energy_shield|mana)$`);
  for (const [stat, value] of Object.entries(constants)) {
    const match = pattern.exec(stat);
    if (match && typeof value === "number") {
      out.push({ stat, damageType: match[1], resource: match[2], percent: value });
      continue;
    }
    const righteousFire = /^base_righteous_fire_%_of_max_(life|energy_shield)_to_deal_to_nearby_per_minute$/.exec(stat);
    if (righteousFire && typeof value === "number") {
      out.push({ stat, damageType: "fire", resource: righteousFire[1], percentPerSecond: value / 60 });
      continue;
    }
    const addedFromPool = new RegExp(`^(?:skill_has_)?added_(${DAMAGE_TYPES})_damage(?:_to_attacks)?_equal_to_%_(?:of_)?max(?:imum)?_(life|energy_shield|mana)$`).exec(stat);
    if (addedFromPool && typeof value === "number") {
      out.push({ stat, damageType: addedFromPool[1], resource: addedFromPool[2], percent: value, kind: "addedDamage" });
    }
  }
  return out;
}

function normalizeLevels(skill, stats, constantStats, gameConstants, commonStatMap) {
  const sourceRows = levelEntries(skill.levels);
  const valueCount = sourceRows.reduce((max, [, row]) => Math.max(max, positionalArray(row).length), 0);
  const valueStats = stats.slice(0, valueCount);
  const flagStats = stats.slice(valueCount);
  const rows = sourceRows.map(([level, row]) => {
    const values = positionalArray(row);
    const interpolation = positionalArray(row.statInterpolation);
    const actorLevel = row.actorLevel ?? row.levelRequirement ?? 1;
    const effectiveness = availableEffectiveness(skill, actorLevel, gameConstants);
    const resolvedValues = [];
    const resolvedStatEntries = flagStats.map((stat) => [stat, 1]);
    valueStats.forEach((stat, index) => {
      const source = values[index] ?? 1;
      const resolved = interpolation[index] === 3 && effectiveness !== null
        ? luaRound(effectiveness * source)
        : interpolation[index] === 2 ? luaRound(source) : source;
      resolvedValues.push(resolved);
      // Duplicate stat ids are intentional in PoB. CalcTools adds them before
      // applying SkillStatMap (notably transfigured gems with adjustments).
      resolvedStatEntries.push([stat, resolved]);
    });
    for (const [stat, ...constantValues] of constantStats) {
      const value = constantValues[0] ?? 0;
      resolvedStatEntries.push([stat, value]);
    }
    const metadata = {};
    const promoted = new Set(["actorLevel", "levelRequirement", "statInterpolation", "damageEffectiveness", "critChance", "cost", "attackSpeedMultiplier", "baseMultiplier"]);
    for (const [key, value] of Object.entries(row ?? {})) if (!/^\d+$/.test(key) && !promoted.has(key)) metadata[key] = value;
    const attack = compactObject({
      attackSpeedPercentOfBase: typeof row.attackSpeedMultiplier === "number" ? row.attackSpeedMultiplier + 100 : undefined,
      attackDamagePercentOfBase: typeof row.baseMultiplier === "number" ? roundTo(row.baseMultiplier * 100) : undefined
    });
    const damage = damageSummary(resolvedStatEntries, skill.statMap, commonStatMap);
    const hasBaselineHitDamage = (damage.ranges?.length ?? 0) > 0;
    const hasExplicitDamageEffectiveness = typeof row.damageEffectiveness === "number";
    // PoB omits damageEffectiveness when a hit skill uses the game's implicit
    // 100% value. DoT-only levels have no baseline hit range and stay unset.
    const addedDamageEffectiveness = hasExplicitDamageEffectiveness
      ? row.damageEffectiveness
      : hasBaselineHitDamage ? 1 : undefined;
    return compactObject({
      level,
      actorLevel,
      levelRequirement: row.levelRequirement,
      sourceValues: valueStats.map((_, index) => values[index] ?? 1),
      values: resolvedValues,
      statInterpolation: interpolation,
      damage,
      addedDamageEffectiveness,
      addedDamageEffectivenessPercent: typeof addedDamageEffectiveness === "number" ? roundTo(addedDamageEffectiveness * 100) : undefined,
      addedDamageEffectivenessSource: typeof addedDamageEffectiveness === "number"
        ? hasExplicitDamageEffectiveness ? "explicit" : "implicit-hit-default"
        : undefined,
      criticalStrikeChance: row.critChance,
      attack,
      cost: row.cost,
      metadata
    });
  });
  return { valueStats, flagStats, rows };
}

async function loadDescriptionTables(pobRoot, report) {
  const root = path.join(pobRoot, "StatDescriptions");
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith(".lua")) files.push(full);
    }
  }
  try { await walk(root); } catch (error) { report.warnings.push({ file: "StatDescriptions", message: error.message }); }
  const tables = new Map();
  for (const file of files.sort()) {
    const rel = path.relative(pobRoot, file).replaceAll("\\", "/");
    try {
      const parsed = parseReturnTable(await readFile(file, "utf8"), rel);
      tables.set(path.basename(file, ".lua"), parsed);
      report.files[rel] = { entries: Object.keys(parsed ?? {}).length };
    } catch (error) { report.warnings.push({ file: rel, message: error.message }); }
  }
  return tables;
}

function resolveDescriptor(tables, scope, stat) {
  const visited = new Set();
  let current = scope || "skill_stat_descriptions";
  while (current && !visited.has(current)) {
    visited.add(current);
    const table = tables.get(current);
    if (!table) break;
    const ref = table[stat];
    if (ref !== undefined) {
      const entry = table[String(ref)] ?? (Array.isArray(table) ? table[Number(ref) - 1] : undefined);
      if (entry && typeof entry === "object") {
        const lines = asArray(entry)
          .flatMap((group) => asArray(group))
          .filter((line) => typeof line?.text === "string");
        const uniqueLines = [...new Map(lines.map((line) => [JSON.stringify(line), line])).values()];
        return compactObject({ stats: asArray(entry.stats), lines: uniqueLines, name: entry.name });
      }
    }
    current = table.parent;
  }
  return null;
}

function createDescriptionRegistry(tables) {
  const idsByDescriptor = new Map();
  const entries = {};
  let nextId = 1;
  return {
    register(scope, stat) {
      const descriptor = resolveDescriptor(tables, scope, stat);
      if (!descriptor?.lines?.length) return undefined;
      const signature = JSON.stringify(descriptor);
      let id = idsByDescriptor.get(signature);
      if (!id) {
        id = `d${nextId++}`;
        idsByDescriptor.set(signature, id);
        entries[id] = descriptor;
      }
      return id;
    },
    entries
  };
}

function normalizeParts(parts) {
  return asArray(parts).map((part, index) => ({ id: index + 1, ...part, name: part?.name ?? `Part ${index + 1}` }));
}

function normalizeSkill(id, value, sourceFile, gameConstants, descriptionRegistry, commonStatMap) {
  const stats = asArray(value.stats).filter((stat) => typeof stat === "string");
  const constants = constantRows(value.constantStats);
  const quality = constantRows(value.qualityStats).map(([stat, perQuality, ...extra]) => compactObject({
    stat,
    perQuality,
    extra: extra.length ? extra : undefined,
    // Skill descriptions inherit through active-skill and generic gem scopes,
    // while the reverse is not true. Starting at the skill's own scope gives
    // quality stats access to the same readable templates as normal tooltip stats.
    tooltipDescriptionId: descriptionRegistry.register(value.statDescriptionScope || "skill_stat_descriptions", stat)
  }));
  const baseFlags = trueKeys(value.baseFlags);
  const known = new Set([
    "name", "baseTypeName", "icon", "color", "description", "skillTypes", "castTime", "parts",
    "baseFlags", "qualityStats", "constantStats", "stats", "notMinionStat", "levels",
    "baseEffectiveness", "incrementalEffectiveness", "statDescriptionScope", "statMap", "baseMods"
  ]);
  const calculation = compactObject({
    statMap: value.statMap,
    baseMods: value.baseMods,
    functions: Object.fromEntries(Object.entries(value).filter(([key]) => /Func$/.test(key)))
  });
  const extra = Object.fromEntries(Object.entries(value).filter(([key]) => !known.has(key) && !/Func$/.test(key)));
  const constantsMap = constantsByStat(constants);
  const levelData = normalizeLevels(value, stats, constants, gameConstants, commonStatMap);
  const tooltipDescriptionIds = Object.fromEntries([...stats, ...Object.keys(constantsMap)]
    .map((stat) => [stat, descriptionRegistry.register(value.statDescriptionScope, stat)])
    .filter(([, descriptionId]) => descriptionId));
  return compactObject({
    id,
    name: value.name,
    baseTypeName: value.baseTypeName,
    sourceFile,
    color: value.color,
    description: value.description,
    skillTypes: trueKeys(value.skillTypes, "SkillType."),
    baseFlags,
    castTime: value.castTime,
    baseCastsPerSecond: value.castTime > 0 ? roundTo(1 / value.castTime) : undefined,
    parts: normalizeParts(value.parts),
    levelScaling: compactObject({
      baseEffectiveness: value.baseEffectiveness,
      incrementalEffectiveness: value.incrementalEffectiveness,
      formula: value.baseEffectiveness !== undefined ? "round((gameBase + gameIncrement * (actorLevel - 1)) * baseEffectiveness * (1 + incrementalEffectiveness) ^ (actorLevel - 1) * sourceValue)" : undefined
    }),
    statDescriptionScope: value.statDescriptionScope,
    statIds: stats,
    notMinionStatIds: asArray(value.notMinionStat),
    constantStats: constantsMap,
    customScaling: customScaling(constantsMap),
    quality,
    valueStatIds: levelData.valueStats,
    flagStatIds: levelData.flagStats,
    levels: levelData.rows,
    tooltipDescriptionIds,
    calculation,
    extra
  });
}

function gemCategory(gem, abilities) {
  const tags = trueKeys(gem.tags);
  if (tags.includes("support")) return "support";
  if (tags.includes("attack")) return "attack";
  if (tags.includes("spell")) return "spell";
  if (tags.includes("minion")) return "minion";
  if (abilities.some((skill) => skill.skillTypes?.includes("Damage"))) return "damage";
  return "other";
}

function hasDirectDamage(ability) {
  const statIds = [
    ...(ability.valueStatIds ?? []),
    ...(ability.flagStatIds ?? []),
    ...Object.keys(ability.constantStats ?? {})
  ];
  // Aura/buff values such as Anger's and Wrath's granted added damage use the
  // same stat naming shape as skill damage, but PoB explicitly marks the
  // ability as unable to deal damage itself.
  if (statIds.includes("base_deal_no_damage")) return false;
  if (ability.levels?.some((level) => level.damage?.ranges?.length || level.damage?.damageOverTimePerSecond?.length || level.attack?.attackDamagePercentOfBase !== undefined)) return true;
  if (ability.customScaling?.length) return true;
  if (statIds.some((stat) => /damage_to_deal_per_minute|as_damage_per_second|righteous_fire.*damage/i.test(stat))) return true;
  if (ability.skillTypes?.includes("Attack") && !ability.skillTypes.includes("CreatesMinion")) return true;
  return ability.skillTypes?.includes("Damage") && ability.levels?.some((level) => level.addedDamageEffectiveness !== undefined);
}

function activeSkillExclusionReason(gem) {
  if (gem.tags.includes("support")) return "support-gem";
  if (gem.tags.includes("herald")) return "herald-tag";
  if (gem.tags.includes("mark")) return "mark-tag";
  if (gem.tags.includes("pact")) return "pact-tag";
  if (!gem.tags.includes("grants_active_skill")) return "not-an-active-skill-gem";
  if (!gem.tags.some((tag) => tag === "attack" || tag === "spell")) return "missing-attack-or-spell-tag";
  return null;
}

function filterActiveSkillGems(gems) {
  const kept = [];
  const excluded = [];
  for (const gem of gems) {
    const reason = activeSkillExclusionReason(gem);
    if (!reason) kept.push(gem);
    else excluded.push({ id: gem.id, name: gem.name, category: gem.category, tags: gem.tags, reason });
  }
  return { kept, excluded };
}

function descriptionsUsedBy(gems, descriptions) {
  const ids = new Set();
  for (const gem of gems) {
    for (const ability of gem.abilities) {
      for (const id of Object.values(ability.tooltipDescriptionIds ?? {})) ids.add(id);
      for (const quality of ability.quality ?? []) if (quality.tooltipDescriptionId) ids.add(quality.tooltipDescriptionId);
    }
  }
  return Object.fromEntries([...ids].filter((id) => descriptions[id]).map((id) => [id, descriptions[id]]));
}

function normalizeGem(sourceId, gem, skillsById) {
  const ids = [
    [gem.grantedEffectId, "primary"],
    [gem.secondaryGrantedEffectId, "secondary"],
    ...Object.entries(gem).filter(([key]) => /^additionalGrantedEffectId\d+$/.test(key)).map(([, id]) => [id, "additional"])
  ].filter(([id]) => id);
  const abilities = [];
  const seen = new Set();
  for (const [id, role] of ids) {
    if (seen.has(id) || !skillsById.has(id)) continue;
    seen.add(id);
    abilities.push({ role, ...skillsById.get(id) });
  }
  if (!abilities.length) return null;
  const tags = trueKeys(gem.tags);
  const transfigured = sourceId !== gem.gameId && /Alt[A-Z0-9]*$/.test(gem.variantId ?? "");
  const known = new Set([
    "name", "baseTypeName", "gameId", "variantId", "grantedEffectId", "secondaryGrantedEffectId",
    "tags", "tagString", "reqStr", "reqDex", "reqInt", "naturalMaxLevel", "vaalGem"
  ]);
  const extra = Object.fromEntries(Object.entries(gem).filter(([key]) => !known.has(key) && !/^additionalGrantedEffectId\d+$/.test(key)));
  return compactObject({
    id: sourceId,
    gameId: gem.gameId ?? sourceId,
    familyId: gem.gameId ?? sourceId,
    variantId: gem.variantId,
    grantedEffectId: gem.grantedEffectId,
    secondaryGrantedEffectId: gem.secondaryGrantedEffectId,
    name: gem.name,
    baseTypeName: gem.baseTypeName ?? gem.name,
    category: gemCategory(gem, abilities),
    tags,
    tagString: gem.tagString,
    transfigured,
    vaal: gem.vaalGem === true || tags.includes("vaal"),
    naturalMaxLevel: gem.naturalMaxLevel,
    attributeRequirements: compactObject({ strengthWeight: gem.reqStr, dexterityWeight: gem.reqDex, intelligenceWeight: gem.reqInt }),
    abilities,
    hasDirectDamage: abilities.some(hasDirectDamage),
    extra
  });
}

function damageAudit(gems) {
  const repeatedValueStats = [];
  const invalidBaselineComponents = [];
  const supplementalAbilities = [];
  for (const gem of gems) {
    for (const ability of gem.abilities) {
      const counts = (ability.valueStatIds ?? []).reduce((out, stat) => {
        out[stat] = (out[stat] ?? 0) + 1;
        return out;
      }, {});
      const repeated = Object.entries(counts).filter(([, count]) => count > 1).map(([stat, count]) => ({ stat, count }));
      if (repeated.length) repeatedValueStats.push({ gem: gem.name, ability: ability.id, stats: repeated });

      const scopes = new Set();
      for (const level of ability.levels ?? []) {
        for (const range of level.damage?.ranges ?? []) {
          if (range.min === undefined || range.max === undefined || range.min < 0 || range.max < 0 || range.min > range.max) {
            invalidBaselineComponents.push({ gem: gem.name, ability: ability.id, level: level.level, kind: "hit", range });
          }
        }
        for (const dot of level.damage?.damageOverTimePerSecond ?? []) {
          if (!Number.isFinite(dot.value) || dot.value < 0) invalidBaselineComponents.push({ gem: gem.name, ability: ability.id, level: level.level, kind: "dot", dot });
        }
        for (const entry of [...(level.damage?.supplementalRanges ?? []), ...(level.damage?.supplementalDamageOverTimePerSecond ?? [])]) scopes.add(entry.scope);
      }
      if (scopes.size) supplementalAbilities.push({ gem: gem.name, ability: ability.id, scopes: [...scopes].sort() });
    }
  }
  return {
    repeatedValueStats,
    invalidBaselineComponents,
    supplementalAbilities,
    totals: {
      abilitiesWithRepeatedValueStats: repeatedValueStats.length,
      invalidBaselineComponents: invalidBaselineComponents.length,
      supplementalAbilities: supplementalAbilities.length
    }
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const pobRoot = path.resolve(args.pob);
  const outDir = path.resolve(args.out);
  const report = { generatedAt: new Date().toISOString(), pobRoot, outputDir: outDir, files: {}, warnings: [], totals: {} };

  const gems = parseReturnTable(await readFile(path.join(pobRoot, "Gems.lua"), "utf8"), "Gems.lua");
  report.files["Gems.lua"] = { entries: Object.keys(gems).length };
  const miscText = await readFile(path.join(pobRoot, "Misc.lua"), "utf8");
  const gameConstants = parseGameConstants(miscText);
  report.files["Misc.lua"] = { gameConstants: Object.keys(gameConstants).length };
  const commonStatMap = parseReturnTable(await readFile(path.join(pobRoot, "SkillStatMap.lua"), "utf8"), "SkillStatMap.lua");
  report.files["SkillStatMap.lua"] = { entries: Object.keys(commonStatMap).length };
  const descriptions = await loadDescriptionTables(pobRoot, report);
  const descriptionRegistry = createDescriptionRegistry(descriptions);

  const rawSkillsById = new Map();
  for (const relFile of SKILL_FILES) {
    try {
      const parsed = parseSkillAssignments(await readFile(path.join(pobRoot, relFile), "utf8"), relFile);
      report.files[relFile] = { skills: parsed.length };
      for (const { id, value } of parsed) rawSkillsById.set(id, { value, sourceFile: relFile });
    } catch (error) { report.warnings.push({ file: relFile, message: error.message }); }
  }

  const referencedSkillIds = new Set(Object.values(gems).flatMap((gem) => [
    gem.grantedEffectId,
    gem.secondaryGrantedEffectId,
    ...Object.entries(gem).filter(([key]) => /^additionalGrantedEffectId\d+$/.test(key)).map(([, id]) => id)
  ]).filter(Boolean));
  const skillsById = new Map();
  for (const id of referencedSkillIds) {
    const raw = rawSkillsById.get(id);
    if (raw) skillsById.set(id, normalizeSkill(id, raw.value, raw.sourceFile, gameConstants, descriptionRegistry, commonStatMap));
  }

  const allGems = Object.entries(gems).map(([sourceId, gem]) => normalizeGem(sourceId, gem, skillsById)).filter(Boolean);
  const activeSkillFilter = filterActiveSkillGems(allGems);
  const exportedGems = args.activeDamageOnly ? activeSkillFilter.kept : allGems;
  const exportedStatDescriptions = descriptionsUsedBy(exportedGems, descriptionRegistry.entries);
  const missingGrantedEffects = Object.entries(gems).filter(([, gem]) => gem.grantedEffectId && !skillsById.has(gem.grantedEffectId)).map(([id, gem]) => ({ id, name: gem.name, grantedEffectId: gem.grantedEffectId }));

  report.totals = {
    gemRecords: Object.keys(gems).length,
    parsedSkills: rawSkillsById.size,
    referencedSkills: skillsById.size,
    matchedGems: allGems.length,
    exportedGems: exportedGems.length,
    exportedAbilities: exportedGems.reduce((sum, gem) => sum + gem.abilities.length, 0),
    transfiguredGems: exportedGems.filter((gem) => gem.transfigured).length,
    vaalGems: exportedGems.filter((gem) => gem.vaal).length,
    missingGrantedEffects: missingGrantedEffects.length,
    tooltipDescriptionFiles: descriptions.size,
    exportedTooltipDescriptions: Object.keys(exportedStatDescriptions).length
  };
  const exportedLevels = exportedGems.flatMap((gem) => gem.abilities.flatMap((ability) => ability.levels ?? []));
  const supplementalRanges = exportedLevels.flatMap((level) => level.damage?.supplementalRanges ?? []);
  const supplementalDots = exportedLevels.flatMap((level) => level.damage?.supplementalDamageOverTimePerSecond ?? []);
  report.damageComponents = {
    baselineRanges: exportedLevels.reduce((sum, level) => sum + (level.damage?.ranges?.length ?? 0), 0),
    baselineDamageOverTime: exportedLevels.reduce((sum, level) => sum + (level.damage?.damageOverTimePerSecond?.length ?? 0), 0),
    supplementalRanges: supplementalRanges.length,
    supplementalDamageOverTime: supplementalDots.length,
    supplementalByScope: Object.fromEntries(Object.entries([...supplementalRanges, ...supplementalDots].reduce((counts, entry) => {
      counts[entry.scope] = (counts[entry.scope] ?? 0) + 1;
      return counts;
    }, {})).sort(([a], [b]) => a.localeCompare(b)))
  };
  report.damageEffectiveness = {
    explicitLevels: exportedLevels.filter((level) => level.addedDamageEffectivenessSource === "explicit").length,
    implicitDefaultLevels: exportedLevels.filter((level) => level.addedDamageEffectivenessSource === "implicit-hit-default").length,
    unsetLevels: exportedLevels.filter((level) => level.addedDamageEffectiveness === undefined).length,
    implicitDefaultAbilities: exportedGems.flatMap((gem) => gem.abilities
      .filter((ability) => ability.levels?.some((level) => level.addedDamageEffectivenessSource === "implicit-hit-default"))
      .map((ability) => ({ gem: gem.name, ability: ability.id })))
  };
  report.damageAudit = damageAudit(exportedGems);
  report.missingGrantedEffects = missingGrantedEffects;
  report.filters = args.activeDamageOnly ? {
    activeDamageOnly: true,
    strategy: "gem-tags",
    rules: [
      "Keep Gems.lua records tagged grants_active_skill.",
      "Require either the attack or spell gem tag.",
      "Exclude support-, herald-, mark-, and pact-tagged gems.",
      "Do not inspect description text or require ordinary flat-damage stats; unusual skills such as Righteous Fire remain available.",
      "Aura, curse, minion, and other mechanic tags are preserved for later filtering when the gem also satisfies the active attack/spell rules and is not explicitly excluded."
    ],
    kept: exportedGems.length,
    excluded: activeSkillFilter.excluded.length,
    excludedByReason: Object.fromEntries(Object.entries(activeSkillFilter.excluded.reduce((counts, gem) => {
      counts[gem.reason] = (counts[gem.reason] ?? 0) + 1;
      return counts;
    }, {})).sort(([a], [b]) => a.localeCompare(b))),
    retainedTaggedGroups: Object.fromEntries(["aura", "curse", "hex", "herald", "mark", "pact", "minion"].map((tag) => [tag, exportedGems.filter((gem) => gem.tags.includes(tag)).length])),
    excludedGems: activeSkillFilter.excluded
  } : { activeDamageOnly: false };
  report.notes = [
    "PoE1 skills store stats and level rows directly on the skill; unlike PoE2, there are no statSets.",
    "Level sourceValues are PoB interpolation inputs. Level values are resolved display values using PoB's SkillDamage effectiveness formula and Data/Misc.lua constants.",
    "valueStatIds names the positional sourceValues/values arrays on each level; flagStatIds are the remaining stats that PoB treats as enabled with value 1.",
    "addedDamageEffectiveness is the per-level Effectiveness of Added Damage. PoB omits its implicit 100% value on some skills, so levels with baseline hit ranges receive 1.0 and addedDamageEffectivenessSource implicit-hit-default; pure DoT levels remain unset. levelScaling.baseEffectiveness and incrementalEffectiveness are separate internal flat-damage scaling inputs.",
    "Each Gems.lua table key is exported as the unique gem id. gameId/familyId intentionally stays shared by base and transfigured variants.",
    "Vaal gems and other dual-effect gems expose primary/secondary abilities. A skill's parts are calculation/display modes over one skill payload, not PoE2-style stat sets.",
    "PoB-only statMap, baseMods, and custom *Func Lua bodies are retained under calculation for later per-skill overrides; Lua code is not executed.",
    "Baseline damage includes unconditional local/default-part components. Global effects, minion modifiers, actor conditions, player-stat scaling, and non-default skill parts are retained separately under supplemental damage fields.",
    "Repeated positional stat ids are added before damage extraction, matching PoB CalcTools semantics.",
    "Damage-over-time stats stored per minute by PoE are additionally exported per second without removing the original stat value.",
    "--active-damage-only is intentionally a conservative gem-tag filter, not a mechanic detector; it excludes support, mark, and pact tags while downstream aura/curse/minion filtering can use the retained tags."
  ];

  const payload = {
    schemaVersion: 1,
    source: {
      game: "Path of Exile 1",
      format: "Path of Building Community Data",
      skillDamageBaseEffectiveness: gameConstants.SkillDamageBaseEffectiveness,
      skillDamageIncrementalEffectiveness: gameConstants.SkillDamageIncrementalEffectiveness
    },
    filters: args.activeDamageOnly ? {
      activeDamageOnly: true,
      strategy: "gem-tags",
      requiredAllTags: ["grants_active_skill"],
      requiredAnyTags: ["attack", "spell"],
      excludedTags: ["support", "herald", "mark", "pact"]
    } : undefined,
    gems: exportedGems,
    statDescriptions: exportedStatDescriptions
  };
  if (!payload.filters) delete payload.filters;
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "gem-data.json"), `${JSON.stringify(payload, null, args.pretty ? 2 : 0)}\n`);
  await writeFile(path.join(outDir, "export-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Exported ${exportedGems.length} gems (${report.totals.exportedAbilities} abilities) to ${path.relative(process.cwd(), outDir) || outDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

export { damageSemantics, damageSummary, normalizeLevels };
