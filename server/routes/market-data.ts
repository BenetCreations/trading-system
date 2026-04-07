import { Router, Request, Response } from 'express';
import { fetchPolygonCandles, delay, RateLimitError, TickerNotFoundError } from '../services/polygon.js';
import { fetchFinnhubQuote } from '../services/finnhub.js';
import { calculateIndicators, calcATR, calcMAs } from '../services/indicators.js';
import { preScreenStage } from '../services/skillRouter.js';

const router = Router();

// ─── GET /api/quote/:ticker  (Finnhub) ───────────────────────────────────────

router.get('/quote/:ticker', async (req: Request, res: Response) => {
  const ticker = (req.params['ticker'] as string).toUpperCase();
  try {
    const data = await fetchFinnhubQuote(ticker);
    res.json(data);
  } catch (err) {
    if (err instanceof RateLimitError) {
      res.status(429).json({ error: err.message });
      return;
    }
    if ((err as Error).message.startsWith('Ticker not found')) {
      res.status(404).json({ error: 'Ticker not found' });
      return;
    }
    console.error(`[GET /quote/${ticker}]`, err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/candles/:ticker  (Polygon) ─────────────────────────────────────

router.get('/candles/:ticker', async (req: Request, res: Response) => {
  const ticker = (req.params['ticker'] as string).toUpperCase();
  try {
    const stock = await fetchPolygonCandles(ticker);

    // Polygon free tier: 5 req/min — wait between stock and SPY calls
    await delay(15_000);

    const spy = await fetchPolygonCandles('SPY');

    console.log(`[polygon] ${ticker}: ${stock.t.length} candles, SPY: ${spy.t.length} candles`);

    res.json({ stock, spy, ticker });
  } catch (err) {
    if (err instanceof RateLimitError) {
      res.status(429).json({ error: err.message });
      return;
    }
    if (err instanceof TickerNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error(`[GET /candles/${ticker}]`, err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/atr/:ticker  (ATR extension for positions) ─────────────────────

router.get('/atr/:ticker', async (req: Request, res: Response) => {
  const ticker = (req.params['ticker'] as string).toUpperCase();
  try {
    const candles = await fetchPolygonCandles(ticker);
    const closes = candles.c;
    const highs  = candles.h;
    const lows   = candles.l;
    const currentPrice = closes[closes.length - 1];

    const atrValues   = calcATR(highs, lows, closes);
    const { ema21 }   = calcMAs(closes);
    const currentATR  = atrValues[atrValues.length - 1];
    const currentEMA21 = ema21[ema21.length - 1];

    const atrPct  = (currentATR / currentPrice) * 100;
    const extPct  = ((currentPrice - currentEMA21) / currentEMA21) * 100;
    const atrMult = atrPct > 0 ? extPct / atrPct : 0;

    const band =
      atrMult >= 7 ? { label: 'SELL',  color: '#ef4444' } :
      atrMult >= 5 ? { label: 'Aware', color: '#f97316' } :
      atrMult >= 3 ? { label: 'Watch', color: '#f59e0b' } :
                     { label: 'OK',    color: '#10b981' };

    console.log(`[GET /atr/${ticker}] mult=${atrMult.toFixed(2)}× band=${band.label}`);
    res.json({ ticker, currentPrice, ema21: currentEMA21, atr: currentATR, atrPct, extPct, atrMult, band });
  } catch (err) {
    if (err instanceof RateLimitError) {
      res.status(429).json({ error: err.message });
      return;
    }
    if (err instanceof TickerNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error(`[GET /atr/${ticker}]`, err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/test-indicators/:ticker  (temporary test endpoint) ────────────

router.get('/test-indicators/:ticker', async (req: Request, res: Response) => {
  const ticker = (req.params['ticker'] as string).toUpperCase();
  try {
    const stock = await fetchPolygonCandles(ticker);

    // Polygon free tier: 5 req/min — wait between stock and SPY calls
    await delay(15_000);

    const spy = await fetchPolygonCandles('SPY');

    console.log(`[indicators] ${ticker}: ${stock.t.length} candles, SPY: ${spy.t.length} candles`);

    const result = calculateIndicators(stock, spy, ticker);
    const preScreen = preScreenStage(result);

    res.json({
      structured: result,
      text: result.formattedText,
      preScreen,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      res.status(429).json({ error: err.message });
      return;
    }
    if (err instanceof TickerNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error(`[GET /test-indicators/${ticker}]`, err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
