import type { SkillModifier, SkillModifierType, SkillSettings, SkillView } from "../types/app";
import type { DamageScope } from "../types/data";

export interface SkillComparisonProfile {
  id: string;
  label: string;
  modifiers: SkillModifier[];
  ignoreCriticalDamage?: boolean;
  ignoreCooldownForCalculations?: boolean;
  includedDamageScopes?: DamageScope[];
}

interface SkillProfileDefinition {
  description: string;
  baseline: SkillComparisonProfile;
  overlap?: SkillComparisonProfile;
}

type ProfileOptions = Pick<SkillComparisonProfile, "ignoreCriticalDamage" | "ignoreCooldownForCalculations" | "includedDamageScopes">;
type ModifierSeed = readonly [SkillModifierType, number, string?];

const hit = (value: number, key = "hits"): ModifierSeed => ["hit_count", value, key];
const more = (value: number, key = "damage"): ModifierSeed => ["more_damage", value, key];
const speed = (value: number, key = "speed"): ModifierSeed => ["more_speed", value, key];
const added = (value: number, key = "added-flat"): ModifierSeed => ["added_damage", value, key];
const cast = (value: number, key = "cast-time"): ModifierSeed => ["override_cast_time", value, key];

function define(
  id: string,
  label: string,
  modifiers: ModifierSeed[],
  descriptions: string[],
  options: ProfileOptions = {}
): [string, SkillProfileDefinition] {
  return [id, {
    description: descriptions.join(" "),
    baseline: makeVariant(id, "baseline", label, modifiers, options)
  }];
}

function defineDual(
  id: string,
  description: string[],
  baseline: { label: string; modifiers: ModifierSeed[]; options?: ProfileOptions },
  overlap: { label: string; modifiers: ModifierSeed[]; options?: ProfileOptions }
): [string, SkillProfileDefinition] {
  return [id, {
    description: description.join(" "),
    baseline: makeVariant(id, "baseline", baseline.label, baseline.modifiers, baseline.options ?? {}),
    overlap: makeVariant(id, "overlap", overlap.label, overlap.modifiers, overlap.options ?? {})
  }];
}

function makeVariant(
  abilityId: string,
  kind: "baseline" | "overlap",
  label: string,
  modifiers: ModifierSeed[],
  options: ProfileOptions
): SkillComparisonProfile {
  const usedKeys = new Set<string>();
  const normalized = modifiers.map(([type, value, suppliedKey]): SkillModifier => {
    const key = suppliedKey ?? type;
    if (usedKeys.has(key)) throw new Error(`Duplicate profile modifier key ${abilityId}:${kind}:${key}`);
    usedKeys.add(key);
    return {
      id: `profile:${abilityId}:${kind}:${key}`,
      type,
      value
    };
  });
  return { id: `${abilityId}:${kind}`, label, modifiers: normalized, ...options };
}

/**
 * Comparison defaults live as data instead of branches in the calculator, so
 * each skill's settings stay auditable and can be revised independently.
 */
const skillProfiles: Record<string, SkillProfileDefinition> = Object.fromEntries([
  define("Arc", "Chain estimate", [more(135)], ["First hit, assuming nine chains (135% more damage)."]),
  define("ArcAltY", "Chain estimate", [more(350)], ["First hit, assuming seven chains (350% more damage)."]),

  define("BallLightning", "Maximum overlap", [hit(13)], ["Assumes the maximum 13 hits; practical results are usually lower."]),
  define("BallLightningAltX", "Maximum overlap", [hit(16)], ["Assumes the maximum 16 hits; practical results are usually lower."]),
  define("BallLightningAltY", "Maximum overlap", [hit(13)], ["Assumes the maximum 13 hits; practical results are usually lower."]),

  define("BladeBlast", "Bladefall and Unleash", [hit(20), more(-50)], [
    "Assumes 20 average hits from Bladefall, Greater Spell Cascade, and Unleash, with 50% less damage.",
    "Triggered setups do not gain the extra Unleash; self-cast setups alternate casts. Arcanist Brand can reach more hits but also requires placing brands."
  ]),
  define("BladeBlastAltX", "Unloading blades", [hit(10), more(25), cast(1)], ["Assumes 10 blades, 25% more damage as the average blade explosion, and a 1-second overridden cast time to eyeball dagger generation from Unleash or Arcanist Brand."]),
  define("BladeBlastAltY", "Bino's flat damage", [added(2000)], ["Adds 2,000 custom flat damage, assuming Bino's Kitchen Knife."]),
  define("BladeVortex", "Ten-blade estimate", [cast(.13), more(300)], ["Assumes 10 blades with 30% quality, 7.8 hits per second (a 0.13-second cast-time override), and 300% more damage."]),
  define("BladeVortexAltX", "Scythe overlap", [hit(2)], ["Assumes 2 hits. This spell hits every 0.6 seconds, so increasing cast speed is capped before reducing it to 1 hit. This can be overridden by removing the blade with Blade Blast of Unloading."]),

  defineDual("Bladefall", ["Hits two times by default. Greater Spell Cascade can produce seven hits, but the result varies heavily with area of effect and volley count."],
    { label: "Default hits", modifiers: [hit(2)] },
    { label: "Greater Spell Cascade", modifiers: [hit(7), more(-24, "cascade-penalty"), more(-25, "support-replacement")] }),
  defineDual("BladefallAltX", ["Assumes two hits by default and 30% more damage averaged across the volleys. Greater Spell Cascade can produce seven hits, but the result varies heavily with area of effect and volley count."],
    { label: "Default volleys", modifiers: [hit(2), more(30, "volley-average")] },
    { label: "Volley overlap", modifiers: [hit(7), more(30, "volley-average"), more(-24, "cascade-penalty"), more(-25, "support-replacement")] }),
  defineDual("BladefallAltY", ["Hits two times by default. Greater Spell Cascade can produce seven hits, but the result varies heavily with area of effect and volley count. Critical strikes do not increase damage or effectiveness in this profile."],
    { label: "Default impale hits", modifiers: [hit(2)], options: { ignoreCriticalDamage: true } },
    { label: "Impale overlap", modifiers: [hit(7), more(-24, "cascade-penalty"), more(-25, "support-replacement"), more(25, "impale")], options: { ignoreCriticalDamage: true } }),
  define("BladefallAltZ", "Mana-scaled hit rate", [cast(.35)], ["Assumes 5,000 Mana."]),
  define("BlazingSalvo", "Projectile overlap", [hit(8)], ["Assumes eight hits."]),

  define("Bodyswap", "Life and corpse explosion", [added(850, "player-life"), added(4557, "corpse-life")], ["Adds 850 flat damage for 5,000 player Life and 4,557 flat damage for a level 26 Unearth corpse. Desecrate has a 15% chance to create the corpse of a raised Meatsack Spectre."]),
  define("BodyswapAltX", "Sacrificed minion", [added(200, "player-life"), added(14500, "minion-life")], ["Adds 200 flat damage for 5,000 player Life and 14,500 flat damage, assuming a 50,000-Life Raise Zombie. Top-end setups can reach roughly 200,000 Life with three Axiom Wardens, Aukuna's Will, tattoos, and Minion Life Support."]),

  defineDual("ColdSnapAltX", ["Assumes one hit by default or three hits with Greater Spell Cascade and one fewer damage support. The cooldown is ignored because spending a Power Charge bypasses it. Pact of Beidat can significantly increase the damage."],
    { label: "Default hit", modifiers: [hit(1)], options: { ignoreCooldownForCalculations: true } },
    { label: "Greater Spell Cascade", modifiers: [hit(3), more(-24, "cascade-penalty"), more(-25, "support-replacement")], options: { ignoreCooldownForCalculations: true } }),
  define("CracklingLance", "Maximum Intensity", [more(200)], ["Assumes four Intensity stacks (200% more damage)."]),
  defineDual("CreepingFrost", ["Assumes two hits by default, or six hits with Greater Multiple Projectiles and pierce when projectile/overlap supports are enabled, including the support and replacement penalties."],
    { label: "Default overlap", modifiers: [hit(2)] },
    { label: "Projectile overlap", modifiers: [hit(6), more(-21, "projectile-support-penalty"), more(-25, "support-replacement")] }),

  defineDual("DetonateDead", ["Assumes a level 26 Unearth corpse: one hit by default, or six hits with Greater Spell Cascade and one fewer damage support. Desecrate has a 15% chance to create the corpse of a raised Meatsack Spectre."],
    { label: "Default corpse explosion", modifiers: [added(4557), hit(1)] },
    { label: "Unearth cascade", modifiers: [added(4557), hit(6), more(-24, "cascade-penalty"), more(-25, "support-replacement")] }),
  define("DetonateDeadAltY", "Chain Reaction corpses", [added(2848), hit(8)], ["Assumes eight hits and 2,848 corpse flat damage from level 26 Unearth. Desecrate has a 15% chance to create the corpse of a raised Meatsack Spectre."]),
  define("Discharge", "Nine-charge total", [hit(3)], ["Assumes three Power, three Endurance, and three Frenzy Charges."]),
  define("DischargeAltX", "Nine-charge total", [hit(3)], ["Assumes three Power, three Endurance, and three Frenzy Charges."]),
  define("DivineIre", "Perfect release", [more(227)], ["Assumes a perfect release at 10 stages (227% more damage)."]),

  define("ExplosiveTrap", "Explosion overlap", [hit(8)], ["Assumes eight explosions hit."]),
  define("ExplosiveTrapAltX", "Shrapnel overlap", [hit(9)], ["Assumes nine explosions hit."]),
  define("EyeOfWinter", "Projectile overlap", [hit(5), more(100)], ["Assumes five hits and 100% more damage as an approximate overlap estimate."]),
  define("Firestorm", "Storm total", [hit(6), more(47)], ["Assumes six hits; 47% more damage is the average gain from combining the first impact with the remaining impacts from one cast."]),
  define("FirestormAltY", "Pelting total", [hit(13)], ["Assumes 13 hits from one cast."]),
  define("FlameSurge", "Burning target", [more(110)], ["Assumes 110% more hit damage against a Burning enemy."]),
  define("Flameblast", "Ten-stage estimate", [more(74)], ["Estimates a 10-stage release at 74% more damage; depending on stage behavior, tapping can compare more favorably than holding (approximately 165% to 74% more damage)."]),
  define("FlameblastAltX", "Three-stage estimate", [more(193)], ["Estimates a three-stage release at 193% more damage; depending on stage behavior, tapping can compare more favorably than holding (approximately 260% to 193% more damage)."]),
  define("FlamethrowerTrap", "Full trap sequence", [hit(40), more(25)], ["Assumes 40 hits and 25% more damage."]),
  define("FireTrap", "Burning enemy", [], ["Assumes the enemy is Burning and includes the skill's additional flat damage against Burning enemies."], { includedDamageScopes: ["actor-condition"] }),
  define("FireTrapAltX", "Repeated trigger", [hit(1.5)], ["Assumes 1.5 hits because the trap can trigger an additional time, and includes the skill's additional flat damage against a Burning enemy."], { includedDamageScopes: ["actor-condition"] }),

  defineDual("ForbiddenRite", ["Assumes two hits and 2,100 custom flat damage from 15,000 Energy Shield by default. Projectile/overlap supports use six hits with Greater Multiple Projectiles and one fewer damage support."],
    { label: "Default projectiles", modifiers: [hit(2), added(2100)] },
    { label: "GMP overlap", modifiers: [hit(6), more(-26, "gmp-penalty"), more(-25, "support-replacement"), added(2100)] }),
  defineDual("ForbiddenRiteAltX", ["Assumes two hits and 3,000 custom flat damage from 15,000 Energy Shield by default. Projectile/overlap supports use six hits with Greater Multiple Projectiles and one fewer damage support."],
    { label: "Default projectiles", modifiers: [hit(2), added(3000)] },
    { label: "GMP overlap", modifiers: [hit(6), more(-26, "gmp-penalty"), more(-25, "support-replacement"), added(3000)] }),
  defineDual("FrostBombAltX", ["Assumes one hit by default or five hits with Greater Spell Cascade and one fewer damage support. Pact of Beidat can significantly increase the damage."],
    { label: "Default hit", modifiers: [hit(1)] },
    { label: "Greater Spell Cascade", modifiers: [hit(5), more(-24, "cascade-penalty"), more(-25, "support-replacement")] }),
  define("FrostBombAltY", "Four-second delay", [more(400)], ["Assumes the full four-second delay (400% more damage)."]),
  define("Frostblink", "Origin and destination", [hit(2)], ["Assumes both area hits connect."]),
  define("FrostblinkAltX", "Origin and destination", [hit(2), more(126)], ["Assumes both area hits connect; the more-damage modifier comes from a 30% Chill."]),
  define("GlacialCascade", "Final burst overlap", [hit(3), more(91)], ["Assumes three hits; 91% more damage estimates the final hit averaged across all three hits."]),
  define("GlacialCascadeAltX", "Fissure overlap", [hit(3)], ["Assumes three hits."]),

  define("Hexblast", "Doom estimate", [more(200)], ["Assumes 200% more hit damage because the enemy is Hexed."]),
  define("HexblastAltX", "Contradiction estimate", [more(300)], ["Assumes 300% more hit damage because the enemy is Hexed."]),
  define("Hydrosphere", "Pulse interval", [cast(.4)], ["Uses a 0.4-second pulse interval instead of ordinary cast time."]),
  define("IceNovaAltX", "Frostbolt overlap", [hit(3), more(50), speed(100)], ["Assumes three hits and 50% more damage when cast on Frostbolt. The 100% more cast speed represents echoes on Frostbolts not requiring another cast."]),
  define("IceTrap", "Quality estimate", [more(22)], ["Includes 22% more hit damage in the supplied quality settings."]),
  define("IceTrapAltX", "Quality estimate", [more(22)], ["Includes 22% more hit damage in the supplied quality settings."]),

  define("Incinerate", "Maximum stages", [more(325)], ["Assumes holding at 10 stages (325% more damage); a perfect release adds only about 3% more."]),
  define("IncinerateAltX", "Perfect release", [more(525)], ["Assumes a perfect release (525% more damage), approximately three times the damage of holding at maximum stages."]),
  define("IncinerateAltY", "Maximum stages", [more(475)], ["Assumes holding at 19 stages (475% more damage)."]),
  define("LightningConduit", "65% Shock", [more(338)], ["Assumes a 65% Shock (338% more damage)."]),
  define("LightningTendrilsAltX", "Eccentricity pulse", [more(100)], ["Assumes 100% more damage by averaging the 500% more-damage pulse across the pulse sequence."]),
  define("OrbOfStorms", "Trigger interval", [cast(.5)], ["Uses the 0.5-second trigger cooldown as its action interval."]),

  define("PenanceBrand", "Brand activation", [cast(2), more(22)], ["Uses a two-second activation interval and 22% more damage."]),
  define("PenanceBrandAltY", "Conduction detachment", [cast(.5), more(145)], ["Uses a 0.5-second custom cast time because the brand deals damage once when it detaches, with 145% more damage."]),
  define("PenanceBrandAltX", "Dissipation activation", [cast(.1), more(400, "dissipation"), more(22, "quality")], ["Uses a 0.1-second activation interval, 400% more damage, and a separate 22% more-damage quality modifier."]),
  define("PurifyingFlameAltX", "Revelations estimate", [more(195)], ["Assumes 195% more damage from the shockwave."]),
  define("PyroclastMine", "Projectile overlap", [hit(4)], ["Assumes four projectiles hit."]),
  define("PyroclastMineAltX", "Projectile overlap", [hit(4)], ["Assumes four projectiles hit."]),
  define("Reap", "Blood-charge estimate", [more(110)], ["Assumes 110% more hit damage from Blood Charges."]),
  define("ReapAltX", "Blood-charge estimate", [more(125)], ["Assumes 125% more hit damage from Blood Charges."]),
  define("RollingMagma", "Bounce overlap", [hit(2)], ["Assumes two hits."]),
  define("SeismicTrap", "Six-wave sequence", [hit(12)], ["Assumes 12 hits across six waves."]),
  define("SeismicTrapAltX", "Swells overlap", [hit(2)], ["Assumes two hits."]),
  define("ShockNovaAltX", "Procession speed", [speed(15)], ["Assumes 15% more cast speed from quality."]),

  define("Spark", "Projectile return", [hit(2)], ["Assumes two hits."]),
  define("SparkAltX", "Projectile return", [hit(2)], ["Assumes two hits."]),
  define("SparkAltY", "Projectile return", [hit(2)], ["Assumes two hits."]),
  define("StormBrand", "Brand activation", [cast(.5), more(80)], ["Uses a 0.5-second activation interval and 80% more damage while damaging a branded enemy."]),
  define("StormCall", "Greater Spell Cascade", [hit(5), more(-24, "cascade-penalty"), more(-25, "support-replacement")], ["Assumes five hits with Greater Spell Cascade and one fewer damage support. Pact of Beidat can more than double this damage."]),
  define("Tornado", "Hit interval", [cast(.25)], ["Uses a 0.25-second hit interval."]),
  define("TornadoAltY", "Hit interval", [cast(.25)], ["Uses a 0.25-second hit interval."]),
  define("VoidSphere", "Pulse interval", [cast(.4)], ["Uses a 0.4-second pulse interval."]),
  define("VoidSphereAltX", "Pulse interval", [cast(.25)], ["Uses a 0.25-second pulse interval."]),
  define("VortexAltX", "Projection overlap", [hit(3), more(50)], ["Assumes three hits and 50% more damage."]),
  define("WaveOfConvictionAltY", "Wave overlap", [hit(2)], ["Assumes two hits."]),
  define("WinterOrb", "Channelled stages", [cast(.2222), hit(3)], ["Assumes 11 stages while channelling, three hits, and a 0.2222-second overridden cast time."]),
  define("Stormbind", "Rune estimate", [cast(.6), more(300)], ["Uses a 0.6-second override: 0.12 seconds to place a rune and three 0.18-second upgrades, producing the 300% more-damage third-improvement explosion."]),

  defineDual("VolatileDead", ["Assumes three hits by default, or 12 with Greater Spell Cascade and one fewer damage support. The corpse damage uses Desecrate; Unearth can be higher but makes sustaining enough corpses harder."],
    { label: "Default corpse sequence", modifiers: [hit(3), added(800)] },
    { label: "Cascade corpse sequence", modifiers: [more(-24, "cascade-penalty"), more(-25, "support-replacement"), hit(12), added(800)] }),
  defineDual("VolatileDeadAltX", ["Assumes three hits by default, or 12 with Greater Spell Cascade and one fewer damage support. The corpse damage uses Desecrate; Unearth can be higher but makes sustaining enough corpses harder."],
    { label: "Default corpse sequence", modifiers: [hit(3), added(800)] },
    { label: "Cascade corpse sequence", modifiers: [more(-24, "cascade-penalty"), more(-25, "support-replacement"), hit(12), added(800)] }),
  define("VolatileDeadAltY", "Seething corpse sequence", [added(800), hit(10), cast(1)], ["Assumes 10 hits and a 1-second custom cast time. The orbs take 0.67 seconds to emerge and at least 1 second to hit the main target, which is why the skill struggles with its 10-orb cap. The corpse damage uses Desecrate; Unearth can be higher but makes sustaining enough corpses harder."])
]);

export function comparisonProfile(view: SkillView, useProjectileOverlapSupports: boolean): SkillComparisonProfile | undefined {
  const definition = skillProfiles[view.ability.id];
  if (!definition) return undefined;
  return useProjectileOverlapSupports && definition.overlap
    ? definition.overlap
    : definition.baseline;
}

export function defaultSettingDescription(view: SkillView): string {
  return skillProfiles[view.ability.id]?.description ?? "";
}

export function profileModifierOverrideValue(modifier: SkillModifier, settings: SkillSettings): number | undefined {
  return settings.profileModifierOverrides?.[modifier.id];
}

export function effectiveProfileModifiers(profile: SkillComparisonProfile, settings: SkillSettings): SkillModifier[] {
  return profile.modifiers.map((modifier) => ({
    id: modifier.id,
    type: modifier.type,
    value: profileModifierOverrideValue(modifier, settings) ?? modifier.value
  }));
}
