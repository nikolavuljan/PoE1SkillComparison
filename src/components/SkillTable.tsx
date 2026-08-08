import { Fragment, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  rowExpandingFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnSizingState,
  type ExpandedState,
  type Updater
} from "@tanstack/react-table";
import { displayName, overviewTags } from "../data/derive";
import type { SkillComparisonProfile } from "../calc/profiles";
import { readColumnSizing, writeColumnSizing } from "../data/tableLayout";
import type { SkillResult, SkillSettings, SkillView, Tab } from "../types/app";
import type { GemDataPayload } from "../types/data";
import { SettingsTooltip } from "./SettingsTooltip";
import { ChipList } from "./ChipList";
import { formatNumber, formatPercent, formatSeconds } from "./format";
import { InfoTooltip } from "./InfoTooltip";
import { SettingsPanel } from "./SettingsPanel";
import { TableScroller } from "./TableScroller";

export interface SkillRow {
  view: SkillView;
  result: SkillResult;
  settings: SkillSettings;
  profile?: SkillComparisonProfile;
  defaultDescription: string;
}

interface Props {
  tab: Tab;
  rows: SkillRow[];
  data: GemDataPayload;
  onSettingsChange: (key: string, settings: SkillSettings) => void;
}

interface SkillColumnMeta {
  sticky?: boolean;
}

const skillTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnSizingFeature,
  columnResizingFeature,
  columnVisibilityFeature,
  rowExpandingFeature,
  columnMeta: {} as SkillColumnMeta
});

const columnHelper = createColumnHelper<typeof skillTableFeatures, SkillRow>();
const spellColumns = makeSpellColumns();
const attackColumns = makeAttackColumns();

export function SkillTable({ tab, rows, data, onSettingsChange }: Props) {
  const columns = useMemo(() => tab === "spells" ? spellColumns : attackColumns, [tab]);
  const savedColumnSizing = useRef<ColumnSizingState>(readColumnSizing(tab));
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(savedColumnSizing.current);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const autoFitCompleted = useRef(false);
  const tableElement = useRef<HTMLTableElement>(null);

  function updateColumnSizing(updater: Updater<ColumnSizingState>) {
    setColumnSizing((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      const saved = { ...savedColumnSizing.current };
      const ids = new Set([...Object.keys(current), ...Object.keys(next)]);
      for (const id of ids) {
        if (current[id] === next[id]) continue;
        if (next[id] === undefined) delete saved[id];
        else saved[id] = next[id];
      }
      savedColumnSizing.current = saved;
      writeColumnSizing(tab, saved);
      return next;
    });
  }

  const table = useTable({
    features: skillTableFeatures,
    data: rows,
    columns,
    getRowId: (row) => row.view.key,
    getRowCanExpand: () => true,
    autoResetExpanded: false,
    enableMultiSort: false,
    enableSortingRemoval: false,
    columnResizeMode: "onEnd",
    defaultColumn: { size: 105, minSize: 64, maxSize: 520 },
    state: { columnSizing, expanded },
    onColumnSizingChange: updateColumnSizing,
    onExpandedChange: setExpanded,
    initialState: {
      sorting: [{ id: tab === "spells" ? "hitDps" : "weapon", desc: true }]
    }
  }, (state) => ({
    sorting: state.sorting,
    columnSizing: state.columnSizing,
    columnResizing: state.columnResizing,
    columnVisibility: state.columnVisibility,
    expanded: state.expanded
  }));

  useLayoutEffect(() => {
    if (autoFitCompleted.current || !rows.length || !tableElement.current) return;
    autoFitCompleted.current = true;
    const fitted: ColumnSizingState = {};
    for (const column of table.getVisibleLeafColumns()) {
      const measured = measureColumn(tableElement.current, column.id);
      const min = column.columnDef.minSize ?? 64;
      const max = column.columnDef.maxSize ?? 520;
      if (measured !== undefined) fitted[column.id] = Math.max(min, Math.min(max, measured));
    }
    setColumnSizing({ ...fitted, ...savedColumnSizing.current });
  }, [rows.length, table]);

  const visibleColumns = table.getVisibleLeafColumns();
  const tableWidth = table.getTotalSize();

  function toggleRow(rowId: string) {
    setExpanded((current) => current !== true && current[rowId] ? {} : { [rowId]: true });
  }

  return (
    <section className="table-card">
      <TableScroller>
        <table ref={tableElement} className="skill-table" style={{ width: tableWidth }}>
          <colgroup>
            {visibleColumns.map((column) => <col key={column.id} style={{ width: column.getSize() }} />)}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const meta = header.column.columnDef.meta;
                  const className = [meta?.sticky ? "sticky-column" : "", sorted ? "sorted-column" : ""].filter(Boolean).join(" ");
                  return (
                    <th key={header.id} className={className || undefined} colSpan={header.colSpan} data-column-id={header.column.id}>
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button type="button" className="sort-button" onClick={header.column.getToggleSortingHandler()}>
                          <table.FlexRender header={header} />
                          <span>{sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : ""}</span>
                        </button>
                      ) : <span className="column-label"><table.FlexRender header={header} /></span>}
                      {header.column.getCanResize() ? (
                        <ColumnResizeHandle
                          header={header}
                          deltaOffset={table.state.columnResizing.deltaOffset}
                          onSizeChange={(next) => table.setColumnSizing((current) => ({ ...current, [header.column.id]: next }))}
                          onAutoSize={() => {
                            const measured = tableElement.current ? measureColumn(tableElement.current, header.column.id) : undefined;
                            const min = header.column.columnDef.minSize ?? 64;
                            const max = header.column.columnDef.maxSize ?? 520;
                            if (measured !== undefined) table.setColumnSizing((current) => ({ ...current, [header.column.id]: Math.max(min, Math.min(max, measured)) }));
                          }}
                        />
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((tableRow) => {
              const expanded = tableRow.getIsExpanded();
              return (
                <Fragment key={tableRow.id}>
                  <tr className={expanded ? "skill-row expanded" : "skill-row"}>
                    {tableRow.getVisibleCells().map((cell) => {
                      const sorted = cell.column.getIsSorted();
                      if (cell.column.id === "skill") {
                        return <SkillCell
                          key={cell.id}
                          row={tableRow.original}
                          data={data}
                          sorted={Boolean(sorted)}
                          expanded={expanded}
                          onToggle={() => toggleRow(tableRow.id)}
                        />;
                      }
                      return <td key={cell.id} data-column-id={cell.column.id} className={sorted ? "sorted-column" : undefined}><table.FlexRender cell={cell} /></td>;
                    })}
                  </tr>
                  {expanded ? (
                    <SettingsPanel
                      view={tableRow.original.view}
                      settings={tableRow.original.settings}
                      profile={tableRow.original.profile}
                      defaultDescription={tableRow.original.defaultDescription}
                      colSpan={visibleColumns.length}
                      onChange={(settings) => onSettingsChange(tableRow.original.view.key, settings)}
                    />
                  ) : null}
                </Fragment>
              );
            })}
            {!rows.length ? <tr><td className="empty-state" colSpan={visibleColumns.length}>No skills match the current filters.</td></tr> : null}
          </tbody>
        </table>
      </TableScroller>
    </section>
  );
}

type SkillTableHeader = ReturnType<ReturnType<typeof useTable<typeof skillTableFeatures, SkillRow>>["getHeaderGroups"]>[number]["headers"][number];

function ColumnResizeHandle({ header, deltaOffset, onSizeChange, onAutoSize }: {
  header: SkillTableHeader;
  deltaOffset: number | null;
  onSizeChange: (size: number) => void;
  onAutoSize: () => void;
}) {
  const column = header.column;
  const resizing = column.getIsResizing();
  const min = column.columnDef.minSize ?? 64;
  const max = column.columnDef.maxSize ?? 520;
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const lastTouchTap = useRef(0);

  function resizeWithKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) column.resetSize();
      else onAutoSize();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const movement = event.key === "ArrowLeft" ? -10 : 10;
    onSizeChange(Math.max(min, Math.min(max, column.getSize() + movement)));
  }

  return (
    <div
      className={resizing ? "column-resizer active" : "column-resizer"}
      role="separator"
      aria-label={`Resize ${String(column.columnDef.header ?? column.id)} column`}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(column.getSize())}
      tabIndex={0}
      title="Drag to resize; double-click to fit content; Shift-double-click to reset"
      style={{ transform: resizing ? `translateX(${deltaOffset ?? 0}px)` : undefined }}
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (event.shiftKey) column.resetSize();
        else onAutoSize();
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "touch") touchStart.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        const start = touchStart.current;
        if (event.pointerType === "touch" && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7) touchStart.current = null;
      }}
      onPointerUp={(event) => {
        if (event.pointerType !== "touch" || !touchStart.current) return;
        touchStart.current = null;
        const now = performance.now();
        if (now - lastTouchTap.current < 350) {
          event.preventDefault();
          lastTouchTap.current = 0;
          onAutoSize();
        } else lastTouchTap.current = now;
      }}
      onPointerCancel={() => { touchStart.current = null; }}
      onKeyDown={resizeWithKeys}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

function makeSpellColumns() {
  return columnHelper.columns([
    skillColumn(),
    damageColumn(),
    numberColumn("min", "Min", (row) => row.result.minDamage, formatNumber, 100),
    numberColumn("max", "Max", (row) => row.result.maxDamage, formatNumber, 100),
    numberColumn("average", "Average dmg", (row) => row.result.averageHit * row.result.hitCount, formatNumber, 125),
    numberColumn("hitDps", "Hit DPS", (row) => row.result.hitDps, formatNumber, 115),
    numberColumn("dotDps", "DoT DPS", (row) => row.result.dotDps, formatNumber, 115),
    numberColumn("crit", "Crit", (row) => row.result.critChance, formatPercent, 85),
    numberColumn("speed", "Cast", (row) => row.result.castTime, formatSeconds, 85),
    numberColumn("cooldown", "Cooldown", (row) => row.result.cooldown, formatSeconds, 100),
    numberColumn("duration", "Duration", (row) => row.result.duration, formatSeconds, 95),
    numberColumn("effectiveness", "Effectiveness", (row) => row.result.damageEffectivenessPercent, formatPercent, 115),
    numberColumn("averageEffectiveness", "Avg dmg eff", (row) => row.result.averageDamageEffectivenessPercent, formatPercent, 110),
    numberColumn("effectivenessPerSecond", "Avg dmg eff/sec", (row) => row.result.averageDamageEffectivenessPerSecondPercent, formatPercent, 125),
    tagsColumn(),
    flagsColumn()
  ]);
}

function makeAttackColumns() {
  return columnHelper.columns([
    skillColumn(),
    damageColumn(),
    numberColumn("weapon", "Weapon dmg", (row) => row.result.weaponDamagePercent, formatPercent, 105),
    numberColumn("min", "Added min", (row) => row.result.minDamage, formatNumber, 100),
    numberColumn("max", "Added max", (row) => row.result.maxDamage, formatNumber, 100),
    numberColumn("dps", "DPS % base", (row) => row.result.dpsPercent, formatPercent, 105),
    numberColumn("attackSpeed", "Attack speed", (row) => row.result.attackSpeedPercent, formatPercent, 110),
    numberColumn("speed", "Attack time", (row) => row.result.attackTime, formatSeconds, 105),
    numberColumn("cooldown", "Cooldown", (row) => row.result.cooldown, formatSeconds, 100),
    numberColumn("duration", "Duration", (row) => row.result.duration, formatSeconds, 95),
    numberColumn("effectiveness", "Effectiveness", (row) => row.result.damageEffectivenessPercent, formatPercent, 115),
    numberColumn("averageEffectiveness", "Avg dmg eff", (row) => row.result.averageDamageEffectivenessPercent, formatPercent, 110),
    numberColumn("effectivenessPerSecond", "Avg dmg eff/sec", (row) => row.result.averageDamageEffectivenessPerSecondPercent, formatPercent, 125),
    tagsColumn(),
    flagsColumn()
  ]);
}

function skillColumn() {
  return columnHelper.accessor((row) => row.view.gem.name, {
    id: "skill",
    header: "Skill",
    size: 255,
    minSize: 190,
    maxSize: 440,
    sortDescFirst: true,
    meta: { sticky: true }
  });
}

function damageColumn() {
  return columnHelper.display({
    id: "damage",
    header: "Damage",
    cell: ({ row }) => <DamageBadges result={row.original.result} />,
    enableSorting: false,
    size: 80,
    minSize: 62,
    maxSize: 140
  });
}

function numberColumn(
  id: string,
  header: string,
  value: (row: SkillRow) => number | undefined,
  format: (value: number | undefined) => string,
  size: number
) {
  return columnHelper.accessor(value, {
    id,
    header,
    cell: ({ getValue }) => format(getValue()),
    sortDescFirst: true,
    sortUndefined: "last",
    size,
    minSize: 72,
    maxSize: 260
  });
}

function tagsColumn() {
  return columnHelper.display({
    id: "tags",
    header: "Tags",
    cell: ({ row }) => {
      const view = row.original.view;
      return <ChipList title={`${view.gem.name} tags`} values={view.gem.tags} previewValues={overviewTags(view.gem.tags)} />;
    },
    enableSorting: false,
    size: 260,
    minSize: 120,
    maxSize: 420
  });
}

function flagsColumn() {
  return columnHelper.display({
    id: "flags",
    header: "Flags",
    cell: ({ row }) => {
      const view = row.original.view;
      return <ChipList title={`${view.gem.name} flags`} values={visibleFlags(view)} />;
    },
    enableSorting: false,
    size: 260,
    minSize: 120,
    maxSize: 420
  });
}

function SkillCell({ row, data, sorted, expanded, onToggle }: {
  row: SkillRow;
  data: GemDataPayload;
  sorted: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { view, result, settings } = row;
  return <th
    scope="row"
    data-column-id="skill"
    className={sorted ? "skill-cell sorted-column" : "skill-cell"}
    role="button"
    tabIndex={0}
    aria-label={`Configure ${view.gem.name}`}
    aria-expanded={expanded}
    onClick={onToggle}
    onKeyDown={(event) => {
      if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      onToggle();
    }}
  >
    <span className="skill-name">{view.gem.name}</span>
    <InfoTooltip view={view} result={result} data={data} />
    <span onClick={(event) => event.stopPropagation()}><SettingsTooltip settings={settings} defaultDescription={row.defaultDescription} /></span>
    <span className="skill-markers">
      {view.gem.transfigured ? <span className="marker-transfigured">T</span> : null}
      {view.gem.vaal ? <span className="marker-vaal">V</span> : null}
    </span>
  </th>;
}

function DamageBadges({ result }: { result: SkillResult }) {
  return <span className="damage-badges">{result.damageTypes.map((type) => <span key={type} className={`damage-${type}`}>{displayName(type).slice(0, 1)}</span>)}</span>;
}

function visibleFlags(view: SkillView): string[] {
  const hidden = new Set([...view.gem.tags, "Spell", "Attack", "Damage", "grants_active_skill"]);
  return view.flags.filter((flag) => !hidden.has(flag) && !/^(?:spell|attack)_(?:minimum|maximum)_/.test(flag) && !/^quality_display_/.test(flag));
}

function measureColumn(tableElement: HTMLTableElement, columnId: string): number | undefined {
  const sourceCells = [...tableElement.querySelectorAll<HTMLElement>("[data-column-id]")]
    .filter((cell) => cell.dataset.columnId === columnId);
  if (!sourceCells.length) return undefined;

  const measuringTable = document.createElement("table");
  measuringTable.className = "skill-table column-auto-measure";
  measuringTable.setAttribute("aria-hidden", "true");
  const head = document.createElement("thead");
  const body = document.createElement("tbody");
  measuringTable.append(head, body);

  for (const sourceCell of sourceCells) {
    const row = document.createElement("tr");
    const cell = sourceCell.cloneNode(true) as HTMLElement;
    cell.removeAttribute("data-column-id");
    row.append(cell);
    (sourceCell.closest("thead") ? head : body).append(row);
  }

  document.body.append(measuringTable);
  try {
    return Math.ceil(measuringTable.getBoundingClientRect().width) + 1;
  } finally {
    measuringTable.remove();
  }
}
