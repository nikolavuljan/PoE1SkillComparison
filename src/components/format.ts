export function formatNumber(value: number | undefined, digits = 0): string {
  if (value === undefined || !Number.isFinite(value) || Math.abs(value) < 0.000001) return "–";
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: digits || (Number.isInteger(value) ? 0 : 2) });
}

export function formatPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "–";
  return `${Math.abs(value) < 0.000001 ? "0" : formatNumber(value, 2)}%`;
}

export function formatSeconds(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) || value <= 0 ? "–" : `${formatNumber(value, 3)}s`;
}

export function formatCost(cost: Record<string, number> | undefined): string {
  if (!cost) return "–";
  const entries = Object.entries(cost);
  return entries.length ? entries.map(([resource, value]) => `${formatNumber(value, 2)} ${resource}`).join(", ") : "–";
}
