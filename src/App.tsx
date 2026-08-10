import { useEffect, useMemo, useState } from "react";
import { calculateSkill } from "./calc/skills";
import { comparisonProfile, defaultSettingDescription } from "./calc/profiles";
import { Filters } from "./components/Filters";
import { SkillTable, type SkillRow } from "./components/SkillTable";
import { buildSkillViews, collectClickableTags, collectTagOptions, defaultFilters, matchesFilters, viewsForTab } from "./data/derive";
import { loadGemData } from "./data/load";
import { freshStorage, readStorage, settingsFor, writeStorage } from "./data/storage";
import type { Filters as FilterState, StorageState, Tab } from "./types/app";
import type { GemDataPayload } from "./types/data";

const initialFilters: Record<Tab, FilterState> = {
  spells: { ...defaultFilters },
  attacks: { ...defaultFilters }
};

export default function App() {
  const [data, setData] = useState<GemDataPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("spells");
  const [filters, setFilters] = useState(initialFilters);
  const [stored, setStored] = useState<StorageState>(readStorage);

  useEffect(() => {
    let active = true;
    loadGemData()
      .then((payload) => { if (active) setData(payload); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => writeStorage(stored), 1000);
    return () => window.clearTimeout(timeout);
  }, [stored]);

  const allViews = useMemo(() => data ? buildSkillViews(data) : [], [data]);
  const damagingViews = useMemo(() => allViews.filter((view) => view.gem.hasDirectDamage), [allViews]);
  const tabViews = useMemo(() => viewsForTab(damagingViews, tab), [damagingViews, tab]);
  const rows = useMemo<SkillRow[]>(() => tabViews.map((view) => {
    const settings = settingsFor(stored, view.key);
    const profile = comparisonProfile(view, stored.global.projectileOverlapSupports);
    return { view, settings, profile, defaultDescription: defaultSettingDescription(view), result: calculateSkill(view, stored.global, settings) };
  }), [tabViews, stored]);
  const visibleRows = useMemo(() => rows.filter((row) => matchesFilters(row.view, filters[tab])), [rows, filters, tab]);
  const tagOptions = useMemo(() => collectTagOptions(tabViews), [tabViews]);
  const clickableTags = useMemo(() => collectClickableTags(tabViews), [tabViews]);
  const counts = useMemo(() => ({
    spells: viewsForTab(damagingViews, "spells").length,
    attacks: viewsForTab(damagingViews, "attacks").length
  }), [damagingViews]);

  if (error) {
    return <main className="load-state"><h1>PoE1 Skill Comparison</h1><p>Could not load the generated gem data.</p><code>{error}</code><p>Run <code>npm run export:pob:damage</code>, then reload.</p></main>;
  }

  if (!data) return <main className="load-state"><div className="loading-orb" /><h1>Loading PoE1 gem data</h1><p>Preparing skill levels, tags, and descriptions...</p></main>;

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1><span>Path of Exile 1</span> Skill Comparison</h1>
      </header>

      <div className="tabs-row">
        <nav className="tabs" aria-label="Skill category">
          {(["spells", "attacks"] satisfies Tab[]).map((entry) => (
            <button
              key={entry}
              type="button"
              className={tab === entry ? "active" : ""}
              aria-current={tab === entry ? "page" : undefined}
              disabled={entry === "attacks"}
              title={entry === "attacks" ? "Unavailable until the attack comparison is reworked" : undefined}
              onClick={() => setTab(entry)}
            >
              <span>{entry === "spells" ? "Spells" : "Attacks"}</span><b>{counts[entry]}</b>
            </button>
          ))}
        </nav>
        <button className="work-warning" type="button" aria-label="Work in progress warning">
          <span className="work-warning-tooltip" role="tooltip">
            <strong>Work in progress</strong>
            <span>Current estimations may change drastically. % more damage multipliers on stage spells are standardized to avoid spell-specific code and do not reflect an accurate maximum hit.</span>
            <strong>TODO:</strong>
            <span>Total damage per cast<br />Ignite DPS<br />Attacks</span>
          </span>
        </button>
      </div>

      <Filters
        tab={tab}
        filters={filters[tab]}
        global={stored.global}
        tagOptions={tagOptions}
        clickableTags={clickableTags}
        onFiltersChange={(next) => setFilters((current) => ({ ...current, [tab]: next }))}
        onGlobalChange={(global) => setStored((current) => ({ ...current, global }))}
        onReset={() => {
          if (window.confirm("Reset every saved skill setting and global setting? This cannot be undone.")) setStored(freshStorage());
        }}
      />

      <SkillTable
        key={tab}
        tab={tab}
        rows={visibleRows}
        data={data}
        onSettingsChange={(key, settings) => setStored((current) => ({ ...current, skills: { ...current.skills, [key]: settings } }))}
      />
    </main>
  );
}
