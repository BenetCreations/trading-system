import { useEffect, useRef } from 'react';
import type { EquityPoint } from '../utils/metrics';

interface EquityChartProps {
  equityData: EquityPoint[];
}

// Map drawdown magnitude to a background fill color
function ddBgColor(drawdown: number): string {
  if (drawdown >= 8) return 'rgba(248,113,113,0.18)';
  if (drawdown >= 7) return 'rgba(248,113,113,0.12)';
  if (drawdown >= 5) return 'rgba(251,146,60,0.10)';
  if (drawdown >= 3) return 'rgba(250,204,21,0.08)';
  return 'rgba(74,222,128,0.05)';
}

export function EquityChart({ equityData }: EquityChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (!canvasRef.current || equityData.length < 2) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ChartJS = (window as any).Chart;
    if (!ChartJS) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const currentDD = equityData[equityData.length - 1]?.drawdown ?? 0;
    const bgColor = ddBgColor(currentDD);
    const startingEquity = equityData[0]?.equity ?? 0;

    const drawdownBgPlugin = {
      id: 'drawdownBackground',
      beforeDraw(chart: any) {
        const ctx = chart.ctx as CanvasRenderingContext2D;
        const { chartArea } = chart;
        ctx.save();
        ctx.fillStyle = bgColor;
        ctx.fillRect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
        ctx.restore();
      },
    };

    chartRef.current = new ChartJS(canvasRef.current, {
      type: 'line',
      data: {
        labels: equityData.map(p => p.date),
        datasets: [
          {
            label: 'Equity',
            data: equityData.map(p => p.equity),
            borderColor: '#e94560',
            borderWidth: 2,
            tension: 0.1,
            pointRadius: equityData.length > 50 ? 0 : 3,
            pointBackgroundColor: '#e94560',
            fill: false,
          },
          {
            label: 'Starting Equity',
            data: equityData.map(() => startingEquity),
            borderColor: '#a0a0b0',
            borderWidth: 1,
            borderDash: [5, 5],
            tension: 0,
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#16213e',
            borderColor: '#0f3460',
            borderWidth: 1,
            titleColor: '#a0a0b0',
            bodyColor: '#e0e0e0',
            callbacks: {
              label: (ctx: any) => {
                if (ctx.datasetIndex === 1) return null;
                const pt = equityData[ctx.dataIndex];
                return [
                  `Equity: $${Math.round(ctx.parsed.y).toLocaleString()}`,
                  `Drawdown: ${pt.drawdown.toFixed(1)}%`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#a0a0b0', maxTicksLimit: 10, maxRotation: 0 },
            grid: { color: '#0f3460' },
            border: { color: '#0f3460' },
          },
          y: {
            ticks: {
              color: '#a0a0b0',
              callback: (v: number) => '$' + Math.round(v).toLocaleString(),
            },
            grid: { color: '#0f3460' },
            border: { color: '#0f3460' },
          },
        },
      },
      plugins: [drawdownBgPlugin],
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [equityData]);

  if (equityData.length < 2) {
    return (
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg h-64 flex items-center justify-center text-[var(--color-text-muted)] text-sm">
        No trades yet — equity curve will appear here.
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-4">
      <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-3">Equity Curve</div>
      <div className="h-72 relative">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
