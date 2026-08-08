import { useEffect, useRef, useState } from "react";
import { isSupersededModifier } from "../calc/modifiers";
import { effectiveProfileModifiers, profileModifierOverrideValue, type SkillComparisonProfile } from "../calc/profiles";
import type { SkillModifier, SkillModifierType, SkillSettings, SkillView } from "../types/app";
import { useNumberDraft } from "./useNumberDraft";

interface Props {
  view: SkillView;
  settings: SkillSettings;
  profile?: SkillComparisonProfile;
  defaultDescription?: string;
  colSpan: number;
  onChange: (settings: SkillSettings) => void;
}

interface ModifierDefinition {
  type: SkillModifierType;
  label: string;
  initialValue: number;
  min: number;
  step?: number;
}

let fallbackId = 0;

export function SettingsPanel({ view, settings, profile, defaultDescription = "", colSpan, onChange }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const modifierStrip = useRef<HTMLDivElement>(null);
  const definitions = modifierDefinitions(view);
  const definitionByType = new Map(definitions.map((definition) => [definition.type, definition]));
  const profileModifiers = profile ? effectiveProfileModifiers(profile, settings) : [];
  const allModifiers = [...profileModifiers, ...settings.modifiers];

  useEffect(() => {
    if (!menuOpen) return;
    const strip = modifierStrip.current;
    if (strip) strip.scrollLeft = strip.scrollWidth;
  }, [menuOpen]);

  function addModifier(definition: ModifierDefinition) {
    const id = modifierId();
    const modifier: SkillModifier = { id, type: definition.type, value: definition.initialValue };
    onChange({ ...settings, modifiers: [...settings.modifiers, modifier] });
    setFocusId(id);
    setMenuOpen(false);
  }

  function updateModifier(id: string, value: number) {
    onChange({
      ...settings,
      modifiers: settings.modifiers.map((modifier) => modifier.id === id ? { ...modifier, value } : modifier)
    });
  }

  function removeModifier(id: string) {
    onChange({ ...settings, modifiers: settings.modifiers.filter((modifier) => modifier.id !== id) });
  }

  function updateProfileModifier(id: string, value: number) {
    const baseline = profile?.modifiers.find((modifier) => modifier.id === id);
    if (!baseline) return;
    const overrides = { ...settings.profileModifierOverrides };
    delete overrides[baseline.id];
    if (value !== baseline.value) overrides[id] = value;
    onChange({
      ...settings,
      profileModifierOverrides: Object.keys(overrides).length ? overrides : undefined
    });
  }

  return (
    <tr className="settings-row">
      <td colSpan={colSpan}>
        <div className="settings-panel">
          <DescriptionField
            value={settings.settingDescription}
            defaultValue={defaultDescription}
            onChange={(settingDescription) => onChange({ ...settings, settingDescription })}
          />

          <div ref={modifierStrip} className="modifier-settings" aria-label={`${profile?.label ?? "Custom"} skill settings`}>
            {profileModifiers.map((modifier, index) => {
              const definition = definitionByType.get(modifier.type) ?? fallbackDefinition(modifier.type);
              const baseline = profile!.modifiers[index];
              const modified = profileModifierOverrideValue(baseline, settings) !== undefined;
              return <NumberField
                key={modifier.id}
                label={definition.label}
                value={modifier.value}
                min={definition.min}
                step={definition.step}
                superseded={isSupersededModifier(allModifiers, index)}
                source={modified ? "edited-profile" : "profile"}
                autoFocus={false}
                onChange={(value) => updateProfileModifier(modifier.id, value)}
                onReset={modified ? () => updateProfileModifier(modifier.id, profile!.modifiers[index].value) : undefined}
              />;
            })}
            {settings.modifiers.map((modifier, index) => {
              const definition = definitionByType.get(modifier.type) ?? fallbackDefinition(modifier.type);
              const superseded = isSupersededModifier(allModifiers, profileModifiers.length + index);
              return <NumberField
                key={modifier.id}
                label={definition.label}
                value={modifier.value}
                min={definition.min}
                step={definition.step}
                superseded={superseded}
                autoFocus={focusId === modifier.id}
                onFocused={() => setFocusId(null)}
                onChange={(value) => updateModifier(modifier.id, value)}
                onRemove={() => removeModifier(modifier.id)}
              />;
            })}

            <div className="add-setting-control">
              <button
                type="button"
                className={menuOpen ? "add-setting-button active" : "add-setting-button"}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <b>+</b><span>Add setting</span>
              </button>
            </div>

            {menuOpen ? (
              <div className="modifier-menu" role="menu" aria-label="Choose a setting">
                {definitions.map((definition) => (
                  <button key={definition.type} type="button" role="menuitem" onClick={() => addModifier(definition)}>
                    {definition.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </td>
    </tr>
  );
}

function DescriptionField({ value, defaultValue, onChange }: { value: string; defaultValue: string; onChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const effectiveValue = value || defaultValue;
  const [draft, setDraft] = useState(effectiveValue);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(effectiveValue);
  }, [effectiveValue]);

  function commit() {
    if (!draft.trim() && defaultValue) {
      setDraft(defaultValue);
      if (value) onChange("");
    }
  }

  return (
    <label className="setting-description">
      <span>Setting description</span>
      <input
        ref={inputRef}
        type="text"
        maxLength={500}
        placeholder="e.g. 7 chains, each giving 50% more damage"
        value={draft}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setDraft(next);
          onChange(next);
        }}
        onBlur={commit}
      />
    </label>
  );
}

function modifierDefinitions(view: SkillView): ModifierDefinition[] {
  const speedLabel = view.gem.category === "attack" ? "More attack speed %" : "More cast speed %";
  const resources = new Set((view.ability.customScaling ?? []).map((entry) => entry.resource));
  return [
    { type: "hit_count", label: "Hit count", initialValue: 1, min: 0, step: .25 },
    { type: "more_damage", label: "More damage %", initialValue: 0, min: -100 },
    { type: "more_speed", label: speedLabel, initialValue: 0, min: -99 },
    { type: "added_damage", label: "Added flat damage", initialValue: 0, min: 0 },
    ...(view.gem.category === "spell" ? [{ type: "override_cast_time", label: "Override cast time (sec)", initialValue: view.ability.castTime ?? 1, min: 0, step: .01 } satisfies ModifierDefinition] : []),
    ...(resources.has("life") ? [{ type: "maximum_life", label: "Maximum Life", initialValue: 0, min: 0 } satisfies ModifierDefinition] : []),
    ...(resources.has("energy_shield") ? [{ type: "maximum_energy_shield", label: "Maximum ES", initialValue: 0, min: 0 } satisfies ModifierDefinition] : []),
    ...(resources.has("mana") ? [{ type: "maximum_mana", label: "Maximum Mana", initialValue: 0, min: 0 } satisfies ModifierDefinition] : [])
  ];
}

function fallbackDefinition(type: SkillModifierType): ModifierDefinition {
  return { type, label: type.replaceAll("_", " "), initialValue: 0, min: 0 };
}

function NumberField({ label, value, min, step = 1, superseded, source = "manual", autoFocus, onFocused, onChange, onRemove, onReset }: {
  label: string;
  value: number;
  min: number;
  step?: number;
  superseded: boolean;
  source?: "manual" | "profile" | "edited-profile";
  autoFocus: boolean;
  onFocused?: () => void;
  onChange: (value: number) => void;
  onRemove?: () => void;
  onReset?: () => void;
}) {
  const { inputRef, draft, update, commit } = useNumberDraft({ value, min, emptyValue: 0, onChange });

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    onFocused?.();
  }, [autoFocus, onFocused]);

  return (
    <label className={[
      "number-field modifier-setting",
      superseded ? "superseded-setting" : "",
      source !== "manual" ? "profile-setting" : "",
      source === "edited-profile" ? "edited-profile-setting" : ""
    ].filter(Boolean).join(" ")}>
      <span className="setting-label" title={label}>
        <span>{label}</span>
        {superseded ? <b>Overridden</b> : source === "edited-profile" ? <b>Edited</b> : source === "profile" ? <b>Profile</b> : null}
        {onRemove ? <button type="button" className="remove-setting" aria-label={`Remove ${label}`} onClick={onRemove}>×</button> : null}
        {onReset ? <button type="button" className="reset-profile-setting" aria-label={`Reset ${label} to profile default`} title="Reset profile value" onClick={onReset}>↺</button> : null}
      </span>
      <input
        ref={inputRef}
        type="number"
        value={draft}
        min={min}
        step={step}
        disabled={superseded}
        onChange={(event) => update(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
      />
    </label>
  );
}

function modifierId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  fallbackId += 1;
  return `modifier-${Date.now().toString(36)}-${fallbackId.toString(36)}`;
}
