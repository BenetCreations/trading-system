interface StatCardProps {
  label: string;
  value: string;
  colorClass?: string;
  sub?: string;
}

export function StatCard({ label, value, colorClass, sub }: StatCardProps) {
  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded p-3 min-w-0">
      <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-lg font-mono font-semibold truncate ${colorClass ?? 'text-[var(--color-text)]'}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-[var(--color-text-muted)] mt-1 truncate">{sub}</div>}
    </div>
  );
}
