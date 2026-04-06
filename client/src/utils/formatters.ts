export function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtD(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function fmtP(n: number): string {
  return n.toFixed(1) + '%';
}

export function pctColor(n: number): string {
  if (n > 0) return 'text-[var(--color-green)]';
  if (n < 0) return 'text-[var(--color-red)]';
  return 'text-gray-400';
}

// pct is the absolute drawdown magnitude (positive = deeper drawdown)
export function ddColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs >= 8) return 'text-[var(--color-red)] font-bold';
  if (abs >= 7) return 'text-[var(--color-red)]';
  if (abs >= 5) return 'text-orange-400';
  if (abs >= 3) return 'text-yellow-400';
  return 'text-[var(--color-green)]';
}
