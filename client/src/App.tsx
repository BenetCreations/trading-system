import { useState, useEffect, useReducer, useMemo } from 'react';
import { useTrades } from './hooks/useTrades';
import { usePositions } from './hooks/usePositions';
import { useEvaluation } from './hooks/useEvaluation';
import { getConfig, updateConfig } from './api';
import type { AppConfig } from './types';
import {
  calcEquity, calcMonthlyPL, calcOpenMetrics,
} from './utils/metrics';
import {
  startQueue, resetQueue, subscribeQueue, getQueueState,
} from './services/queueRunner';
import { SummaryStrip } from './components/SummaryStrip';
import { AlertBar } from './components/AlertBar';
import { ConfigModal } from './components/ConfigModal';
import { TradeForm } from './components/TradeForm';
import { TradeTable } from './components/TradeTable';
import { PositionTable } from './components/PositionTable';
import { EquityChart } from './components/EquityChart';
import { MonthlyPLChart } from './components/MonthlyPLChart';
import { KellyPanel } from './components/KellyPanel';
import { RegimePanel } from './components/RegimePanel';
import { ScreenerInput } from './components/ScreenerInput';
import { EvaluationResult } from './components/EvaluationResult';
import { HistoryTab } from './components/HistoryTab';
import { RevalQueue } from './components/RevalQueue';

function useQueueStatus() {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribeQueue(forceUpdate), []);
  return getQueueState().status;
}

const TABS = ['Trades', 'Positions', 'Equity', 'Kelly', 'Regime', 'Screen', 'History'] as const;
type Tab = typeof TABS[number];

const DEFAULT_CONFIG: AppConfig = {
  startingEquity: 100000,
  currentRegime: 1,
  marketStage: 2,
  targetPositions: 10,
  regimeStartDate: '',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('Trades');
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [configModalOpen, setConfigModalOpen] = useState(false);

  const handleSaveConfig = async (updates: Partial<AppConfig>) => {
    const saved = await updateConfig(updates);
    setConfig(saved);
  };

  const handleDataChange = async () => {
    await Promise.all([
      refreshTrades(),
      refreshPositions(),
      getConfig().then(setConfig),
    ]);
  };

  const {
    trades, loading: tradesLoading, error: tradesError,
    metrics, addTrade, removeTrade, refreshTrades,
  } = useTrades();

  const {
    positions, loading: positionsLoading,
    addPosition, updatePosition, removePosition, refreshPrices, refreshPositions,
  } = usePositions();

  const {
    result: evalResult, loading: evalLoading, error: evalError,
    currentTicker: evalTicker,
    evaluate, cancel: cancelEval, clear: clearEval,
  } = useEvaluation();

  const queueStatus = useQueueStatus();

  useEffect(() => {
    getConfig().then(setConfig).catch(console.error);
  }, []);

  const loading = tradesLoading || positionsLoading;

  const currentEquity = useMemo(
    () => config.startingEquity + trades.reduce((s, t) => s + t.dollarPL, 0),
    [trades, config.startingEquity],
  );

  const equityData = useMemo(
    () => calcEquity(trades, config.startingEquity),
    [trades, config.startingEquity],
  );

  const monthlyData = useMemo(() => calcMonthlyPL(trades), [trades]);

  const openMetrics = useMemo(
    () => calcOpenMetrics(positions, currentEquity, config.currentRegime),
    [positions, currentEquity, config.currentRegime],
  );

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text)]">
      {/* Title bar */}
      <header className="bg-[var(--color-bg-card)] border-b border-[var(--color-accent)] px-6 py-2 flex items-center justify-between">
        <h1 className="text-base font-bold text-[var(--color-highlight)] tracking-wide">Trading System</h1>
        {loading && <span className="text-xs text-[var(--color-text-muted)]">Loading…</span>}
      </header>

      {/* Summary strip — sticky */}
      <SummaryStrip
        trades={trades}
        positions={positions}
        config={config}
        openMetrics={openMetrics}
        onOpenConfig={() => setConfigModalOpen(true)}
      />

      {/* Config modal */}
      {configModalOpen && (
        <ConfigModal
          config={config}
          onSave={handleSaveConfig}
          onClose={() => setConfigModalOpen(false)}
          onDataChange={handleDataChange}
        />
      )}

      {/* Alert bar — always visible, between strip and tabs */}
      <AlertBar alerts={openMetrics.alerts} />

      {/* Tab nav */}
      <nav className="bg-[var(--color-bg-card)] px-6 flex gap-1 border-b border-[var(--color-accent)]">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              'px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === tab
                ? 'text-[var(--color-highlight)] border-b-2 border-[var(--color-highlight)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <main className="p-6">
        {activeTab === 'Trades' && (
          <>
            {tradesError && (
              <div className="mb-4 flex items-center justify-between text-sm bg-[var(--color-bg-card)] border border-[var(--color-highlight)] rounded p-3">
                <span className="text-[var(--color-red)]">Failed to load trades: {tradesError}</span>
                <button
                  onClick={refreshTrades}
                  className="ml-4 text-xs text-[var(--color-text-muted)] underline hover:text-[var(--color-text)]"
                >
                  Retry
                </button>
              </div>
            )}
            <TradeForm onAdd={addTrade} />
            <TradeTable trades={trades} metrics={metrics} onRemove={removeTrade} />
          </>
        )}

        {activeTab === 'Positions' && (
          <PositionTable
            positions={positions}
            openMetrics={openMetrics}
            onDelete={removePosition}
            onUpdate={updatePosition}
            onRefreshPrices={refreshPrices}
          />
        )}

        {activeTab === 'Equity' && (
          <div className="space-y-4">
            <EquityChart equityData={equityData} />
            <MonthlyPLChart monthlyData={monthlyData} />
          </div>
        )}

        {activeTab === 'Kelly' && (
          <KellyPanel trades={trades} config={config} currentEquity={currentEquity} />
        )}

        {activeTab === 'Regime' && (
          <RegimePanel config={config} trades={trades} />
        )}

        {activeTab === 'Screen' && (
          queueStatus !== 'idle'
            ? <RevalQueue
                onDone={resetQueue}
                onBackToHistory={() => { resetQueue(); setActiveTab('History'); }}
              />
            : evalResult
              ? <EvaluationResult result={evalResult} onClear={clearEval} />
              : <ScreenerInput onEvaluate={evaluate} onBatchEvaluate={startQueue} onCancel={cancelEval} loading={evalLoading} error={evalError} activeTicker={evalTicker} />
        )}

        {activeTab === 'History' && (
          <HistoryTab onRevaluate={(tickers: string[]) => { startQueue(tickers); setActiveTab('Screen'); }} />
        )}
      </main>
    </div>
  );
}
