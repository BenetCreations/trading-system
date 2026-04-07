export interface Position {
  id: string;
  ticker: string;
  entryDate: string;
  entryPrice: number;
  currentPrice: number;
  stopPrice: number;
  shares: number;
  tranche: number;
  sector: string;
  setupType: string;
  tier: 0 | 1 | 2 | 3;
  earningsDate?: string;
  notes: string;
  atrSellThreshold: number | null;
}
