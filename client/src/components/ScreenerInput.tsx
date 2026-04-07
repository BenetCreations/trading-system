import { useState, useRef, useEffect, type FormEvent } from 'react';
import type { EvaluationEnrichment } from '../api';
import { buttonLavender } from '../utils/buttonStyles';

interface ScreenerInputProps {
  onEvaluate: (ticker: string, options?: { enrichment?: EvaluationEnrichment }) => void;
  onBatchEvaluate: (tickers: string[]) => void;
  onCancel: () => void;
  loading: boolean;
  error: string | null;
  activeTicker: string | null;
}

function parseTickers(input: string): string[] {
  return [...new Set(
    input.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
  )];
}

export function ScreenerInput({ onEvaluate, onBatchEvaluate, onCancel, loading, error, activeTicker }: ScreenerInputProps) {
  const [ticker, setTicker] = useState(activeTicker ?? '');
  const [enrichOpen, setEnrichOpen] = useState(false);

  // Enrichment fields
  const [baseHigh, setBaseHigh] = useState('');
  const [baseLow, setBaseLow] = useState('');
  const [baseCount, setBaseCount] = useState('');
  const [sectorETF, setSectorETF] = useState('');
  const [insiderBuying, setInsiderBuying] = useState('');
  const [pbRatio, setPbRatio] = useState('');
  const [ipoDate, setIpoDate] = useState('');
  const [marketCap, setMarketCap] = useState('');
  const [optionImpliedMove, setOptionImpliedMove] = useState('');

  const tickers = parseTickers(ticker);
  const isMulti = tickers.length > 1;

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [ticker]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (tickers.length === 0 || loading) return;

    if (isMulti) {
      onBatchEvaluate(tickers);
      setTicker('');
      return;
    }

    const enrichment: EvaluationEnrichment = {};
    if (baseHigh) enrichment.baseHigh = parseFloat(baseHigh);
    if (baseLow) enrichment.baseLow = parseFloat(baseLow);
    if (baseCount) enrichment.baseCount = parseInt(baseCount, 10);
    if (sectorETF.trim()) enrichment.sectorETF = sectorETF.trim();
    if (insiderBuying.trim()) enrichment.insiderBuying = insiderBuying.trim();
    if (pbRatio.trim()) enrichment.pbRatio = pbRatio.trim();
    if (ipoDate.trim()) enrichment.ipoDate = ipoDate.trim();
    if (marketCap.trim()) enrichment.marketCap = marketCap.trim();
    if (optionImpliedMove.trim()) enrichment.optionImpliedMove = optionImpliedMove.trim();

    onEvaluate(tickers[0], Object.keys(enrichment).length > 0 ? { enrichment } : undefined);
  };

  const inputClass = 'bg-[var(--color-bg-primary)] border border-[var(--color-accent)] rounded px-3 py-1.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-highlight)] w-full';
  const labelClass = 'text-xs text-[var(--color-text-muted)] mb-1 block';

  return (
    <div className="max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Primary ticker input */}
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-6">
          <label className="block text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
            Ticker Symbol
          </label>
          <div className="flex gap-3">
            <textarea
              ref={textareaRef}
              rows={1}
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (tickers.length > 0 && !loading) handleSubmit(e as unknown as FormEvent);
                }
              }}
              placeholder={isMulti ? '' : 'AAPL'}
              autoFocus
              disabled={loading}
              className={`flex-1 bg-[var(--color-bg-primary)] border border-[var(--color-accent)] rounded-lg px-4 py-3 font-mono font-bold text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-highlight)] uppercase disabled:opacity-50 resize-none overflow-hidden leading-tight ${isMulti ? 'text-base tracking-wide' : 'text-2xl tracking-widest'}`}
            />
            <button
              type="submit"
              disabled={loading || tickers.length === 0}
              className={`px-6 py-3 text-sm font-semibold rounded-lg flex items-center gap-2 whitespace-nowrap ${buttonLavender}`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4l-3 3-3-3h4z" />
                  </svg>
                  Evaluating…
                </>
              ) : isMulti ? (
                `Evaluate ${tickers.length} Tickers`
              ) : (
                'Evaluate'
              )}
            </button>
            {loading && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-3 text-sm text-[var(--color-text-muted)] border border-[var(--color-accent)] rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-text-muted)] transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="mt-2 text-xs text-[var(--color-text-muted)] opacity-60">
            Separate multiple tickers with commas
          </div>

          {/* Loading status */}
          {loading && (
            <div className="mt-4 flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-highlight)] animate-pulse" />
              Fetching candle data and running evaluation pipeline… (15–30s)
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-3 text-sm text-[var(--color-red)] bg-[var(--color-bg-primary)] border border-[var(--color-red)]/30 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Collapsible enrichment */}
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => !isMulti && setEnrichOpen(o => !o)}
            className={`w-full flex items-center justify-between px-5 py-3 text-sm text-[var(--color-text-muted)] transition-colors ${isMulti ? 'cursor-default opacity-60' : 'hover:text-[var(--color-text)]'}`}
          >
            <span>
              <span className="mr-2 text-xs">{!isMulti && enrichOpen ? '▼' : '▶'}</span>
              Additional context
            </span>
            <span className="text-xs opacity-50">
              {isMulti ? 'available for single-ticker evaluations only' : 'optional — sent to Claude'}
            </span>
          </button>

          {enrichOpen && !isMulti && (
            <div className="px-5 pb-5 border-t border-[var(--color-accent)]">
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className={labelClass}>Base High ($)</label>
                  <input type="number" step="0.01" value={baseHigh} onChange={e => setBaseHigh(e.target.value)} placeholder="0.00" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Base Low ($)</label>
                  <input type="number" step="0.01" value={baseLow} onChange={e => setBaseLow(e.target.value)} placeholder="0.00" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Base Count</label>
                  <input type="number" min="1" max="5" value={baseCount} onChange={e => setBaseCount(e.target.value)} placeholder="1" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Sector ETF</label>
                  <input type="text" value={sectorETF} onChange={e => setSectorETF(e.target.value.toUpperCase())} placeholder="XLK" className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Insider Buying Notes</label>
                  <input type="text" value={insiderBuying} onChange={e => setInsiderBuying(e.target.value)} placeholder="e.g. CEO bought $2M on 2026-03-15" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>P/B Ratio</label>
                  <input type="text" value={pbRatio} onChange={e => setPbRatio(e.target.value)} placeholder="e.g. 3.2x (5yr avg 4.1x)" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>IPO / US Listing Date</label>
                  <input type="text" value={ipoDate} onChange={e => setIpoDate(e.target.value)} placeholder="e.g. 2020-09-30" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Market Cap</label>
                  <input type="text" value={marketCap} onChange={e => setMarketCap(e.target.value)} placeholder="e.g. $8.2B" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Option-Implied Move</label>
                  <input type="text" value={optionImpliedMove} onChange={e => setOptionImpliedMove(e.target.value)} placeholder="e.g. ±6.5% for earnings" className={inputClass} />
                </div>
              </div>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
