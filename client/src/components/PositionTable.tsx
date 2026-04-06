import { useState } from 'react';
import type { Position } from '../types';
import type { OpenMetrics } from '../utils/metrics';
import { fmt, fmtD, fmtP, pctColor } from '../utils/formatters';
import { StatCard } from './StatCard';

interface PositionTableProps {
  positions: Position[];
  openMetrics: OpenMetrics;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, updates: Partial<Position>) => Promise<void>;
  onRefreshPrices: () => Promise<{ failed: string[] }>;
}

function capStatus(pct: number, cap: number): { label: string; colorClass: string } {
  if (pct > cap) return { label: '⚑ over cap', colorClass: 'text-[var(--color-red)]' };
  if (pct > cap - 5) return { label: '▲ near cap', colorClass: 'text-yellow-400' };
  return { label: '', colorClass: '' };
}

export function PositionTable({ positions, openMetrics, onDelete, onRefreshPrices }: PositionTableProps) {
  const om = openMetrics;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [failedTickers, setFailedTickers] = useState<string[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const handleRefreshPrices = async () => {
    setIsRefreshing(true);
    setFailedTickers([]);
    try {
      const { failed } = await onRefreshPrices();
      setFailedTickers(failed);
      setLastRefreshed(new Date());
    } catch {
      // error is surfaced upstream (usePositions sets error state)
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefreshPrices}
            disabled={isRefreshing}
            className="px-3 py-1.5 text-xs bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded hover:border-[var(--color-text-muted)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh Prices'}
          </button>
          {lastRefreshed && !isRefreshing && (
            <span className="text-xs text-[var(--color-text-muted)]">
              Last refreshed: {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        {failedTickers.length > 0 && (
          <span className="text-xs text-yellow-400">
            Failed to refresh: {failedTickers.join(', ')}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg overflow-x-auto mb-4">
        {positions.length === 0 ? (
          <div className="p-6 text-center text-[var(--color-text-muted)] text-sm">No open positions.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-accent)] text-[var(--color-text-muted)] text-xs uppercase">
                <th className="px-3 py-2 text-left">Ticker</th>
                <th className="px-3 py-2 text-left">Entry Date</th>
                <th className="px-3 py-2 text-right">Entry</th>
                <th className="px-3 py-2 text-right">Current</th>
                <th className="px-3 py-2 text-right">Stop</th>
                <th className="px-3 py-2 text-right">Shares</th>
                <th className="px-3 py-2 text-center">Tr.</th>
                <th className="px-3 py-2 text-left">Sector</th>
                <th className="px-3 py-2 text-left">Setup</th>
                <th className="px-3 py-2 text-center">Tier</th>
                <th className="px-3 py-2 text-left">Earnings</th>
                <th className="px-3 py-2 text-right">Unreal. P&L</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p, i) => {
                const unrealizedPL = (p.currentPrice - p.entryPrice) * p.shares;
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/20 transition-colors ${i % 2 === 0 ? '' : 'bg-[var(--color-bg-primary)]/30'}`}
                  >
                    <td className="px-3 py-2 font-semibold">{p.ticker}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)] font-mono text-xs">{p.entryDate}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(p.entryPrice)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(p.currentPrice)}</td>
                    <td className="px-3 py-2 text-right font-mono text-[var(--color-text-muted)]">{fmt(p.stopPrice)}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.shares.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center text-[var(--color-text-muted)]">{p.tranche}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)] text-xs">{p.sector}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)] text-xs">{p.setupType}</td>
                    <td className="px-3 py-2 text-center text-[var(--color-text-muted)]">{p.tier}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)] text-xs">{p.earningsDate ?? '—'}</td>
                    <td className={`px-3 py-2 text-right font-mono ${pctColor(unrealizedPL)}`}>{fmtD(unrealizedPL)}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => onDelete(p.id)}
                        className="text-[var(--color-text-muted)] hover:text-[var(--color-red)] text-xs transition-colors"
                        title="Delete position"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Portfolio summary */}
      {positions.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <StatCard
              label="Deployment"
              value={fmtP(om.totalDeployment)}
              colorClass={om.totalDeployment > 100 ? 'text-yellow-400' : 'text-[var(--color-text)]'}
              sub={`${positions.length} positions`}
            />
            <StatCard
              label="Open Risk $"
              value={fmtD(om.totalOpenRisk)}
              colorClass={om.totalOpenRiskPct > 10 ? 'text-[var(--color-red)]' : 'text-[var(--color-text)]'}
            />
            <StatCard
              label="Open Risk %"
              value={fmtP(om.totalOpenRiskPct)}
              colorClass={om.totalOpenRiskPct > 10 ? 'text-[var(--color-red)]' : om.totalOpenRiskPct > 6 ? 'text-yellow-400' : 'text-[var(--color-green)]'}
              sub={`Regime cap: ${om.sectorCap}% / sector`}
            />
          </div>

          {/* Sector breakdown */}
          {Object.keys(om.sectorBreakdown).length > 0 && (
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-3">
              <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
                Sector Breakdown <span className="normal-case">(cap: {om.sectorCap}%)</span>
              </div>
              <div className="space-y-1">
                {Object.entries(om.sectorBreakdown)
                  .sort(([, a], [, b]) => b.percentOfEquity - a.percentOfEquity)
                  .map(([sector, data]) => {
                    const status = capStatus(data.percentOfEquity, om.sectorCap);
                    const barPct = Math.min(data.percentOfEquity / om.sectorCap * 100, 100);
                    const barColor = data.percentOfEquity > om.sectorCap
                      ? 'bg-[var(--color-red)]'
                      : data.percentOfEquity > om.sectorCap - 5
                        ? 'bg-yellow-500'
                        : 'bg-[var(--color-accent)]';
                    return (
                      <div key={sector}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-[var(--color-text-muted)]">{sector}</span>
                          <span className="font-mono">
                            {fmtD(data.dollarExposure)} · {fmtP(data.percentOfEquity)}
                            {status.label && (
                              <span className={`ml-2 ${status.colorClass}`}>{status.label}</span>
                            )}
                          </span>
                        </div>
                        <div className="h-1 bg-[var(--color-bg-primary)] rounded overflow-hidden">
                          <div
                            className={`h-full rounded transition-all ${barColor}`}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
