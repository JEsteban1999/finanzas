function decimal(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${decimal(rate * 100)}%`;
}

export function formatDelta(pct: number | null): string {
  if (pct === null) return "nuevo";
  return `${pct > 0 ? "+" : ""}${decimal(pct)}%`;
}
