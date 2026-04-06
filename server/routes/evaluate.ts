import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { fetchPolygonCandles, delay, RateLimitError, TickerNotFoundError } from '../services/polygon.js';
import { calculateIndicators } from '../services/indicators.js';
import { preScreenStage, routeSkillFiles } from '../services/skillRouter.js';
import type { EvaluationRequest, EvaluationResponse } from '../types/evaluation.js';
import db from '../db.js';

const router = Router();

const MODEL = 'claude-sonnet-4-20250514';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── Extraction helpers ───────────────────────────────────────────────────────

function extractVerdict(text: string): string | null {
  if (/DOES NOT QUALIFY/i.test(text)) return 'DOES NOT QUALIFY';
  if (/\bQUALIFIES\b/i.test(text)) return 'QUALIFIES';
  if (/\bWATCHLIST\b/i.test(text)) return 'WATCHLIST';
  return null;
}

function extractSetupType(text: string): string | null {
  const match = text.match(/Setup\s*Type\s*[:\-–]\s*([^\n]+)/i);
  return match ? match[1].trim() : null;
}

// ─── Build user message ───────────────────────────────────────────────────────

function buildUserMessage(
  formattedText: string,
  enrichment: EvaluationRequest['enrichment'],
): string {
  const lines: string[] = [formattedText];

  // Only add the section if at least one enrichment field was provided
  const enrichmentFields: string[] = [];

  if (enrichment?.insiderBuying) {
    enrichmentFields.push(`Insider Buying:         ${enrichment.insiderBuying}`);
  }
  if (enrichment?.pbRatio) {
    enrichmentFields.push(`P/B Ratio:             ${enrichment.pbRatio}`);
  }
  if (enrichment?.ipoDate) {
    enrichmentFields.push(`IPO / US Listing Date: ${enrichment.ipoDate}`);
  }
  if (enrichment?.marketCap) {
    enrichmentFields.push(`Market Cap:            ${enrichment.marketCap}`);
  }
  if (enrichment?.optionImpliedMove) {
    enrichmentFields.push(`Option Implied Move:   ${enrichment.optionImpliedMove}`);
  }
  if (enrichment?.baseCount !== undefined) {
    enrichmentFields.push(`Base Count:            ${enrichment.baseCount}`);
  }
  if (enrichment?.baseHigh !== undefined) {
    enrichmentFields.push(`Base High:             $${enrichment.baseHigh.toFixed(2)}`);
  }
  if (enrichment?.baseLow !== undefined) {
    enrichmentFields.push(`Base Low:              $${enrichment.baseLow.toFixed(2)}`);
  }
  if (enrichment?.sectorETF) {
    enrichmentFields.push(`Sector ETF:            ${enrichment.sectorETF}`);
  }

  if (enrichmentFields.length > 0) {
    lines.push('\nADDITIONAL CONTEXT\n' + enrichmentFields.join('\n'));
  }

  return lines.join('\n');
}

// ─── POST /api/evaluate ───────────────────────────────────────────────────────

router.post('/evaluate', async (req: Request, res: Response) => {
  const body = req.body as EvaluationRequest;
  const ticker = (body.ticker ?? '').toUpperCase().trim();
  const requestType = body.requestType ?? 'evaluate';
  const enrichment = body.enrichment;
  const pipelineStart = Date.now();

  if (!ticker) {
    res.status(400).json({ error: 'ticker is required' });
    return;
  }

  try {
    // Step 1: Fetch candles
    console.log(`[evaluate] Step 1: Fetching candles for ${ticker}...`);
    let stock;
    try {
      stock = await fetchPolygonCandles(ticker);
    } catch (err) {
      if (err instanceof RateLimitError) {
        res.status(429).json({ error: err.message, step: 1 });
        return;
      }
      if (err instanceof TickerNotFoundError) {
        res.status(404).json({ error: err.message, step: 1 });
        return;
      }
      throw err;
    }

    // Polygon free tier: 5 req/min — wait between calls
    await delay(15_000);

    // Step 2: Fetch SPY candles
    console.log(`[evaluate] Step 2: Fetching SPY candles...`);
    let spy;
    try {
      spy = await fetchPolygonCandles('SPY');
    } catch (err) {
      if (err instanceof RateLimitError) {
        res.status(429).json({ error: err.message, step: 2 });
        return;
      }
      throw err;
    }

    console.log(`[evaluate] Candles — ${ticker}: ${stock.t.length}, SPY: ${spy.t.length}`);

    // Step 3: Calculate indicators
    console.log(`[evaluate] Step 3: Calculating indicators...`);
    const indicators = calculateIndicators(stock, spy, ticker);

    // Step 4: Pre-screen stage
    console.log(`[evaluate] Step 4: Pre-screening stage...`);
    const preScreen = preScreenStage(indicators);
    console.log(`[evaluate] Pre-screen → Stage ${preScreen.likelyStage} (${preScreen.confidence}): ${preScreen.reasoning}`);

    // Step 5: Route skill files
    console.log(`[evaluate] Step 5: Routing skill files (requestType=${requestType})...`);
    const { systemPrompt, filesLoaded } = routeSkillFiles(preScreen.likelyStage, requestType);

    // Step 6: Build user message and call Claude
    console.log(`[evaluate] Step 6: Calling Claude API (model=${MODEL}, filesLoaded=[${filesLoaded.join(', ')}])...`);
    const userMessage = buildUserMessage(indicators.formattedText, enrichment);

    const STRUCTURED_DATA_PREAMBLE = `CRITICAL OPERATING CONTEXT — READ BEFORE ALL OTHER INSTRUCTIONS:

You are operating in structured-data mode. You will NOT receive TradingView chart screenshots. Instead, you receive a comprehensive structured data block that contains all the information you would extract from charts, calculated with mathematical precision from raw OHLCV candle data:

- All 4 MA values (10 EMA, 21 EMA, 50 SMA, 200 SMA) with exact slopes and trajectory
- MA ordering confirmation
- Complete 50 SMA interaction history with dates, durations, cross magnitudes (in ATR multiples), and recovery timelines
- MA convergence analysis (spread percentages, classified as tight/normal/wide)
- RS line, RS MA, RS status (blue/pink), RS phase, RSNHBP detection, Mansfield RS
- RelVol patterns (average, up-day vs down-day, volume trend)
- ATR, 52-week high/low with dates and percentages
- Base high/low/depth if applicable

This data is MORE precise than visual chart reading — you have exact numerical values rather than visual estimates.

INSTRUCTIONS:
- Perform the full two-pass stage identification protocol using the structured data. Pass 1 (MA Math) uses the MA values, ordering, and slopes. Pass 2 (Price Behavior) uses the 50 SMA interaction history, cross magnitudes, MA convergence data, and volume patterns.
- Complete the full evaluation and deliver a definitive verdict. Never say the evaluation is incomplete or that you need screenshots.
- Never request TradingView screenshots or any images.
- Apply all evaluation rules, stage criteria, and absolute rules exactly as specified in the skill files below.
- The structured data block in the user message IS your chart. Read it as such.

${'─'.repeat(80)}
SKILL FILES FOLLOW:
${'─'.repeat(80)}

`;

    const fullSystemPrompt = STRUCTURED_DATA_PREAMBLE + systemPrompt;

    let claudeText: string;
    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: fullSystemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });
      claudeText = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');
    } catch (err) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr.status === 401) {
        res.status(500).json({ error: 'Invalid Anthropic API key', step: 6 });
        return;
      }
      if (apiErr.status === 429) {
        res.status(429).json({ error: 'Claude API rate limited, try again in a moment', step: 6 });
        return;
      }
      res.status(500).json({ error: `Evaluation failed: ${apiErr.message ?? String(err)}`, step: 6 });
      return;
    }

    // Step 7: Save to DB and return response
    const elapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
    console.log(`[evaluate] Step 7: Done. Total pipeline time: ${elapsed}s`);

    const timestamp = new Date().toISOString();

    let savedId: number | null = null;
    try {
      const insertResult = db.prepare(`
        INSERT INTO evaluations
          (ticker, timestamp, stage, verdict, setup_type, evaluation_text, indicators_json, files_loaded, model, request_type, enrichment_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ticker,
        timestamp,
        preScreen.likelyStage !== null ? String(preScreen.likelyStage) : null,
        extractVerdict(claudeText),
        extractSetupType(claudeText),
        claudeText,
        JSON.stringify(indicators),
        filesLoaded.join(','),
        MODEL,
        requestType,
        enrichment ? JSON.stringify(enrichment) : null,
      );
      savedId = insertResult.lastInsertRowid as number;
      console.log(`[evaluate] Saved evaluation id=${savedId}`);
    } catch (saveErr) {
      console.error('[evaluate] Failed to save evaluation to DB:', saveErr);
    }

    const result: EvaluationResponse = {
      evaluation: claudeText,
      ticker,
      preScreen,
      indicators: indicators,
      filesLoaded,
      model: MODEL,
      timestamp,
      savedId: savedId ?? undefined,
    };

    res.json(result);
  } catch (err) {
    console.error(`[POST /evaluate/${ticker}]`, err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
