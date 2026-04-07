export interface AtrBacktestRow {
  id: number;
  ticker: string;
  start_date: string;
  end_date: string;
  reset_threshold: number;
  ran_at: string;
  peak_count: number;
  max_mult: number;
  avg_mult: number;
  median_mult: number;
  above7_count: number;
  above7_pct: number;
  results_json: string;
}

export interface AtrBacktestListItem {
  id: number;
  ticker: string;
  startDate: string;
  endDate: string;
  resetThreshold: number;
  ranAt: string;
  peakCount: number;
  maxMult: number;
  avgMult: number;
  medianMult: number;
  above7Count: number;
  above7Pct: number;
}
