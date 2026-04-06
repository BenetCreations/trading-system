import { useEffect, useReducer } from 'react';
import {
  subscribeQueue, getQueueState,
  cancelQueue, dismissCurrentResult, resetQueue,
  type QueueState,
} from '../services/queueRunner';
import { EvaluationResult } from './EvaluationResult';

// ─── Hook: subscribe to the module-level queue store ─────────────────────────

function useQueueStore(): QueueState {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribeQueue(forceUpdate), []);
  return getQueueState();
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface RevalQueueProps {
  onDone: () => void;       // called after user clicks Clear (resets App state)
  onBackToHistory: () => void;
}

// ─── Verdict count badge ─────────────────────────────────────────────────────

function VerdictCount({ verdict, count }: { verdict: string; count: number }) {
  if (count === 0) return null;
  const cls: Record<string, string> = {
    'QUALIFIES': 'text-green-300',
    'DOES NOT QUALIFY': 'text-[var(--color-red)]',
    'WATCHLIST': 'text-amber-300',
  };
  return (
    <span className={cls[verdict] ?? 'text-[var(--color-text-muted)]'}>
      {count} {verdict}
    </span>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RevalQueue({ onDone, onBackToHistory }: RevalQueueProps) {
  const q = useQueueStore();

  function handleClear() {
    resetQueue();
    onDone();
  }

  function handleBackToHistory() {
    resetQueue();
    onBackToHistory();
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  if (q.status === 'done') {
    const qualifies = q.results.filter(r => r.verdict === 'QUALIFIES').length;
    const doesNotQualify = q.results.filter(r => r.verdict === 'DOES NOT QUALIFY').length;
    const watchlist = q.results.filter(r => r.verdict === 'WATCHLIST').length;
    const unknown = q.results.filter(r => r.verdict === null).length;
    const completed = q.results.length;
    const wasCancelled = q.tickers.length > completed + q.failures.length;
    const skipped = q.tickers.length - completed - q.failures.length;

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-6">
          <div className="text-sm font-semibold text-[var(--color-text)] mb-1">
            {completed} evaluation{completed !== 1 ? 's' : ''} complete
            {wasCancelled && skipped > 0 && (
              <span className="ml-2 font-normal text-amber-300">— cancelled, {skipped} skipped</span>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mt-2">
            <VerdictCount verdict="QUALIFIES" count={qualifies} />
            <VerdictCount verdict="WATCHLIST" count={watchlist} />
            <VerdictCount verdict="DOES NOT QUALIFY" count={doesNotQualify} />
            {unknown > 0 && (
              <span className="text-[var(--color-text-muted)]">{unknown} unknown</span>
            )}
          </div>

          {q.failures.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[var(--color-accent)]">
              <div className="text-sm text-[var(--color-red)] mb-1">
                {q.failures.length} failed:
              </div>
              {q.failures.map(f => (
                <div key={f.ticker} className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  <span className="font-mono font-semibold text-[var(--color-text)]">{f.ticker}</span> — {f.error}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 mt-5">
            <button
              onClick={handleBackToHistory}
              className="px-5 py-2.5 bg-[var(--color-bg-card)] border border-[var(--color-accent)] text-sm text-[var(--color-text-muted)] rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-text-muted)] transition-colors"
            >
              Back to History
            </button>
            <button
              onClick={handleClear}
              className="px-5 py-2.5 bg-[var(--color-bg-card)] border border-[var(--color-accent)] text-sm text-[var(--color-text-muted)] rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-text-muted)] transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {q.currentResult && (
          <EvaluationResult result={q.currentResult} onClear={handleClear} />
        )}
      </div>
    );
  }

  // ── In-progress / cancelling ──────────────────────────────────────────────

  const completedCount = q.results.length + q.failures.length;
  const currentTicker = q.tickers[q.currentIndex] ?? '';
  const isCancelling = q.status === 'cancelling';

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Progress banner */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!isCancelling && (
              <svg className="animate-spin h-4 w-4 shrink-0 text-[var(--color-highlight)]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4l-3 3-3-3h4z" />
              </svg>
            )}
            <div>
              {isCancelling ? (
                <>
                  <div className="text-sm text-amber-300 font-medium">Cancelling after current evaluation…</div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    Finishing <span className="font-mono font-semibold">{currentTicker}</span>, then stopping
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm text-[var(--color-text)]">
                    Evaluating <span className="font-bold">{completedCount + 1}</span> of{' '}
                    <span className="font-bold">{q.tickers.length}</span>:{' '}
                    <span className="font-mono font-bold text-[var(--color-highlight)]">{currentTicker}</span>
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    Fetching candle data and running evaluation pipeline…
                  </div>
                </>
              )}
            </div>
          </div>

          <button
            onClick={cancelQueue}
            disabled={isCancelling}
            className="ml-4 shrink-0 px-4 py-2 text-sm border rounded transition-colors border-[var(--color-accent)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-text-muted)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isCancelling ? 'Cancelling…' : 'Cancel Queue'}
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-[var(--color-accent)]/40 rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-highlight)] transition-all duration-500"
            style={{ width: `${(completedCount / q.tickers.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Current result — visible from the moment an evaluation finishes */}
      {q.currentResult && (
        <EvaluationResult result={q.currentResult} onClear={dismissCurrentResult} />
      )}
    </div>
  );
}
