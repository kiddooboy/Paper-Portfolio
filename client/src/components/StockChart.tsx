import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, ColorType, CrosshairMode } from 'lightweight-charts';
import axios from 'axios';
import { cn } from '../lib/utils';

interface Bar { date: string; open: number; high: number; low: number; close: number; volume: number }

const RANGES = [
  { label: '1D', range: '1d',  interval: '1h'  },
  { label: '1W', range: '5d',  interval: '1h'  },
  { label: '1M', range: '1mo', interval: '1d'  },
  { label: '3M', range: '3mo', interval: '1d'  },
  { label: '1Y', range: '1y',  interval: '1wk' },
] as const;

function toUtcTimestamp(dateStr: string): number {
  // Returns seconds since epoch, interpreted as UTC date
  const d = new Date(dateStr);
  return Math.floor(d.getTime() / 1000);
}

interface Props {
  symbol: string;
  exchange?: string;
}

export default function StockChart({ symbol, exchange = 'NSE' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const [activeRange, setActiveRange] = useState<typeof RANGES[number]>(RANGES[2]);
  const [chartType, setChartType] = useState<'candle' | 'line'>('candle');
  const [bars, setBars] = useState<Bar[]>([]);
  const [loading, setLoading] = useState(true);
  const [crosshairData, setCrosshairData] = useState<Bar | null>(null);

  // Fetch history whenever range/exchange/symbol changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    axios.get(`/api/stocks/${symbol}/history`, {
      params: { exchange, range: activeRange.range, interval: activeRange.interval },
    }).then((res) => {
      if (!cancelled) {
        const cleaned: Bar[] = (res.data || [])
          .filter((b: any) => b.open && b.close && b.high && b.low)
          .map((b: any) => ({ ...b }));
        setBars(cleaned);
        setLoading(false);
      }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, exchange, activeRange]);

  // Build/rebuild chart whenever bars or chart type change
  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return;

    const isDark = document.documentElement.classList.contains('dark');
    const bg        = isDark ? '#1a1f2e' : '#ffffff';
    const textColor = isDark ? '#9ca3af' : '#6b7280';
    const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';

    // Destroy old chart
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: bg }, textColor },
      grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor },
      timeScale: { borderColor, timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
      width: containerRef.current.clientWidth,
      height: 360,
    });
    chartRef.current = chart;

    // Sort bars by time ascending
    const sorted = [...bars].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (chartType === 'candle') {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: '#00c087',
        downColor: '#ef4444',
        borderUpColor: '#00c087',
        borderDownColor: '#ef4444',
        wickUpColor: '#00c087',
        wickDownColor: '#ef4444',
      });
      series.setData(sorted.map((b) => ({
        time: toUtcTimestamp(b.date) as any,
        open: b.open, high: b.high, low: b.low, close: b.close,
      })));

      // Crosshair subscription for OHLCV display
      chart.subscribeCrosshairMove((param) => {
        if (param.time) {
          const ts = Number(param.time);
          const bar = sorted.find((b) => toUtcTimestamp(b.date) === ts);
          setCrosshairData(bar ?? null);
        } else {
          setCrosshairData(null);
        }
      });
    } else {
      const upColor = '#00c087';
      const series = chart.addSeries(LineSeries, {
        color: upColor,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        lastValueVisible: true,
        priceLineVisible: true,
      });
      series.setData(sorted.map((b) => ({ time: toUtcTimestamp(b.date) as any, value: b.close })));
    }

    // Volume histogram on a separate pane
    const volSeries = chart.addSeries(HistogramSeries, {
      color: '#00c08740',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volSeries.setData(sorted.map((b) => ({
      time: toUtcTimestamp(b.date) as any,
      value: b.volume,
      color: b.close >= b.open ? '#00c08740' : '#ef444440',
    })));

    chart.timeScale().fitContent();

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  }, [bars, chartType]);

  const lastBar = bars.length > 0 ? bars[bars.length - 1] : null;
  const displayBar = crosshairData ?? lastBar;

  return (
    <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-4 space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Range selector */}
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setActiveRange(r)}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-semibold transition',
                activeRange.label === r.label
                  ? 'bg-groww-primary text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Chart type toggle */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => setChartType('candle')}
            className={cn('px-3 py-1 rounded-md text-xs font-semibold transition', chartType === 'candle' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400')}
          >
            Candle
          </button>
          <button
            onClick={() => setChartType('line')}
            className={cn('px-3 py-1 rounded-md text-xs font-semibold transition', chartType === 'line' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400')}
          >
            Line
          </button>
        </div>
      </div>

      {/* OHLCV crosshair readout */}
      {displayBar && chartType === 'candle' && (
        <div className="flex gap-4 text-[11px] font-medium flex-wrap">
          <span className="text-gray-400">O <span className="text-gray-700 dark:text-gray-200">{displayBar.open?.toFixed(2)}</span></span>
          <span className="text-gray-400">H <span className="text-gain">{displayBar.high?.toFixed(2)}</span></span>
          <span className="text-gray-400">L <span className="text-loss">{displayBar.low?.toFixed(2)}</span></span>
          <span className="text-gray-400">C <span className={displayBar.close >= displayBar.open ? 'text-gain' : 'text-loss'}>{displayBar.close?.toFixed(2)}</span></span>
          <span className="text-gray-400">V <span className="text-gray-700 dark:text-gray-200">{displayBar.volume?.toLocaleString('en-IN')}</span></span>
        </div>
      )}

      {/* Chart */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-groww-card/60 rounded-xl z-10">
            <div className="w-6 h-6 border-2 border-groww-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <div ref={containerRef} className="w-full rounded-xl overflow-hidden" />
      </div>
    </div>
  );
}
