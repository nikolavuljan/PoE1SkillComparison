import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { displayName } from "../data/derive";
import type { Filters as FilterState, GlobalInputs, Tab } from "../types/app";
import type { CritMode } from "../types/app";
import { useNumberDraft } from "./useNumberDraft";
import { useAnchoredPopover } from "./useAnchoredPopover";

interface Props {
  tab: Tab;
  filters: FilterState;
  global: GlobalInputs;
  tagOptions: string[];
  clickableTags: string[];
  onFiltersChange: (filters: FilterState) => void;
  onGlobalChange: (global: GlobalInputs) => void;
  onReset: () => void;
}

export function Filters({ tab, filters, global, tagOptions, clickableTags, onFiltersChange, onGlobalChange, onReset }: Props) {
  return (
    <section className="filters" aria-label={`${tab} filters`}>
      <div className="filters-main">
        <NumberInput className="level-field" label="Gem level" value={global.gemLevel} min={1} max={40} onChange={(gemLevel) => onGlobalChange({ ...global, gemLevel })} />
        <label className="search-field">
          <span>Search skills and descriptions</span>
          <input type="search" placeholder="Fireball, projectile, burning…" value={filters.query} onChange={(event) => onFiltersChange({ ...filters, query: event.currentTarget.value })} />
        </label>
        <label className="tag-field">
          <span>Tag or flag</span>
          <input list={`${tab}-tag-options`} placeholder="area, duration, vaal…" value={filters.tagQuery} onChange={(event) => onFiltersChange({ ...filters, tagQuery: event.currentTarget.value })} />
          <datalist id={`${tab}-tag-options`}>{tagOptions.map((option) => <option key={option} value={option} />)}</datalist>
        </label>
      </div>
      <div className="critical-bar">
        <div className="profile-control">
          <label>
            <input
              type="checkbox"
              role="switch"
              checked={global.projectileOverlapSupports}
              onChange={(event) => onGlobalChange({ ...global, projectileOverlapSupports: event.currentTarget.checked })}
            />
            <span>Projectile / overlap supports</span>
          </label>
          <ProfileHelp />
        </div>
        <div className="profile-control" title="Uses the larger of cast time and cooldown divided by stored uses. An 8-second cooldown with 3 uses becomes a 2.66667-second calculation interval.">
          <label>
            <input
              type="checkbox"
              role="switch"
              checked={global.useCooldownForCalculations}
              onChange={(event) => onGlobalChange({ ...global, useCooldownForCalculations: event.currentTarget.checked })}
            />
            <span>Use cooldown / charges</span>
          </label>
        </div>
        <fieldset>
          <legend><span>Critical strikes</span><CritHelp /></legend>
          {(["off", "base", "custom"] satisfies CritMode[]).map((mode) => <label key={mode}><input type="radio" name="crit-mode" checked={global.critMode === mode} onChange={() => onGlobalChange({ ...global, critMode: mode })} />{displayName(mode)}</label>)}
        </fieldset>
        <NumberInput label="Critical multiplier %" value={global.critMultiplierPercent} min={100} onChange={(critMultiplierPercent) => onGlobalChange({ ...global, critMultiplierPercent })} />
        {global.critMode === "custom" ? <NumberInput label="Increased crit chance%" value={global.criticalChanceScalingPercent} min={0} onChange={(criticalChanceScalingPercent) => onGlobalChange({ ...global, criticalChanceScalingPercent })} /> : null}
        <button type="button" className="reset-button" onClick={onReset}>Reset saved settings</button>
      </div>
      <div className="filter-pills" aria-label="Gem tag filters">
        <span className="pill-label">Tags <small>match all</small></span>
        {clickableTags.map((tag) => <Pill key={tag} label={displayName(tag)} active={filters.selectedTags.includes(tag)} onClick={() => onFiltersChange({ ...filters, selectedTags: toggle(filters.selectedTags, tag) })} />)}
      </div>
    </section>
  );
}

function ProfileHelp() {
  return (
    <HelpPopover ariaLabel="Explain projectile and overlap support profile">
      <strong>Projectile / overlap supports</strong>
      <p>Applies a secondary default profile to supported skills.</p>
      <p>Baseline mechanics such as stages, charges, pulses, corpse damage, and action intervals remain active whether this option is enabled or not.</p>
      <p>For explicitly supported overlap skills, this can add Greater Spell Cascade or GMP hit counts while applying the support gem's less-damage multiplier and the value of the damage support it replaces.</p>
      <p>Profiles affect hit damage and average damage effectiveness only. Ailment and profile-driven damage-over-time scaling are intentionally excluded until those calculations are modeled properly.</p>
    </HelpPopover>
  );
}

function CritHelp() {
  return (
    <HelpPopover ariaLabel="Explain critical strike calculation settings">
      <strong>Critical strikes</strong>
      <p>If set to Custom, critical strike chance and multiplier affect average damage effectiveness and damage effectiveness per second.</p>
    </HelpPopover>
  );
}

function HelpPopover({ ariaLabel, children }: { ariaLabel: string; children: ReactNode }) {
  const { position, open, close } = useAnchoredPopover({ width: 410, height: 190, placement: "below" });

  return (
    <>
      <button
        type="button"
        className="profile-help-button"
        aria-label={ariaLabel}
        onMouseEnter={(event) => open(event.currentTarget)}
        onMouseLeave={close}
        onFocus={(event) => open(event.currentTarget)}
        onBlur={close}
      >i</button>
      {position ? createPortal(
        <aside className="profile-help-tooltip" style={position} role="tooltip">
          {children}
        </aside>,
        document.body
      ) : null}
    </>
  );
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" className={active ? "filter-pill active" : "filter-pill"} onClick={onClick}>{label}</button>;
}

function NumberInput({ label, value, min, max, step = 1, className = "number-field", onChange }: {
  label: string;
  value: number;
  min: number;
  max?: number;
  step?: number;
  className?: string;
  onChange: (value: number) => void;
}) {
  const { inputRef, draft, update, commit } = useNumberDraft({ value, min, max, onChange });

  return <label className={className}><span>{label}</span><input ref={inputRef} type="number" value={draft} min={min} max={max} step={step} onChange={(event) => update(event.currentTarget.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>;
}

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}
