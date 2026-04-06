import type { Trade } from '../types';
import type { TradeMetrics } from '../utils/metrics';
import { fmt, fmtD, fmtP, pctColor } from '../utils/formatters';
import { StatCard } from './StatCard';

interface TradeTableProps {
  trades: Trade[];
  metrics: TradeMetrics;
  onRemove: (id: string) => Promise<void>;
}

function rColor(r: number): string {
  return r > 0 ? 'text-[var(--color-green)]' : r < 0 ? 'text-[var(--color-red)]' : 'text-gray-400';
}

function streakLabel(streak: number): string {
  if (streak === 0) return '—';
  return Math.abs(streak) + (streak > 0 ? 'W' : 'L');
}

function streakColor(streak: number): string {
  if (streak > 0) return 'text-[var(--color-green)]';
  if (streak < 0) return 'text-[var(--color-red)]';
  return 'text-gray-400';
}

export function TradeTable({ trades, metrics, onRemove }: TradeTableProps) {
  const m = metrics;

  return (
    <div>
      {/* Table */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg overflow-x-auto mb-4">
        {trades.length === 0 ? (
          <div className="p-6 text-center text-[var(--color-text-muted)] text-sm">No trades logged yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-accent)] text-[var(--color-text-muted)] text-xs uppercase">
                <th className="px-3 py-2 text-left">Exit</th>
                <th className="px-3 py-2 text-left">Ticker</th>
                <th className="px-3 py-2 text-left">Setup</th>
                <th className="px-3 py-2 text-center">Tier</th>
                <th className="px-3 py-2 text-right">Entry</th>
                <th className="px-3 py-2 text-right">Stop</th>
                <th className="px-3 py-2 text-right">Exit</th>
                <th className="px-3 py-2 text-right">Shares</th>
                <th className="px-3 py-2 text-right">R</th>
                <th className="px-3 py-2 text-right">P&L</th>
                <th className="px-3 py-2 text-right">%</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => (
                <tr
                  key={t.id}
                  className={`border-b border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/20 transition-colors ${i % 2 === 0 ? '' : 'bg-[var(--color-bg-primary)]/30'}`}
                >
                  <td className="px-3 py-2 text-[var(--color-text-muted)] font-mono text-xs">{t.exitDate}</td>
                  <td className="px-3 py-2 font-semibold">{t.ticker}</td>
                  <td className="px-3 py-2 text-[var(--color-text-muted)] text-xs">{t.setupType}</td>
                  <td className="px-3 py-2 text-center text-[var(--color-text-muted)]">{t.tier}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(t.entryPrice)}</td>
                  <td className="px-3 py-2 text-right font-mono text-[var(--color-text-muted)]">{fmt(t.stopPrice)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(t.exitPrice)}</td>
                  <td className="px-3 py-2 text-right font-mono">{t.shares.toLocaleString()}</td>
                  <td className={`px-3 py-2 text-right font-mono ${rColor(t.rMultiple)}`}>{fmt(t.rMultiple)}R</td>
                  <td className={`px-3 py-2 text-right font-mono ${pctColor(t.dollarPL)}`}>{fmtD(t.dollarPL)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${pctColor(t.percentGain)}`}>{fmtP(t.percentGain)}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => onRemove(t.id)}
                      className="text-[var(--color-text-muted)] hover:text-[var(--color-red)] text-xs transition-colors"
                      title="Delete trade"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Metrics summary */}
      {trades.length > 0 && (
        <div className="space-y-4">
          {/* Key stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            <StatCard
              label="Cum R"
              value={fmt(m.cumR) + 'R'}
              colorClass={pctColor(m.cumR)}
              sub={`${m.totalTrades} trades`}
            />
            <StatCard
              label="Win Rate"
              value={fmtP(m.winRate)}
              colorClass={m.winRate >= 50 ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]'}
              sub={`L10: ${m.totalTrades >= 10 ? fmtP(m.winRateLast10) : '—'}`}
            />
            <StatCard
              label="Avg Win"
              value={fmtP(m.avgWin)}
              colorClass="text-[var(--color-green)]"
              sub={`L5: ${fmtP(m.avgWinLast5)} · L10: ${fmtP(m.avgWinLast10)}`}
            />
            <StatCard
              label="Avg Loss"
              value={fmtP(m.avgLoss)}
              colorClass="text-[var(--color-red)]"
              sub={`L5: ${fmtP(m.avgLossLast5)} · L10: ${fmtP(m.avgLossLast10)}`}
            />
            <StatCard
              label="R Ratio"
              value={fmt(m.rRatio)}
              sub={`W: ${fmt(m.avgRWin)}R · L: ${fmt(m.avgRLoss)}R`}
            />
            <StatCard
              label="Streak"
              value={streakLabel(m.streak)}
              colorClass={streakColor(m.streak)}
            />
            <StatCard
              label="Rule 4"
              value={fmtP(m.rule4Threshold)}
              colorClass="text-blue-400"
              sub={m.rule4Window}
            />
          </div>

          {/* Breakdowns */}
          {(Object.keys(m.winRateBySetup).length > 0 || Object.keys(m.winRateByTier).length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.keys(m.winRateBySetup).length > 0 && (
                <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-3">
                  <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-2">By Setup</div>
                  {Object.entries(m.winRateBySetup).map(([setup, data]) => (
                    <div key={setup} className="flex justify-between items-center py-1 border-b border-[var(--color-accent)]/20 last:border-0 text-xs">
                      <span className="text-[var(--color-text-muted)]">{setup}</span>
                      <span className="font-mono">
                        {data.total} ·{' '}
                        <span className={data.rate >= 50 ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]'}>
                          {fmtP(data.rate)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {Object.keys(m.winRateByTier).length > 0 && (
                <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-3">
                  <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-2">By Tier</div>
                  {Object.entries(m.winRateByTier).map(([tier, data]) => (
                    <div key={tier} className="flex justify-between items-center py-1 border-b border-[var(--color-accent)]/20 last:border-0 text-xs">
                      <span className="text-[var(--color-text-muted)]">Tier {tier}</span>
                      <span className="font-mono">
                        {data.total} ·{' '}
                        <span className={data.rate >= 50 ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]'}>
                          {fmtP(data.rate)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
