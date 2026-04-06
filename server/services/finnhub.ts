import { RateLimitError } from './polygon.js';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY ?? '';
const FINNHUB_BASE = 'https://finnhub.io/api/v1';

export interface FinnhubQuote {
  c: number;  // current price
  h: number;  // high
  l: number;  // low
  o: number;  // open
  pc: number; // previous close
}

async function fetchFinnhub<T>(url: string): Promise<T> {
  const redacted = url.replace(FINNHUB_API_KEY, '[REDACTED]');
  console.log(`[finnhub] GET ${redacted}`);
  const res = await fetch(url);
  if (res.status === 429) throw new RateLimitError();
  return res.json() as Promise<T>;
}

export async function fetchFinnhubQuote(ticker: string): Promise<FinnhubQuote> {
  const url = `${FINNHUB_BASE}/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`;
  const data = await fetchFinnhub<FinnhubQuote>(url);
  if (data.c === 0 && data.h === 0) {
    throw new Error(`Ticker not found: ${ticker}`);
  }
  return data;
}
