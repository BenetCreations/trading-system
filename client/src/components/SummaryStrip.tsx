import type { Trade, Position, AppConfig } from '../types';
import type { OpenMetrics } from '../utils/metrics';
import { calcEquity } from '../utils/metrics';
import { fmtD, fmtP, fmt, pctColor, ddColor } from '../utils/formatters';

interface SummaryStripProps {
  trades: Trade[];
  positions: Position[];
  config: AppConfig;
  openMetrics: OpenMetrics;
  /** Count of danger + warning alerts (may exclude session-dismissed min-size warnings). */
  alertCount: number;
  onOpenConfig: () => void;
}

export function SummaryStrip({ trades, positions, config, openMetrics, alertCount, onOpenConfig }: SummaryStripProps) {
  const equityPoints = calcEquity(trades, config.startingEquity);
  const last = equityPoints[equityPoints.length - 1];
  const currentEquity = last?.equity ?? config.startingEquity;
  const currentDrawdown = last?.drawdown ?? 0;
  const cumR = trades.reduce((s, t) => s + t.rMultiple, 0);
  const winRate = trades.length
    ? (trades.filter(t => t.rMultiple > 0).length / trades.length) * 100
    : null;
  return (
    <div className="sticky top-0 z-10 bg-[var(--color-bg-card)] border-b border-[var(--color-accent)] px-6 py-2 flex flex-wrap gap-x-6 gap-y-1 items-center text-sm">
      <Item label="Equity" value={fmtD(currentEquity)} />
      <Item
        label="Drawdown"
        value={currentDrawdown > 0 ? fmtP(currentDrawdown) : '0.0%'}
        colorClass={ddColor(currentDrawdown)}
      />
      <Item
        label="Cum R"
        value={trades.length ? fmt(cumR) + 'R' : '—'}
        colorClass={pctColor(cumR)}
      />
      <Item
        label="Win Rate"
        value={winRate !== null ? fmtP(winRate) : '—'}
        colorClass={winRate !== null ? (winRate >= 50 ? 'text-[var(--color-green)]' : 'text-yellow-400') : undefined}
      />
      <Item label="Open" value={String(positions.length)} />
      {positions.length > 0 && (
        <Item
          label="Deploy"
          value={fmtP(openMetrics.totalDeployment)}
          colorClass={openMetrics.totalDeployment > 100 ? 'text-yellow-400' : undefined}
        />
      )}
      {positions.length > 0 && (
        <Item
          label="Risk"
          value={fmtP(openMetrics.totalOpenRiskPct)}
          colorClass={openMetrics.totalOpenRiskPct > 10 ? 'text-[var(--color-red)]' : undefined}
        />
      )}
      <Item label="Regime" value={String(config.currentRegime)} />
      {alertCount > 0 && (
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Alerts:</span>
          <span className="font-mono text-sm font-bold text-amber-300 tabular-nums leading-none">
            {alertCount}
          </span>
        </div>
      )}
      <div className="ml-auto">
        <button
          onClick={onOpenConfig}
          title="Settings"
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors text-base leading-none"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}

function Item({ label, value, colorClass }: { label: string; value: string; colorClass?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">{label}</span>
      <span className={`font-mono font-medium ${colorClass ?? 'text-[var(--color-text)]'}`}>{value}</span>
    </div>
  );
}
