export interface Trade {
  id: string;
  ticker: string;
  setupType: 'Cat A' | 'Cat B' | 'VCP Base 1' | 'VCP Base 2' | 'VCP Base 3' | 'Tight Range' | 'Pullback' | 'HV Gap';
  tier: 0 | 1 | 2 | 3;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  stopPrice: number;
  exitPrice: number;
  shares: number;
  regime: 1 | 2;
  notes: string;
}
