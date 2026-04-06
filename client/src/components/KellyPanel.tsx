import type { Trade, AppConfig } from '../types';
import { calcKelly } from '../utils/metrics';
import { fmt, fmtP, fmtD } from '../utils/formatters';
import { StatCard } from './StatCard';

interface KellyPanelProps {
  trades: Trade[];
  config: AppConfig;
  currentEquity: number;
}

export function KellyPanel({ trades, config, currentEquity }: KellyPanelProps) {
  const result = calcKelly(trades, config.targetPositions);

  if (!result.kellyValid) {
    return (
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-6 text-center">
        <div className="text-[var(--color-text-muted)] text-sm mb-2">Insufficient data</div>
        <div className="text-lg font-semibold text-[var(--color-text)] mb-3">
          Progressive exposure governs
        </div>
        <div className="text-[var(--color-text-muted)] text-sm">
          {trades.length} of 10 trades completed
        </div>
        <div className="mt-4 mx-auto max-w-xs bg-[var(--color-bg-primary)] rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-[var(--color-highlight)] rounded-full transition-all"
            style={{ width: `${Math.min(trades.length / 10 * 100, 100)}%` }}
          />
        </div>
      </div>
    );
  }

  const { halfKelly, deployCeiling, winRate, rRatio } = result;
  const uncappedCeiling = halfKelly * config.targetPositions;
  const wasCapped = uncappedCeiling > 150;
  const ceilingDollars = deployCeiling / 100 * currentEquity;
  const marginJustified = deployCeiling > 100;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard
          label="Half-Kelly / Trade"
          value={fmtP(halfKelly)}
          colorClass="text-[var(--color-highlight)]"
          sub={`Win rate: ${fmtP(winRate)} · R: ${fmt(rRatio)}`}
        />
        <StatCard
          label="Deploy Ceiling"
          value={fmtP(deployCeiling)}
          colorClass={deployCeiling > 100 ? 'text-yellow-400' : 'text-[var(--color-green)]'}
          sub={fmtD(ceilingDollars)}
        />
        <StatCard
          label="Margin"
          value={marginJustified ? 'Permitted' : 'Not justified'}
          colorClass={marginJustified ? 'text-[var(--color-green)]' : 'text-[var(--color-text-muted)]'}
          sub={marginJustified ? `Ceiling > 100%` : 'Ceiling ≤ 100%'}
        />
        <StatCard
          label="Hard Cap"
          value={wasCapped ? 'Applied' : 'Not hit'}
          colorClass={wasCapped ? 'text-yellow-400' : 'text-[var(--color-text-muted)]'}
          sub={wasCapped ? `Uncapped: ${fmtP(uncappedCeiling)}` : 'Within limits'}
        />
      </div>

      <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-3 text-xs text-[var(--color-text-muted)]">
        <span className="text-[var(--color-text)]">How to read:</span> Half-Kelly is the suggested
        allocation per trade as a fraction of equity. Deployment ceiling ={' '}
        <span className="font-mono">halfKelly × {config.targetPositions} positions</span>, capped at 150%.
        Margin is permitted when ceiling exceeds 100% (Kelly expects full deployment plus leverage).
      </div>
    </div>
  );
}
