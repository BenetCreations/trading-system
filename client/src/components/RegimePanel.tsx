import type { Trade, AppConfig } from '../types';
import { StatCard } from './StatCard';

interface RegimePanelProps {
  config: AppConfig;
  trades: Trade[];
}

function kellyAuthority(n: number): { label: string; colorClass: string } {
  if (n === 0) return { label: 'No data', colorClass: 'text-[var(--color-text-muted)]' };
  if (n <= 9) return { label: 'Silent — Kelly method governs', colorClass: 'text-[var(--color-text-muted)]' };
  if (n <= 12) return { label: 'Informational — caps new adds', colorClass: 'text-blue-400' };
  if (n <= 15) return { label: 'Partial — caps new adds, approves replacements', colorClass: 'text-yellow-400' };
  if (n <= 20) return { label: 'Primary — Kelly fading', colorClass: 'text-orange-400' };
  return { label: 'Full Control', colorClass: 'text-[var(--color-green)]' };
}

export function RegimePanel({ config, trades }: RegimePanelProps) {
  const regimeTrades = trades.filter(t => t.regime === config.currentRegime);
  const authority = kellyAuthority(regimeTrades.length);

  const marginPermitted = config.marketStage === 2;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <StatCard
          label="Regime"
          value={`Regime ${config.currentRegime}`}
          colorClass={config.currentRegime === 1 ? 'text-[var(--color-green)]' : 'text-yellow-400'}
        />
        <StatCard
          label="Market Stage"
          value={`Stage ${config.marketStage}`}
          colorClass="text-[var(--color-text)]"
        />
        <StatCard
          label="Regime Trades"
          value={String(regimeTrades.length)}
          sub={`of ${trades.length} total`}
        />
        <StatCard
          label="Kelly Authority"
          value={authority.label}
          colorClass={authority.colorClass}
          sub={`${regimeTrades.length} trades in regime`}
        />
        <StatCard
          label="Margin"
          value={marginPermitted ? 'Permitted' : 'Blocked'}
          colorClass={marginPermitted ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]'}
          sub={`Stage ${config.marketStage}`}
        />
      </div>

      <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-3 text-xs text-[var(--color-text-muted)] space-y-1">
        <div>
          <span className="text-[var(--color-text)]">Kelly Authority Scale:</span>{' '}
          1–9 trades: Silent · 10–12: Informational · 13–15: Partial · 16–20: Primary · 21+: Full Control
        </div>
        <div>
          <span className="text-[var(--color-text)]">Margin:</span>{' '}
          Permitted at Stage 2. Blocked at Stage 3–4.
        </div>
      </div>
    </div>
  );
}
