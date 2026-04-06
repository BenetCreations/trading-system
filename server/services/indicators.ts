import { EMA, SMA, ATR } from 'technicalindicators';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CandleSeries {
  c: number[];
  h: number[];
  l: number[];
  o: number[];
  t: number[];  // Unix seconds
  v: number[];
}

type SlopeDirection = 'rising' | 'flat' | 'falling';
type SlopeTrajectory = 'accelerating' | 'steady' | 'decelerating' | 'turning';

interface MAData {
  current: number;
  snapshots: number[];       // oldest → newest
  snapshotLabels: string[];  // e.g. ["20d ago", "15d", "10d", "5d", "now"]
  slopeDirection: SlopeDirection;
  slopeTrajectory: SlopeTrajectory;
}

interface PricePosition {
  vsEMA10: number;   // percentage
  vsEMA21: number;
  vsSMA50: number;
  vsSMA200: number;
  atrExtension: number;  // ATR multiples from 21 EMA
}

type CrossClassification = 'trivial' | 'normal' | 'significant';

interface FiftySMACross {
  date: string;           // YYYY-MM-DD
  direction: 'above-to-below' | 'below-to-above';
  daysOnOtherSide: number;
  maxExcursion: number;         // ATR multiples from 50 SMA during the period
  classification: CrossClassification;
}

interface FiftySMAInteraction {
  totalCrosses: number;
  aboveToBelowCount: number;
  belowToAboveCount: number;
  trivialCrosses: number;
  meaningfulCrosses: number;
  avgCrossMagnitude: number;
  crosses: FiftySMACross[];
  currentPosition: 'above' | 'below';
  daysAtCurrentPosition: number;
  longestStreakAbove: number;
  longestStreakBelow: number;
}

interface MAConvergence {
  maSpread: number;           // (max - min of all 4 MAs) / price * 100
  maConvergence: 'tight' | 'normal' | 'wide';
  maSpreadUpper: number;      // (max - min of 10E, 21E, 50S) / price * 100
  maConvergenceUpper: 'tight' | 'normal' | 'wide';
}

interface RSData {
  rsLine: number;
  rsMA: number;
  rsStatus: 'blue' | 'pink';
  rsPhase: 'improving' | 'deteriorating' | 'flat';
  rsnhbp: boolean;
  mansfieldRS: number;
  mansfieldAboveZero: boolean;
}

interface RelVolData {
  avgVol50: number;
  todayRelVol: number;
  avgRelVolUpDays: number;
  avgRelVolDownDays: number;
  volumeTrend: 'increasing' | 'decreasing';
}

interface FiftyTwoWeekData {
  high: number;
  highDate: string;
  low: number;
  lowDate: string;
  fromHigh: number;   // percentage (negative)
  fromLow: number;    // percentage (positive)
}

// ─── Basing Analysis Types ───────────────────────────────────────────────────

type SMA200TrajectoryClass = 'rising' | 'flattening' | 'flat' | 'declining' | 'bottoming';

interface SMA200TrajectoryData {
  classification: SMA200TrajectoryClass;
  earlySlope: number;    // % change in first half of window
  lateSlope: number;     // % change in second half of window
  windowDays: number;    // total lookback window (split in half)
}

type SupportClassification = 'no tests' | 'single test' | 'double bottom' | 'multiple tests';

interface SupportAnalysis {
  absoluteLow: number;          // lowest low in 52-week lookback
  zoneTop: number;              // absoluteLow * 1.05 (top of support zone)
  visitCount: number;
  visitDates: string[];         // entry date (YYYY-MM-DD) of each distinct visit
  spanMonths: number;           // months from first to last visit (0 if <2 visits)
  classification: SupportClassification;
}

interface PriceRangeAnalysis {
  periodDays: number;
  periodHigh: number;
  periodLow: number;
  rangeDepth: number;                       // (high − low) / high * 100
  thirdRanges: [number, number, number];    // range depth % in each third of period
  compressing: boolean;                     // true if third 3 range < 75% of third 1 range
  classification: string;                   // e.g. "moderate, compressing"
}

interface BasingAnalysis {
  sma200Trajectory: SMA200TrajectoryData;
  supportAnalysis: SupportAnalysis;
  priceRangeAnalysis: PriceRangeAnalysis;
}

export interface IndicatorResult {
  ticker: string;
  generatedAt: string;
  currentPrice: number;
  ema10: MAData;
  ema21: MAData;
  sma50: MAData;
  sma200: MAData;
  maOrdering: string;
  maConvergence: MAConvergence;
  pricePosition: PricePosition;
  fiftySMAInteraction: FiftySMAInteraction;
  atr: { value: number; percentOfPrice: number };
  relativeStrength: RSData;
  relativeVolume: RelVolData;
  fiftyTwoWeek: FiftyTwoWeekData;
  basingAnalysis: BasingAnalysis;
  formattedText: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function tsToDate(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function pct(a: number, b: number): number {
  // percentage that a is above/below b
  return ((a - b) / b) * 100;
}

function round(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatPrice(n: number): string {
  return `$${round(n, 2).toFixed(2)}`;
}

function formatPct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${round(n, 2).toFixed(2)}%`;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ─── Individual Calculation Functions ────────────────────────────────────────

export function calcMAs(closes: number[]): {
  ema10: number[];
  ema21: number[];
  sma50: number[];
  sma200: number[];
} {
  return {
    ema10: EMA.calculate({ period: 10, values: closes }),
    ema21: EMA.calculate({ period: 21, values: closes }),
    sma50: SMA.calculate({ period: 50, values: closes }),
    sma200: SMA.calculate({ period: 200, values: closes }),
  };
}

function buildMAData(
  maArray: number[],
  lookbackOffsets: number[],  // e.g. [20, 15, 10, 5, 0] for short MAs
  labels: string[],
  flatThreshold: number,     // 0.005 for short, 0.003 for long
): MAData {
  const len = maArray.length;
  if (len === 0) {
    return {
      current: 0,
      snapshots: [],
      snapshotLabels: labels,
      slopeDirection: 'flat',
      slopeTrajectory: 'steady',
    };
  }

  const current = maArray[len - 1];
  const snapshots: number[] = [];

  for (const offset of lookbackOffsets) {
    const idx = len - 1 - offset;
    snapshots.push(idx >= 0 ? maArray[idx] : maArray[0]);
  }

  // Slope direction: compare current to oldest snapshot
  const oldest = snapshots[0];
  const changePct = (current - oldest) / oldest;
  let slopeDirection: SlopeDirection;
  if (changePct > flatThreshold) slopeDirection = 'rising';
  else if (changePct < -flatThreshold) slopeDirection = 'falling';
  else slopeDirection = 'flat';

  // Slope trajectory: look at rate of change between consecutive snapshots
  const rates: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    rates.push(snapshots[i] - snapshots[i - 1]);
  }

  // Check if direction changed within the window
  const hasPositive = rates.some(r => r > 0);
  const hasNegative = rates.some(r => r < 0);
  let slopeTrajectory: SlopeTrajectory;

  if (hasPositive && hasNegative) {
    slopeTrajectory = 'turning';
  } else if (rates.length >= 2) {
    const absRates = rates.map(Math.abs);
    const firstHalf = absRates.slice(0, Math.floor(absRates.length / 2));
    const secondHalf = absRates.slice(Math.floor(absRates.length / 2));
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const ratioChange = avgFirst === 0 ? 0 : (avgSecond - avgFirst) / avgFirst;

    if (ratioChange > 0.2) slopeTrajectory = 'accelerating';
    else if (ratioChange < -0.2) slopeTrajectory = 'decelerating';
    else slopeTrajectory = 'steady';
  } else {
    slopeTrajectory = 'steady';
  }

  return {
    current: round(current, 2),
    snapshots: snapshots.map(s => round(s, 2)),
    snapshotLabels: labels,
    slopeDirection,
    slopeTrajectory,
  };
}

export function calcATR(high: number[], low: number[], close: number[]): number[] {
  return ATR.calculate({ period: 14, high, low, close });
}

export function calcRS(
  stockCloses: number[],
  stockTimestamps: number[],
  spyCloses: number[],
  spyTimestamps: number[],
): RSData {
  // Align stock and SPY data by matching on dates
  const spyByDate = new Map<string, number>();
  for (let i = 0; i < spyTimestamps.length; i++) {
    spyByDate.set(tsToDate(spyTimestamps[i]), spyCloses[i]);
  }

  const alignedStock: number[] = [];
  const alignedSpy: number[] = [];

  for (let i = 0; i < stockTimestamps.length; i++) {
    const dateStr = tsToDate(stockTimestamps[i]);
    const spyClose = spyByDate.get(dateStr);
    if (spyClose !== undefined) {
      alignedStock.push(stockCloses[i]);
      alignedSpy.push(spyClose);
    }
  }

  if (alignedStock.length < 21) {
    return {
      rsLine: 0,
      rsMA: 0,
      rsStatus: 'pink',
      rsPhase: 'flat',
      rsnhbp: false,
      mansfieldRS: 0,
      mansfieldAboveZero: false,
    };
  }

  // RS line = stock / spy for each aligned day
  const rsLine: number[] = alignedStock.map((s, i) => s / alignedSpy[i]);
  const rsMA = EMA.calculate({ period: 21, values: rsLine });

  const currentRS = rsLine[rsLine.length - 1];
  const currentRSMA = rsMA[rsMA.length - 1];

  // RS status: blue if RS > RS_MA, pink if below
  const rsStatus = currentRS >= currentRSMA ? 'blue' : 'pink';

  // RS phase: compare to 63 trading days ago
  const lookback63 = Math.min(63, rsLine.length - 1);
  const rs63ago = rsLine[rsLine.length - 1 - lookback63];
  const rsChangePct = (currentRS - rs63ago) / rs63ago;
  let rsPhase: 'improving' | 'deteriorating' | 'flat';
  if (rsChangePct > 0.02) rsPhase = 'improving';
  else if (rsChangePct < -0.02) rsPhase = 'deteriorating';
  else rsPhase = 'flat';

  // RSNHBP: RS line at 252-day high but stock price is NOT at 252-day high
  const rsLookback = Math.min(252, rsLine.length);
  const rsWindow = rsLine.slice(-rsLookback);
  const rsMax = Math.max(...rsWindow);
  const isRSAtHigh = currentRS >= rsMax * 0.998;  // within 0.2% of high

  const stockLookback = Math.min(252, alignedStock.length);
  const stockWindow = alignedStock.slice(-stockLookback);
  const stockMax = Math.max(...stockWindow);
  const currentStockPrice = alignedStock[alignedStock.length - 1];
  const isStockAtHigh = currentStockPrice >= stockMax * 0.998;

  const rsnhbp = isRSAtHigh && !isStockAtHigh;

  // Mansfield RS: (DRS_today / SMA(DRS, 200) - 1) * 100
  let mansfieldRS = 0;
  const drs200 = SMA.calculate({ period: 200, values: rsLine });
  if (drs200.length > 0) {
    const currentDRS200 = drs200[drs200.length - 1];
    mansfieldRS = (currentRS / currentDRS200 - 1) * 100;
  }

  return {
    rsLine: round(currentRS, 4),
    rsMA: round(currentRSMA, 4),
    rsStatus,
    rsPhase,
    rsnhbp,
    mansfieldRS: round(mansfieldRS, 2),
    mansfieldAboveZero: mansfieldRS > 0,
  };
}

export function calcRelVol(
  volumes: number[],
  opens: number[],
  closes: number[],
): RelVolData {
  const len = volumes.length;

  // 50-day average volume
  const vol50Window = volumes.slice(-50);
  const avgVol50 = vol50Window.reduce((a, b) => a + b, 0) / vol50Window.length;

  // Today's RelVol
  const todayVol = volumes[len - 1];
  const todayRelVol = avgVol50 > 0 ? todayVol / avgVol50 : 0;

  // RelVol on up days and down days over last 20 days
  const last20Start = Math.max(0, len - 20);
  let upDayRelVolSum = 0;
  let upDayCount = 0;
  let downDayRelVolSum = 0;
  let downDayCount = 0;

  // Use the 50-day average ending at each day? Simpler: use the current 50-day avg
  for (let i = last20Start; i < len; i++) {
    const relVol = avgVol50 > 0 ? volumes[i] / avgVol50 : 0;
    if (closes[i] > opens[i]) {
      upDayRelVolSum += relVol;
      upDayCount++;
    } else {
      downDayRelVolSum += relVol;
      downDayCount++;
    }
  }

  const avgRelVolUpDays = upDayCount > 0 ? upDayRelVolSum / upDayCount : 0;
  const avgRelVolDownDays = downDayCount > 0 ? downDayRelVolSum / downDayCount : 0;

  // Volume trend: last 20-day avg vs previous 20-day avg
  const recent20 = volumes.slice(-20);
  const prev20 = volumes.slice(-40, -20);
  const avgRecent = recent20.reduce((a, b) => a + b, 0) / recent20.length;
  const avgPrev = prev20.length > 0
    ? prev20.reduce((a, b) => a + b, 0) / prev20.length
    : avgRecent;
  const volumeTrend = avgRecent >= avgPrev ? 'increasing' : 'decreasing';

  return {
    avgVol50: Math.round(avgVol50),
    todayRelVol: round(todayRelVol, 2),
    avgRelVolUpDays: round(avgRelVolUpDays, 2),
    avgRelVolDownDays: round(avgRelVolDownDays, 2),
    volumeTrend,
  };
}

export function calc50SMAHistory(
  closes: number[],
  timestamps: number[],
  sma50Full: number[],
  atrFull: number[],
): FiftySMAInteraction {
  // sma50Full[i] corresponds to closes[i + offset50]
  // atrFull[i]  corresponds to closes[i + offsetATR]
  const offset50 = closes.length - sma50Full.length;
  const offsetATR = closes.length - atrFull.length;

  // Only look at last ~126 trading days (6 months)
  const lookbackDays = 126;
  const startIdx = Math.max(offset50, closes.length - lookbackDays);

  // We'll build crosses in two passes:
  // Pass 1 — identify cross events and the index range each period covers
  type PeriodRecord = {
    crossIdx: number;
    direction: 'above-to-below' | 'below-to-above';
    periodStart: number;  // first index on the new side
    periodEnd: number;    // last index on that side (exclusive = next cross or end)
  };
  const periods: PeriodRecord[] = [];

  let currentAbove = closes[startIdx] > sma50Full[startIdx - offset50];
  let streakStart = startIdx;
  let longestAbove = 0;
  let longestBelow = 0;
  let trackAbove = currentAbove;
  let trackStreakLen = 0;

  for (let i = startIdx; i < closes.length; i++) {
    const smaIdx = i - offset50;
    if (smaIdx < 0 || smaIdx >= sma50Full.length) continue;

    const aboveNow = closes[i] > sma50Full[smaIdx];
    trackStreakLen++;

    if (aboveNow !== currentAbove) {
      if (trackAbove) longestAbove = Math.max(longestAbove, trackStreakLen - 1);
      else             longestBelow = Math.max(longestBelow, trackStreakLen - 1);

      periods.push({
        crossIdx: i,
        direction: currentAbove ? 'above-to-below' : 'below-to-above',
        periodStart: streakStart,
        periodEnd: i,
      });

      trackAbove = aboveNow;
      trackStreakLen = 1;
      currentAbove = aboveNow;
      streakStart = i;
    }
  }

  // Final streak
  if (trackAbove) longestAbove = Math.max(longestAbove, trackStreakLen);
  else             longestBelow = Math.max(longestBelow, trackStreakLen);

  const daysAtCurrent = closes.length - streakStart;

  // Helper: get ATR at a given close index (clamp to available range)
  function atrAt(closeIdx: number): number {
    const idx = closeIdx - offsetATR;
    if (idx < 0) return atrFull[0] ?? 1;
    if (idx >= atrFull.length) return atrFull[atrFull.length - 1] ?? 1;
    return atrFull[idx] || 1;
  }

  // Pass 2 — compute maxExcursion for each period
  const crosses: FiftySMACross[] = periods.map(p => {
    const daysOnOtherSide = p.periodEnd - p.periodStart;
    // We measure excursion during the period [p.periodStart, p.periodEnd)
    let maxExcursion = 0;

    for (let i = p.periodStart; i < p.periodEnd && i < closes.length; i++) {
      const smaIdx = i - offset50;
      if (smaIdx < 0 || smaIdx >= sma50Full.length) continue;
      const smaVal = sma50Full[smaIdx];
      const atr = atrAt(i);
      const excursion = Math.abs(closes[i] - smaVal) / atr;
      if (excursion > maxExcursion) maxExcursion = excursion;
    }

    maxExcursion = round(maxExcursion, 2);
    const classification: CrossClassification =
      maxExcursion < 0.5 ? 'trivial' :
      maxExcursion <= 1.5 ? 'normal' :
      'significant';

    return {
      date: tsToDate(timestamps[p.crossIdx]),
      direction: p.direction,
      daysOnOtherSide,
      maxExcursion,
      classification,
    };
  });

  const trivialCrosses = crosses.filter(c => c.classification === 'trivial').length;
  const meaningfulCrosses = crosses.filter(c => c.classification !== 'trivial').length;
  const avgCrossMagnitude = crosses.length > 0
    ? round(crosses.reduce((s, c) => s + c.maxExcursion, 0) / crosses.length, 2)
    : 0;

  return {
    totalCrosses: crosses.length,
    aboveToBelowCount: crosses.filter(c => c.direction === 'above-to-below').length,
    belowToAboveCount: crosses.filter(c => c.direction === 'below-to-above').length,
    trivialCrosses,
    meaningfulCrosses,
    avgCrossMagnitude,
    crosses,
    currentPosition: currentAbove ? 'above' : 'below',
    daysAtCurrentPosition: daysAtCurrent,
    longestStreakAbove: longestAbove,
    longestStreakBelow: longestBelow,
  };
}

export function calcFiftyTwoWeek(
  closes: number[],
  highs: number[],
  lows: number[],
  timestamps: number[],
): FiftyTwoWeekData {
  const lookback = Math.min(252, closes.length);
  const start = closes.length - lookback;

  let high = -Infinity;
  let highDate = '';
  let low = Infinity;
  let lowDate = '';

  for (let i = start; i < closes.length; i++) {
    if (highs[i] > high) {
      high = highs[i];
      highDate = tsToDate(timestamps[i]);
    }
    if (lows[i] < low) {
      low = lows[i];
      lowDate = tsToDate(timestamps[i]);
    }
  }

  const currentPrice = closes[closes.length - 1];
  return {
    high: round(high, 2),
    highDate,
    low: round(low, 2),
    lowDate,
    fromHigh: round(pct(currentPrice, high), 2),
    fromLow: round(pct(currentPrice, low), 2),
  };
}

// ─── Basing Analysis Functions ──────────────────────────────────────────────

/**
 * Classify 200 SMA trajectory by comparing slope in the early vs late half of a
 * 100-day window. Key signal: "bottoming" = declining slope is decelerating —
 * the primary Stage 1 indicator.
 */
function calc200SMATrajectory(sma200: number[]): SMA200TrajectoryData {
  const len = sma200.length;
  if (len < 50) {
    return { classification: 'flat', earlySlope: 0, lateSlope: 0, windowDays: 0 };
  }

  const windowDays = Math.min(100, len - 1);
  const halfWindow = Math.floor(windowDays / 2);

  const oldVal = sma200[len - 1 - windowDays];
  const midVal = sma200[len - 1 - halfWindow];
  const nowVal = sma200[len - 1];

  // % change over each half-window
  const earlySlope = round((midVal - oldVal) / oldVal * 100, 3);
  const lateSlope  = round((nowVal - midVal) / midVal * 100, 3);

  const FLAT_THRESHOLD = 0.15; // <0.15% over ~50 days ≈ flat 200 SMA

  const earlyDir = earlySlope > FLAT_THRESHOLD ? 'up' : earlySlope < -FLAT_THRESHOLD ? 'down' : 'flat';
  const lateDir  = lateSlope  > FLAT_THRESHOLD ? 'up' : lateSlope  < -FLAT_THRESHOLD ? 'down' : 'flat';

  // Deceleration: late abs slope less than half of early abs slope
  const decelerating = Math.abs(earlySlope) > 0 && Math.abs(lateSlope) < Math.abs(earlySlope) * 0.5;

  let classification: SMA200TrajectoryClass;

  if (earlyDir === 'up') {
    classification = (lateDir === 'up' && !decelerating) ? 'rising' : 'flattening';
  } else if (earlyDir === 'down') {
    classification = (lateDir === 'down' && !decelerating) ? 'declining' : 'bottoming';
  } else {
    // Early was flat
    classification = lateDir === 'up' ? 'rising' : lateDir === 'down' ? 'declining' : 'flat';
  }

  return { classification, earlySlope, lateSlope, windowDays };
}

/**
 * Count distinct visits to the support zone (within 5% of the 52-week low).
 * A new visit is counted only after price has been above the zone for ≥5 days,
 * preventing consecutive zone touches from inflating the count.
 */
function calcSupportAnalysis(
  lows: number[],
  timestamps: number[],
): SupportAnalysis {
  const len = lows.length;
  const lookback = Math.min(252, len);
  const start = len - lookback;

  let absoluteLow = Infinity;
  for (let i = start; i < len; i++) {
    if (lows[i] < absoluteLow) absoluteLow = lows[i];
  }

  if (!isFinite(absoluteLow)) {
    return { absoluteLow: 0, zoneTop: 0, visitCount: 0, visitDates: [], spanMonths: 0, classification: 'no tests' };
  }

  const zoneTop = absoluteLow * 1.05;

  // State machine: detect distinct zone visits separated by ≥5 above-zone days
  let daysAbove = 999; // assume stock started well above zone
  let inVisit = false;
  let visitEntry = '';
  let consecutiveDaysAbove = 0;
  const visits: { entryDate: string }[] = [];

  for (let i = start; i < len; i++) {
    const touchesZone = lows[i] <= zoneTop;

    if (!inVisit) {
      if (touchesZone && daysAbove >= 5) {
        // Qualifies as a new distinct visit
        inVisit = true;
        visitEntry = tsToDate(timestamps[i]);
        consecutiveDaysAbove = 0;
        daysAbove = 0;
      } else if (!touchesZone) {
        daysAbove++;
      }
      // If touches zone but daysAbove < 5: still too close to prior visit, ignore
    } else {
      // Inside a visit — track exit (5 consecutive days with low above zone)
      if (touchesZone) {
        consecutiveDaysAbove = 0;
      } else {
        consecutiveDaysAbove++;
        if (consecutiveDaysAbove >= 5) {
          visits.push({ entryDate: visitEntry });
          inVisit = false;
          daysAbove = consecutiveDaysAbove;
          consecutiveDaysAbove = 0;
        }
      }
    }
  }
  if (inVisit) visits.push({ entryDate: visitEntry }); // still in zone at data end

  const visitCount = visits.length;
  const visitDates = visits.map(v => v.entryDate);

  let spanMonths = 0;
  if (visitCount >= 2) {
    const first = new Date(visitDates[0] + 'T12:00:00Z').getTime();
    const last  = new Date(visitDates[visitCount - 1] + 'T12:00:00Z').getTime();
    spanMonths = round((last - first) / (1000 * 60 * 60 * 24 * 30.44), 1);
  }

  const classification: SupportClassification =
    visitCount === 0 ? 'no tests' :
    visitCount === 1 ? 'single test' :
    visitCount === 2 ? 'double bottom' :
    'multiple tests';

  return {
    absoluteLow: round(absoluteLow, 2),
    zoneTop: round(zoneTop, 2),
    visitCount,
    visitDates,
    spanMonths,
    classification,
  };
}

/**
 * Measure price volatility over the last ~9 months (≤190 trading days).
 * Divides the period into thirds to detect whether the range is compressing —
 * a tightening base is a constructive Stage 1 signal.
 */
function calcPriceRangeAnalysis(highs: number[], lows: number[]): PriceRangeAnalysis {
  const len = highs.length;
  const startIdx = Math.max(0, len - 190);
  const periodDays = len - startIdx;

  let periodHigh = -Infinity;
  let periodLow  = Infinity;
  for (let i = startIdx; i < len; i++) {
    if (highs[i] > periodHigh) periodHigh = highs[i];
    if (lows[i]  < periodLow)  periodLow  = lows[i];
  }

  if (!isFinite(periodHigh) || !isFinite(periodLow)) {
    return { periodDays: 0, periodHigh: 0, periodLow: 0, rangeDepth: 0, thirdRanges: [0, 0, 0], compressing: false, classification: 'insufficient data' };
  }

  const rangeDepth = round((periodHigh - periodLow) / periodHigh * 100, 1);
  const thirdLen = Math.floor(periodDays / 3);

  function thirdRange(s: number, e: number): number {
    let hi = -Infinity;
    let lo = Infinity;
    for (let i = s; i < e && i < len; i++) {
      if (highs[i] > hi) hi = highs[i];
      if (lows[i]  < lo) lo = lows[i];
    }
    return (!isFinite(hi) || !isFinite(lo)) ? 0 : round((hi - lo) / hi * 100, 1);
  }

  const thirdRanges: [number, number, number] = [
    thirdRange(startIdx,              startIdx + thirdLen),
    thirdRange(startIdx + thirdLen,   startIdx + 2 * thirdLen),
    thirdRange(startIdx + 2 * thirdLen, len),
  ];

  // Compressing: latest third narrower by ≥25% vs first third (and first third meaningful)
  const compressing = thirdRanges[0] > 5 && thirdRanges[2] < thirdRanges[0] * 0.75;

  const baseClass =
    rangeDepth > 30  ? 'wide and volatile' :
    rangeDepth >= 15 ? 'moderate' :
    'tight';

  return {
    periodDays,
    periodHigh: round(periodHigh, 2),
    periodLow:  round(periodLow, 2),
    rangeDepth,
    thirdRanges,
    compressing,
    classification: compressing ? `${baseClass}, compressing` : baseClass,
  };
}

// ─── Main Function ──────────────────────────────────────────────────────────

export function calculateIndicators(
  stockCandles: CandleSeries,
  spyCandles: CandleSeries,
  ticker: string,
): IndicatorResult {
  const { c: closes, h: highs, l: lows, o: opens, t: timestamps, v: volumes } = stockCandles;
  const currentPrice = closes[closes.length - 1];

  // 1. Moving Averages
  const mas = calcMAs(closes);

  const ema10Data = buildMAData(
    mas.ema10,
    [20, 15, 10, 5, 0],
    ['20d ago', '15d', '10d', '5d', 'now'],
    0.005,
  );
  const ema21Data = buildMAData(
    mas.ema21,
    [20, 15, 10, 5, 0],
    ['20d ago', '15d', '10d', '5d', 'now'],
    0.005,
  );
  const sma50Data = buildMAData(
    mas.sma50,
    [40, 30, 20, 10, 0],
    ['40d ago', '30d', '20d', '10d', 'now'],
    0.003,
  );
  const sma200Data = buildMAData(
    mas.sma200,
    [40, 30, 20, 10, 0],
    ['40d ago', '30d', '20d', '10d', 'now'],
    0.003,
  );

  // 2. MA Ordering
  const maValues: { label: string; value: number }[] = [
    { label: 'Price', value: currentPrice },
    { label: '10E', value: ema10Data.current },
    { label: '21E', value: ema21Data.current },
    { label: '50S', value: sma50Data.current },
    { label: '200S', value: sma200Data.current },
  ].filter(m => m.value > 0);
  maValues.sort((a, b) => b.value - a.value);
  const maOrdering = maValues.map(m => m.label).join(' > ');

  // 3. ATR
  const atrValues = calcATR(highs, lows, closes);
  const currentATR = atrValues.length > 0 ? atrValues[atrValues.length - 1] : 0;

  // 4. Price Position
  const pricePosition: PricePosition = {
    vsEMA10: ema10Data.current > 0 ? round(pct(currentPrice, ema10Data.current), 2) : 0,
    vsEMA21: ema21Data.current > 0 ? round(pct(currentPrice, ema21Data.current), 2) : 0,
    vsSMA50: sma50Data.current > 0 ? round(pct(currentPrice, sma50Data.current), 2) : 0,
    vsSMA200: sma200Data.current > 0 ? round(pct(currentPrice, sma200Data.current), 2) : 0,
    atrExtension: currentATR > 0 && ema21Data.current > 0
      ? round((currentPrice - ema21Data.current) / currentATR, 2)
      : 0,
  };

  // 5. 50 SMA Interaction History (pass ATR array for magnitude calculation)
  const fiftySMAInteraction = mas.sma50.length > 0
    ? calc50SMAHistory(closes, timestamps, mas.sma50, atrValues)
    : {
        totalCrosses: 0,
        aboveToBelowCount: 0,
        belowToAboveCount: 0,
        trivialCrosses: 0,
        meaningfulCrosses: 0,
        avgCrossMagnitude: 0,
        crosses: [],
        currentPosition: 'below' as const,
        daysAtCurrentPosition: 0,
        longestStreakAbove: 0,
        longestStreakBelow: 0,
      };

  // 5b. MA Convergence
  const allMAValues = [ema10Data.current, ema21Data.current, sma50Data.current, sma200Data.current]
    .filter(v => v > 0);
  const upperMAValues = [ema10Data.current, ema21Data.current, sma50Data.current]
    .filter(v => v > 0);

  const maSpreadRaw = allMAValues.length >= 2
    ? (Math.max(...allMAValues) - Math.min(...allMAValues)) / currentPrice * 100
    : 0;
  const maSpreadUpperRaw = upperMAValues.length >= 2
    ? (Math.max(...upperMAValues) - Math.min(...upperMAValues)) / currentPrice * 100
    : 0;

  const maSpread = round(maSpreadRaw, 2);
  const maSpreadUpper = round(maSpreadUpperRaw, 2);

  const maConvergence: MAConvergence = {
    maSpread,
    maConvergence: maSpread < 5 ? 'tight' : maSpread <= 15 ? 'normal' : 'wide',
    maSpreadUpper,
    maConvergenceUpper: maSpreadUpper < 3 ? 'tight' : maSpreadUpper <= 8 ? 'normal' : 'wide',
  };

  // 6. Relative Strength
  const relativeStrength = calcRS(closes, timestamps, spyCandles.c, spyCandles.t);

  // 7. Relative Volume
  const relativeVolume = calcRelVol(volumes, opens, closes);

  // 8. 52-Week High/Low
  const fiftyTwoWeek = calcFiftyTwoWeek(closes, highs, lows, timestamps);

  // 9. Basing Analysis
  const basingAnalysis: BasingAnalysis = {
    sma200Trajectory:   calc200SMATrajectory(mas.sma200),
    supportAnalysis:    calcSupportAnalysis(lows, timestamps),
    priceRangeAnalysis: calcPriceRangeAnalysis(highs, lows),
  };

  // Build the result
  const generatedAt = new Date().toISOString().slice(0, 10);

  const result: IndicatorResult = {
    ticker,
    generatedAt,
    currentPrice: round(currentPrice, 2),
    ema10: ema10Data,
    ema21: ema21Data,
    sma50: sma50Data,
    sma200: sma200Data,
    maOrdering,
    maConvergence,
    pricePosition,
    fiftySMAInteraction,
    atr: {
      value: round(currentATR, 2),
      percentOfPrice: round((currentATR / currentPrice) * 100, 2),
    },
    relativeStrength,
    relativeVolume,
    fiftyTwoWeek,
    basingAnalysis,
    formattedText: '',  // filled below
  };

  result.formattedText = formatTextBlock(result);
  return result;
}

// ─── Basing Analysis Formatter ───────────────────────────────────────────────

function formatBasingAnalysis(b: BasingAnalysis): string {
  const { sma200Trajectory: traj, supportAnalysis: sup, priceRangeAnalysis: rng } = b;

  // ── 200 SMA Trajectory ──
  let trajLine: string;
  if (traj.windowDays === 0) {
    trajLine = '200 SMA Trajectory: Insufficient data';
  } else {
    const eS = `${traj.earlySlope >= 0 ? '+' : ''}${traj.earlySlope.toFixed(3)}%`;
    const lS = `${traj.lateSlope  >= 0 ? '+' : ''}${traj.lateSlope.toFixed(3)}%`;
    const label = traj.classification.charAt(0).toUpperCase() + traj.classification.slice(1);
    const detail =
      (traj.classification === 'bottoming' || traj.classification === 'flattening')
        ? `slope decelerated from ${eS} to ${lS} over ${traj.windowDays} days`
        : `${eS} early → ${lS} late over ${traj.windowDays} days`;
    trajLine = `200 SMA Trajectory: ${label} (${detail})`;
  }

  // ── Support Level ──
  let supLines: string;
  if (sup.visitCount === 0) {
    supLines = `Support Level:      No distinct tests of ${formatPrice(sup.absoluteLow)}–${formatPrice(sup.zoneTop)} zone detected`;
  } else {
    const firstDate  = formatDateShort(sup.visitDates[0]);
    const latestDate = sup.visitDates.length > 1
      ? formatDateShort(sup.visitDates[sup.visitDates.length - 1])
      : '';
    const spanStr  = sup.spanMonths > 0 ? ` over ${sup.spanMonths.toFixed(1)} months` : '';
    const dateStr  = latestDate
      ? ` (first: ${firstDate}, latest: ${latestDate})`
      : ` (${firstDate})`;
    const countStr = `${sup.visitCount} ${sup.visitCount === 1 ? 'test' : 'tests'}`;

    const strengthNote =
      sup.classification === 'single test'    ? 'Single test — watching for confirmation' :
      sup.classification === 'double bottom'  ? 'Double bottom' :
      'Multiple tests — strong base evidence';

    supLines =
      `Support Level:      ${countStr} of ${formatPrice(sup.absoluteLow)}–${formatPrice(sup.zoneTop)} zone${spanStr}${dateStr}\n` +
      `Classification:     ${strengthNote}`;
  }

  // ── Price Range ──
  const approxMonths = Math.round(rng.periodDays / 21);
  const [t1, t2, t3] = rng.thirdRanges;
  const compressionTag = rng.compressing ? '— compressing' : '— not compressing';
  const rangeClassLabel = rng.classification.charAt(0).toUpperCase() + rng.classification.slice(1);

  const rngLines =
    `Price Range (${approxMonths}mo):   High ${formatPrice(rng.periodHigh)}, Low ${formatPrice(rng.periodLow)} (${rng.rangeDepth.toFixed(1)}% depth)\n` +
    `Range Compression:  Third 1: ${t1.toFixed(1)}%, Third 2: ${t2.toFixed(1)}%, Third 3: ${t3.toFixed(1)}% ${compressionTag}\n` +
    `Classification:     ${rangeClassLabel}`;

  return `BASING ANALYSIS
  ${trajLine}
  ${supLines}
  ${rngLines}`;
}

// ─── Text Formatter ─────────────────────────────────────────────────────────

function formatTextBlock(r: IndicatorResult): string {
  const snapshotLine = (ma: MAData): string =>
    `    Snapshots: ${ma.snapshots.map((s, i) => `${formatPrice(s)} (${ma.snapshotLabels[i]})`).join(' → ')}`;

  const crossLines = r.fiftySMAInteraction.crosses.map(c => {
    const mag = `max excursion ${c.maxExcursion.toFixed(2)}x ATR (${c.classification})`;
    if (c.direction === 'above-to-below') {
      return `  [${c.date}]: Closed below 50 SMA, ${mag}, stayed below ${c.daysOnOtherSide} days`;
    }
    return `  [${c.date}]: Recovered above 50 SMA, ${mag}, after ${c.daysOnOtherSide} days below`;
  }).join('\n');

  return `STRUCTURED DATA BLOCK: ${r.ticker}
${'═'.repeat(50)}
Generated: ${r.generatedAt}

PRICE & MOVING AVERAGES
  Current Price:    ${formatPrice(r.currentPrice)}
  10 EMA:          ${formatPrice(r.ema10.current)} (${r.ema10.slopeDirection}, ${r.ema10.slopeTrajectory})
${snapshotLine(r.ema10)}
  21 EMA:          ${formatPrice(r.ema21.current)} (${r.ema21.slopeDirection}, ${r.ema21.slopeTrajectory})
${snapshotLine(r.ema21)}
  50 SMA:          ${formatPrice(r.sma50.current)} (${r.sma50.slopeDirection}, ${r.sma50.slopeTrajectory})
${snapshotLine(r.sma50)}
  200 SMA:         ${formatPrice(r.sma200.current)} (${r.sma200.slopeDirection}, ${r.sma200.slopeTrajectory})
${snapshotLine(r.sma200)}
  MA Ordering:     ${r.maOrdering}

PRICE POSITION
  vs 10 EMA:       ${formatPct(r.pricePosition.vsEMA10)}
  vs 21 EMA:       ${formatPct(r.pricePosition.vsEMA21)}
  vs 50 SMA:       ${formatPct(r.pricePosition.vsSMA50)}
  vs 200 SMA:      ${formatPct(r.pricePosition.vsSMA200)}
  ATR Extension:   ${r.pricePosition.atrExtension.toFixed(2)}x ATR from 21 EMA

50 SMA INTERACTION (Last 6 Months)
  Crosses:         ${r.fiftySMAInteraction.totalCrosses} total (${r.fiftySMAInteraction.meaningfulCrosses} meaningful, ${r.fiftySMAInteraction.trivialCrosses} trivial)
  Breakdown:       ${r.fiftySMAInteraction.aboveToBelowCount} above→below, ${r.fiftySMAInteraction.belowToAboveCount} below→above
  Avg Magnitude:   ${r.fiftySMAInteraction.avgCrossMagnitude.toFixed(2)}x ATR
${crossLines || '  No crosses in the last 6 months'}
  Current:         ${r.fiftySMAInteraction.currentPosition === 'above' ? 'Above' : 'Below'} 50 SMA for ${r.fiftySMAInteraction.daysAtCurrentPosition} days
  Longest streak above: ${r.fiftySMAInteraction.longestStreakAbove} days
  Longest streak below: ${r.fiftySMAInteraction.longestStreakBelow} days

ATR
  14-day ATR:      ${formatPrice(r.atr.value)} (${r.atr.percentOfPrice.toFixed(1)}% of price)

RELATIVE STRENGTH
  RS Line:         ${r.relativeStrength.rsLine.toFixed(4)}
  RS 21 EMA:       ${r.relativeStrength.rsMA.toFixed(4)}
  RS Status:       ${r.relativeStrength.rsStatus === 'blue' ? 'Blue (outperforming)' : 'Pink (underperforming)'}
  RS Phase:        ${r.relativeStrength.rsPhase.charAt(0).toUpperCase() + r.relativeStrength.rsPhase.slice(1)} (3-month trend)
  RSNHBP:          ${r.relativeStrength.rsnhbp ? 'Yes' : 'No'}
  Mansfield RS:    ${r.relativeStrength.mansfieldRS >= 0 ? '+' : ''}${r.relativeStrength.mansfieldRS.toFixed(2)} (${r.relativeStrength.mansfieldAboveZero ? 'above' : 'below'} zero)

MA CONVERGENCE
  Full MA Spread:  ${r.maConvergence.maSpread.toFixed(1)}% (${r.maConvergence.maConvergence})
  Upper MA Spread: ${r.maConvergence.maSpreadUpper.toFixed(1)}% (${r.maConvergence.maConvergenceUpper})  [10E, 21E, 50S only]

RELATIVE VOLUME
  50-day Avg Vol:  ${formatNumber(r.relativeVolume.avgVol50)}
  Today RelVol:    ${r.relativeVolume.todayRelVol.toFixed(2)}x
  Avg RelVol Up Days (20d):   ${r.relativeVolume.avgRelVolUpDays.toFixed(2)}x
  Avg RelVol Down Days (20d): ${r.relativeVolume.avgRelVolDownDays.toFixed(2)}x
  Volume Trend:    ${r.relativeVolume.volumeTrend.charAt(0).toUpperCase() + r.relativeVolume.volumeTrend.slice(1)}

52-WEEK RANGE
  52-Week High:    ${formatPrice(r.fiftyTwoWeek.high)} (${r.fiftyTwoWeek.highDate})
  52-Week Low:     ${formatPrice(r.fiftyTwoWeek.low)} (${r.fiftyTwoWeek.lowDate})
  From High:       ${formatPct(r.fiftyTwoWeek.fromHigh)}
  From Low:        ${formatPct(r.fiftyTwoWeek.fromLow)}

${formatBasingAnalysis(r.basingAnalysis)}
${'═'.repeat(50)}`;
}
