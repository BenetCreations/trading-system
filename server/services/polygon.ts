const POLYGON_API_KEY = process.env.POLYGON_API_KEY ?? '';
const POLYGON_BASE = 'https://api.polygon.io/v2/aggs/ticker';

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface CandleSeries {
  c: number[];
  h: number[];
  l: number[];
  o: number[];
  t: number[];  // Unix seconds
  v: number[];
}

interface PolygonBar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  t: number; // milliseconds
}

interface PolygonResponse {
  status: string;
  resultsCount?: number;
  results?: PolygonBar[];
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class RateLimitError extends Error {
  constructor() {
    super('Rate limit reached, try again in a moment');
    this.name = 'RateLimitError';
  }
}

export class TickerNotFoundError extends Error {
  constructor(ticker: string) {
    super(`No candle data found for ${ticker}`);
    this.name = 'TickerNotFoundError';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Fetch candles ────────────────────────────────────────────────────────────

// Polygon free tier drops the TCP connection when rate-limited rather than
// returning a 429, so Node's fetch throws a TypeError. Retry once after a
// short wait before surfacing the error.
async function polygonFetchWithRetry(url: string, attempt = 1): Promise<Response> {
  try {
    return await fetch(url);
  } catch (err) {
    if (attempt < 2) {
      const retryWait = 12_000;
      console.warn(`[polygon] Network error (attempt ${attempt}), retrying in ${retryWait / 1000}s…`);
      await delay(retryWait);
      return polygonFetchWithRetry(url, attempt + 1);
    }
    throw new RateLimitError();
  }
}

export async function fetchPolygonCandles(ticker: string): Promise<CandleSeries> {
  // Request 3 years back — free tier returns ~2 years (~500 trading days) regardless
  const to = toDateStr(new Date());
  const fromDate = new Date();
  fromDate.setFullYear(fromDate.getFullYear() - 3);
  const from = toDateStr(fromDate);

  const url = `${POLYGON_BASE}/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=700&apiKey=${POLYGON_API_KEY}`;
  const redacted = url.replace(POLYGON_API_KEY, '[REDACTED]');
  console.log(`[polygon] GET ${redacted}`);

  const res = await polygonFetchWithRetry(url);

  if (res.status === 429) throw new RateLimitError();

  const data = await res.json() as PolygonResponse;

  if (!['OK', 'DELAYED'].includes(data.status) || !data.results || data.results.length === 0) {
    throw new TickerNotFoundError(ticker);
  }

  // Timestamps from Polygon are milliseconds — convert to seconds
  return {
    o: data.results.map((b) => b.o),
    h: data.results.map((b) => b.h),
    l: data.results.map((b) => b.l),
    c: data.results.map((b) => b.c),
    t: data.results.map((b) => Math.floor(b.t / 1000)),
    v: data.results.map((b) => b.v),
  };
}
