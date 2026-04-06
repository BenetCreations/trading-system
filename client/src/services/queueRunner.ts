/**
 * Module-level queue runner.
 *
 * The async evaluation loop lives here — completely outside React's component
 * lifecycle. Navigating between tabs, remounting RevalQueue, or any React
 * reconciliation cannot interrupt or restart it.
 *
 * React components subscribe via useQueueStore() and re-render when state
 * changes, but they have zero effect on execution.
 */

import { evaluateTicker, type EvaluationResult as EvalResultType } from '../api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QueueResult {
  ticker: string;
  verdict: string | null;
}

export interface QueueFailure {
  ticker: string;
  error: string;
}

export interface QueueState {
  status: 'idle' | 'running' | 'cancelling' | 'done';
  tickers: string[];
  currentIndex: number;
  currentResult: EvalResultType | null;
  results: QueueResult[];
  failures: QueueFailure[];
}

// ─── Store ───────────────────────────────────────────────────────────────────

let state: QueueState = {
  status: 'idle',
  tickers: [],
  currentIndex: 0,
  currentResult: null,
  results: [],
  failures: [],
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(fn => fn());
}

export function subscribeQueue(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getQueueState(): QueueState {
  return state;
}

function set(patch: Partial<QueueState>) {
  state = { ...state, ...patch };
  notify();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractVerdict(text: string): string | null {
  if (/DOES NOT QUALIFY/i.test(text)) return 'DOES NOT QUALIFY';
  if (/\bQUALIFIES\b/i.test(text)) return 'QUALIFIES';
  if (/\bWATCHLIST\b/i.test(text)) return 'WATCHLIST';
  return null;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function startQueue(tickers: string[]): Promise<void> {
  if (state.status === 'running' || state.status === 'cancelling') return;

  set({ status: 'running', tickers, currentIndex: 0, currentResult: null, results: [], failures: [] });

  for (let i = 0; i < tickers.length; i++) {
    if (state.status === 'cancelling') break;

    const ticker = tickers[i];
    set({ currentIndex: i, currentResult: null });

    try {
      const result = await evaluateTicker(ticker);

      // If cancelled while the API call was in flight, discard result and stop
      if (state.status === 'cancelling') break;

      set({
        currentResult: result,
        results: [...state.results, { ticker, verdict: extractVerdict(result.evaluation) }],
      });

      // Pause between tickers so the user can read the result
      if (i < tickers.length - 1 && state.status !== 'cancelling') {
        await new Promise(r => setTimeout(r, 5000));
      }
    } catch (err) {
      if (state.status === 'cancelling') break;
      set({ failures: [...state.failures, { ticker, error: (err as Error).message }] });
    }
  }

  set({ status: 'done' });
}

export function cancelQueue(): void {
  if (state.status === 'running') {
    set({ status: 'cancelling' });
  }
}

export function dismissCurrentResult(): void {
  set({ currentResult: null });
}

export function resetQueue(): void {
  set({
    status: 'idle',
    tickers: [],
    currentIndex: 0,
    currentResult: null,
    results: [],
    failures: [],
  });
}
