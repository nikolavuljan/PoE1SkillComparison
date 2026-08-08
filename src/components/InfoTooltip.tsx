import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { displayName, primaryDescription } from "../data/derive";
import { buildAbilityTooltipLines, buildQualityTooltipLines } from "../data/tooltip";
import type { SkillResult, SkillView } from "../types/app";
import type { GemDataPayload } from "../types/data";
import { formatCost, formatPercent, formatSeconds } from "./format";
import { useAnchoredPopover } from "./useAnchoredPopover";

interface Props {
  view: SkillView;
  result: SkillResult;
  data: GemDataPayload;
}

export function InfoTooltip({ view, result, data }: Props) {
  const buttonRef = useRef<HTMLAnchorElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const { position, open, close } = useAnchoredPopover({ width: 520, height: 620 });

  function show() {
    window.clearTimeout(closeTimer.current);
    if (buttonRef.current) open(buttonRef.current);
  }

  function hideSoon() {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(close, 100);
  }

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const ability = view.ability;
  const secondary = view.gem.abilities.filter((entry) => entry.role !== "primary");
  const statLines = position ? buildAbilityTooltipLines(ability, data, result.level) : [];
  const qualityLines = position ? buildQualityTooltipLines(ability, data) : [];

  return (
    <span className="info-host">
      <a
        ref={buttonRef}
        className="info-button"
        href={poeWikiUrl(view.gem.name)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${view.gem.name} on PoE Wiki; Shift-click for PoEDB`}
        title="Click for PoE Wiki; Shift-click for PoEDB"
        aria-expanded={position !== null}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={hideSoon}
        onClick={(event) => {
          event.stopPropagation();
          close();
          if (event.shiftKey) {
            event.preventDefault();
            const opened = window.open(poedbUrl(view.gem.name), "_blank", "noopener,noreferrer");
            if (opened) opened.opener = null;
          }
        }}
      >i</a>
      {position ? createPortal(
        <aside className="info-tooltip" style={position} role="tooltip" onClick={(event) => event.stopPropagation()} onMouseEnter={show} onMouseLeave={hideSoon}>
          <header>
            <div>
              <strong>{view.gem.name}</strong>
              <span>{view.gem.tagString ?? view.gem.tags.map(displayName).join(", ")}</span>
            </div>
            {view.gem.transfigured ? <span className="status-badge">Transfigured</span> : null}
            {view.gem.vaal ? <span className="status-badge vaal">Vaal</span> : null}
          </header>
          <div className="tooltip-facts">
            <Fact label="Gem level" value={String(result.level)} />
            {view.gem.category === "spell" ? <Fact label="Cast time" value={formatSeconds(result.castTime)} /> : null}
            {view.gem.category === "attack" ? <Fact label="Attack damage" value={formatPercent(result.weaponDamagePercent)} /> : null}
            <Fact label="Cooldown time" value={formatTooltipCooldown(result.cooldown, result.storedUses)} />
            <Fact label="Critical chance" value={formatPercent(result.critChance)} />
            <Fact label="Damage effectiveness" value={formatPercent(result.damageEffectivenessPercent)} />
            <Fact label="Cost" value={formatCost(result.cost)} />
          </div>
          <p className="skill-description">{primaryDescription(ability)}</p>
          {statLines.length ? (
            <section className="gem-stat-lines">
              <h4>Skill modifiers</h4>
              {statLines.map((line) => <p key={line.key}>{line.text}</p>)}
            </section>
          ) : null}
          {ability.customScaling?.length ? (
            <section>
              <h4>Base resource scaling</h4>
              {ability.customScaling.map((entry) => (
                <p key={entry.stat}>
                  {entry.percent ?? entry.percentPerSecond}% of maximum {displayName(entry.resource)} as {displayName(entry.damageType)} {entry.percentPerSecond !== undefined ? "damage per second" : "base damage"}
                </p>
              ))}
            </section>
          ) : null}
          {qualityLines.length ? (
            <section>
              <h4>Additional effects from 20% quality</h4>
              {qualityLines.map((line) => <p key={line.key}>{line.text}</p>)}
            </section>
          ) : null}
          {secondary.length ? (
            <section>
              <h4>Also grants</h4>
              {secondary.map((entry) => <p key={entry.id}>{entry.name}{entry.description ? ` — ${entry.description}` : ""}</p>)}
            </section>
          ) : null}
          {result.warnings.length ? (
            <section className="tooltip-warning">
              <h4>Calculation note</h4>
              {result.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </section>
          ) : null}
          <footer>Click i for PoE Wiki; Shift-click for PoEDB.</footer>
        </aside>,
        document.body
      ) : null}
    </span>
  );
}

export function poedbUrl(skillName: string): string {
  const slug = encodeURIComponent(skillName.trim().replace(/\s+/g, "_"));
  return `https://poedb.tw/us/${slug}`;
}

export function poeWikiUrl(skillName: string): string {
  const slug = encodeURIComponent(skillName.trim().replace(/\s+/g, "_"));
  return `https://www.poewiki.net/wiki/${slug}`;
}

export function formatTooltipCooldown(cooldown: number | undefined, storedUses: number | undefined): string {
  if (cooldown === undefined || !Number.isFinite(cooldown) || cooldown <= 0) return "–";
  const uses = storedUses !== undefined && Number.isFinite(storedUses) ? Math.max(1, Math.floor(storedUses)) : 1;
  return `${cooldown.toFixed(2)} sec${uses > 1 ? ` (${uses} uses)` : ""}`;
}

function Fact({ label, value }: { label: string; value: string }) {
  if (value === "–") return null;
  return <span><small>{label}</small>{value}</span>;
}
