import { useEffect, useReducer, useState } from 'react';
import { subscribeATR, getATRState } from '../services/atrStore';
import type { ATRResult } from '../api';
import type { Position } from '../types';

interface ATRPanelProps {
  positions: Position[];
  onRefresh: () => void;
  onSaveThreshold: (ticker: string, threshold: number) => Promise<void>;
}

function fmt(n: number, dp = 2): string {
  return n.toFixed(dp);
}

function multColor(mult: number, threshold: number): string {
  if (mult >= threshold) return '#ef4444';
  if (mult >= threshold * 0.75) return '#f59e0b';
  return 'var(--color-text)';
}

export function ATRPanel({ positions, onRefresh, onSaveThreshold }: ATRPanelProps) {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribeATR(forceUpdate), []);

  const { results, status, progress, lastUpdated, failedTickers } = getATRState();

  // Per-ticker threshold inputs — initialized from positions, updated by user
  const [thresholdInputs, setThresholdInputs] = useState<Record<string, number>>({});
  const [savingTicker, setSavingTicker] = useState<string | null>(null);

  // Sync input values when positions change (new positions or threshold updates from DB)
  useEffect(() => {
    const next: Record<string, number> = {};
    for (const p of positions) {
      if (!(p.ticker in next)) {
        next[p.ticker] = p.atrSellThreshold ?? 7;
      }
    }
    setThresholdInputs(prev => {
      // Only update entries that haven't been locally edited to avoid overwriting in-flight edits
      const merged = { ...prev };
      for (const [ticker, val] of Object.entries(next)) {
        if (!(ticker in merged)) merged[ticker] = val;
      }
      return merged;
    });
  }, [positions]);

  const tickers = [...new Set(positions.map(p => p.ticker))];
  const estSeconds = tickers.length * (13_000 / 1000);
  const alerts = results.filter((r: ATRResult) => {
    const threshold = thresholdInputs[r.ticker] ?? 7;
    return r.atrMult >= threshold;
  });

  const handleSave = async (ticker: string) => {
    const threshold = thresholdInputs[ticker] ?? 7;
    setSavingTicker(ticker);
    try {
      await onSaveThreshold(ticker, threshold);
    } finally {
      setSavingTicker(null);
    }
  };

  return (
    <div className="space-y-3">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wider">
          Current ATR Extensions
        </h3>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-[var(--color-text-muted)]">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {failedTickers.length > 0 && (
            <span className="text-xs text-amber-400" title={failedTickers.join(', ')}>
              {failedTickers.length} failed
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={status === 'loading' || tickers.length === 0}
            className="px-3 py-1.5 text-xs rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[var(--color-bg-card)] border-[var(--color-accent)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-text-muted)]"
          >
            {status === 'loading' ? progress : '↻ Refresh ATR Data'}
          </button>
        </div>
      </div>

      {/* ── Loading hint ── */}
      {status === 'loading' && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Fetching candle data from Polygon — ~{Math.ceil(estSeconds)}s total ({tickers.length} ticker{tickers.length !== 1 ? 's' : ''})
        </p>
      )}

      {/* ── Alert strip ── */}
      {alerts.length > 0 && (
        <div className="space-y-1">
          {alerts.map((r: ATRResult) => {
            const threshold = thresholdInputs[r.ticker] ?? 7;
            return (
              <div
                key={r.ticker}
                className="px-3 py-2 rounded text-xs border bg-red-900/20 border-red-700/50 text-[var(--color-red)]"
              >
                ⚠ {r.ticker}: {fmt(r.atrMult)}× ATR — at or above sell threshold ({fmt(threshold, 1)}×)
              </div>
            );
          })}
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg overflow-x-auto">
        {results.length === 0 && status !== 'loading' ? (
          <div className="p-6 text-center text-xs text-[var(--color-text-muted)]">
            {tickers.length === 0
              ? 'No open positions.'
              : 'Click Refresh ATR Data to calculate extensions.'}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--color-accent)] text-[var(--color-text-muted)] uppercase tracking-wider">
                <th className="px-3 py-2 text-left">Ticker</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">EMA 21</th>
                <th className="px-3 py-2 text-right">ATR</th>
                <th className="px-3 py-2 text-right">ATR %</th>
                <th className="px-3 py-2 text-right">Ext %</th>
                <th className="px-3 py-2 text-right">ATR Mult</th>
                <th className="px-3 py-2 text-left">Band</th>
                <th className="px-3 py-2 text-left w-32"></th>
                <th className="px-3 py-2 text-left">Sell Threshold</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r: ATRResult, i: number) => {
                const threshold = thresholdInputs[r.ticker] ?? 7;
                const barWidth = Math.min(Math.abs(r.atrMult) / 10 * 100, 100);
                const color = multColor(r.atrMult, threshold);
                return (
                  <tr
                    key={r.ticker}
                    className={`border-b border-[var(--color-accent)]/30 ${i % 2 !== 0 ? 'bg-[var(--color-bg-primary)]/30' : ''}`}
                  >
                    <td className="px-3 py-2.5 font-semibold font-mono text-[var(--color-text)] tracking-wide">
                      {r.ticker}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[var(--color-text-muted)]">
                      ${fmt(r.currentPrice)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[var(--color-text-muted)]">
                      ${fmt(r.ema21)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[var(--color-text-muted)]">
                      ${fmt(r.atr)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[var(--color-text-muted)]">
                      {fmt(r.atrPct)}%
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-medium"
                      style={{ color: r.extPct >= 0 ? '#10b981' : '#ef4444' }}>
                      {r.extPct >= 0 ? '+' : ''}{fmt(r.extPct)}%
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold"
                      style={{ color }}>
                      {fmt(r.atrMult)}×
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded text-xs font-semibold"
                        style={{ color: r.band.color, background: r.band.color + '20', border: `1px solid ${r.band.color}50` }}>
                        {r.band.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="h-2 rounded-full bg-[var(--color-bg-primary)] overflow-hidden w-28">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${barWidth}%`, background: r.band.color }}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={thresholdInputs[r.ticker] ?? 7}
                          onChange={e => setThresholdInputs(prev => ({ ...prev, [r.ticker]: Number(e.target.value) }))}
                          className="w-16 px-2 py-1 text-xs rounded border bg-[var(--color-bg-primary)] border-[var(--color-accent)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-highlight)]"
                        />
                        <span className="text-xs text-[var(--color-text-muted)]">×</span>
                        <button
                          onClick={() => handleSave(r.ticker)}
                          disabled={savingTicker === r.ticker}
                          className="px-2 py-1 text-xs rounded border transition-colors disabled:opacity-40 bg-[var(--color-bg-card)] border-[var(--color-accent)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-text-muted)]"
                        >
                          {savingTicker === r.ticker ? '…' : 'Save'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
