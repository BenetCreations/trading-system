/**
 * Module-level ATR fetch store.
 *
 * The async fetch loop lives here — outside React's component lifecycle.
 * Navigating between tabs cannot interrupt or reset the in-progress fetch.
 *
 * React components subscribe via subscribeATR() and re-render on state changes,
 * but have zero effect on execution.
 */

import { getATR, type ATRResult } from '../api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ATRState {
  status: 'idle' | 'loading' | 'done';
  results: ATRResult[];
  progress: string;
  lastUpdated: Date | null;
  failedTickers: string[];
}

// ─── Store ───────────────────────────────────────────────────────────────────

const DELAY_MS = 13_000;

let state: ATRState = {
  status: 'idle',
  results: [],
  progress: '',
  lastUpdated: null,
  failedTickers: [],
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(fn => fn());
}

export function subscribeATR(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getATRState(): ATRState {
  return state;
}

function set(patch: Partial<ATRState>) {
  state = { ...state, ...patch };
  notify();
}

// ─── Actions ─────────────────────────────────────────────────────────────────

let aborted = false;

export async function startATRFetch(tickers: string[]): Promise<void> {
  if (state.status === 'loading' || tickers.length === 0) return;
  aborted = false;
  set({ status: 'loading', results: [], failedTickers: [], progress: '' });

  const fresh: ATRResult[] = [];
  const failed: string[] = [];

  for (let i = 0; i < tickers.length; i++) {
    if (aborted) break;
    set({ progress: `${i + 1}/${tickers.length}: ${tickers[i]}…` });
    try {
      const result = await getATR(tickers[i]);
      fresh.push(result);
      set({ results: [...fresh].sort((a, b) => Math.abs(b.atrMult) - Math.abs(a.atrMult)) });
    } catch (err) {
      failed.push(`${tickers[i]} (${(err as Error).message})`);
    }
    if (i < tickers.length - 1 && !aborted) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  set({ status: 'done', failedTickers: failed, lastUpdated: new Date(), progress: '' });
}

export function abortATRFetch(): void {
  aborted = true;
}
