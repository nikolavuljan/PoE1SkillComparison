import { createPortal } from "react-dom";
import { resolveSkillModifiers } from "../calc/modifiers";
import type { SkillModifierType, SkillSettings } from "../types/app";
import { useAnchoredPopover } from "./useAnchoredPopover";

export function SettingsTooltip({ settings, defaultDescription = "" }: { settings: SkillSettings; defaultDescription?: string }) {
  const notes = settingNotes(settings, defaultDescription);
  const { position, open, close } = useAnchoredPopover({ width: 340, height: 220 });

  if (!notes.length) return null;

  return (
    <>
      <button
        type="button"
        className="settings-note-button"
        aria-label={notes.join(" ")}
        onMouseEnter={(event) => open(event.currentTarget)}
        onMouseLeave={close}
        onFocus={(event) => open(event.currentTarget)}
        onBlur={close}
      >?</button>
      {position ? createPortal(
        <aside className="settings-note-tooltip" style={position} role="tooltip">
          <strong>Skill settings</strong>
          {notes.map((note, index) => <p key={`${index}-${note}`}>{note}</p>)}
        </aside>,
        document.body
      ) : null}
    </>
  );
}

export function settingNotes(settings: SkillSettings, defaultDescription = ""): string[] {
  const notes: string[] = [];
  const resolved = resolveSkillModifiers(settings);
  const description = settings.settingDescription.trim() || defaultDescription.trim();
  if (description) notes.push(description);
  if (hasModifier(settings, "hit_count")) notes.push(`${displayNumber(resolved.hits)} hits per use.`);
  addMultiplicativeNote(notes, settings, "more_damage", resolved.moreDamageMultiplier, "damage");
  addMultiplicativeNote(notes, settings, "more_speed", resolved.moreSpeedMultiplier, "action speed");
  if (hasModifier(settings, "override_cast_time")) notes.push(`Base cast time overridden to ${displayNumber(resolved.overrideCastTime ?? 0)} seconds.`);
  const addedCount = settings.modifiers.filter((modifier) => modifier.type === "added_damage").length;
  if (addedCount) notes.push(`${displayNumber(resolved.addedDamage)} total custom added flat damage per hit${addedCount > 1 ? ` from ${addedCount} modifiers` : ""}.`);
  if (hasModifier(settings, "maximum_life")) notes.push(`${displayNumber(resolved.maximumLife)} maximum Life.`);
  if (hasModifier(settings, "maximum_energy_shield")) notes.push(`${displayNumber(resolved.maximumEnergyShield)} maximum Energy Shield.`);
  if (hasModifier(settings, "maximum_mana")) notes.push(`${displayNumber(resolved.maximumMana)} maximum Mana.`);
  return notes;
}

function addMultiplicativeNote(
  notes: string[],
  settings: SkillSettings,
  type: "more_damage" | "more_speed",
  multiplier: number,
  label: string
) {
  const values = settings.modifiers.filter((modifier) => modifier.type === type).map((modifier) => modifier.value);
  if (!values.length) return;
  if (values.length === 1) {
    notes.push(`${signed(values[0])}% more ${label}.`);
    return;
  }
  notes.push(`${values.map((value) => `${signed(value)}%`).join(" × ")} more ${label} modifiers (${signed((multiplier - 1) * 100)}% combined).`);
}

function hasModifier(settings: SkillSettings, type: SkillModifierType): boolean {
  return settings.modifiers.some((modifier) => modifier.type === type);
}

function signed(value: number): string {
  return value > 0 ? `+${displayNumber(value)}` : displayNumber(value);
}

function displayNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
