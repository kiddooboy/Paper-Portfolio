import { useEffect, useRef, useState } from 'react';
import {
  createChart, CandlestickSeries, LineSeries, HistogramSeries,
  ColorType, CrosshairMode, LineStyle,
} from 'lightweight-charts';
import axios from 'axios';
import { cn } from '../lib/utils';
import {
  MousePointer2, Minus, TrendingUp, Trash2,
  ChevronDown, X, Check,
  AlignCenter, Type, Smile, Maximize2, ZoomIn, Crosshair,
} from 'lucide-react';
import { useMarketStore } from '../store/marketStore';

interface Bar { date: string; open: number; high: number; low: number; close: number; volume: number }

const RANGES = [
  { label: '1D', range: '1d',  interval: '5m'  },
  { label: '1W', range: '5d',  interval: '1h'  },
  { label: '1M', range: '1mo', interval: '1d'  },
  { label: '3M', range: '3mo', interval: '1d'  },
  { label: '1Y', range: '1y',  interval: '1wk' },
] as const;

const IST_OFFSET_S = 5.5 * 3600;
function toTimestamp(dateStr: string): number {
  const epochS = Math.floor(new Date(dateStr).getTime() / 1000);
  return (dateStr.includes('T') || dateStr.includes(' ')) ? epochS + IST_OFFSET_S : epochS;
}

// ── Indicator math ────────────────────────────────────────────────────────────
function calcSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    return closes.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period;
  });
}

function calcEMA(closes: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    if (i === period - 1) { prev = closes.slice(0, period).reduce((s, v) => s + v, 0) / period; out.push(prev); continue; }
    prev = closes[i] * k + prev! * (1 - k);
    out.push(prev);
  }
  return out;
}

function calcBB(closes: number[], period = 20, mult = 2) {
  const sma = calcSMA(closes, period);
  return closes.map((_, i) => {
    if (sma[i] === null) return { upper: null, mid: null, lower: null };
    const slice = closes.slice(Math.max(0, i - period + 1), i + 1);
    const mean = sma[i]!;
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length);
    return { upper: mean + mult * std, mid: mean, lower: mean - mult * std };
  });
}

function calcRSI(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d / period; else avgLoss += (-d) / period;
  }
  out[period] = 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = 100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss));
  }
  return out;
}

function calcMACD(closes: number[]) {
  const e12 = calcEMA(closes, 12);
  const e26 = calcEMA(closes, 26);
  const macdLine = closes.map((_, i) =>
    e12[i] !== null && e26[i] !== null ? e12[i]! - e26[i]! : null
  );
  const validIdxs = macdLine.map((v, i) => v !== null ? i : -1).filter(i => i >= 0);
  const signalRaw = calcEMA(validIdxs.map(i => macdLine[i]!), 9);
  const signal: (number | null)[] = new Array(closes.length).fill(null);
  validIdxs.forEach((orig, j) => { signal[orig] = signalRaw[j]; });
  return closes.map((_, i) => ({
    macd: macdLine[i],
    signal: signal[i],
    histogram: macdLine[i] !== null && signal[i] !== null ? macdLine[i]! - signal[i]! : null,
  }));
}

function calcVWAP(bars: Bar[]): (number | null)[] {
  let cumTP = 0, cumVol = 0;
  return bars.map(b => {
    cumTP += ((b.high + b.low + b.close) / 3) * b.volume;
    cumVol += b.volume;
    return cumVol > 0 ? cumTP / cumVol : null;
  });
}

// ── Indicator definitions ─────────────────────────────────────────────────────
const IND_DEFS = [
  { key: 'ma20',  label: 'MA 20',           color: '#f59e0b', sub: false },
  { key: 'ma50',  label: 'MA 50',           color: '#3b82f6', sub: false },
  { key: 'ma200', label: 'MA 200',          color: '#ec4899', sub: false },
  { key: 'ema9',  label: 'EMA 9',           color: '#8b5cf6', sub: false },
  { key: 'ema21', label: 'EMA 21',          color: '#06b6d4', sub: false },
  { key: 'bb',    label: 'Bollinger Bands', color: '#94a3b8', sub: false },
  { key: 'vwap',  label: 'VWAP',            color: '#10b981', sub: false },
  { key: 'rsi',   label: 'RSI 14',          color: '#a855f7', sub: true  },
  { key: 'macd',  label: 'MACD',            color: '#f97316', sub: true  },
] as const;
type IndKey = typeof IND_DEFS[number]['key'];
type Indicators = Record<IndKey, boolean>;

// ── Drawing tools ─────────────────────────────────────────────────────────────
type DrawTool = 'cursor' | 'trendline' | 'hline' | 'channel' | 'text' | 'emoji' | 'measure' | 'zoom' | 'magnet';

const TOOL_GROUPS: { id: DrawTool; title: string; Icon: any }[][] = [
  [{ id: 'cursor', title: 'Cursor', Icon: MousePointer2 }],
  [
    { id: 'trendline', title: 'Trend Line (click 2 pts)', Icon: TrendingUp },
    { id: 'hline',     title: 'Horizontal Line',         Icon: Minus      },
    { id: 'channel',   title: 'Parallel Channel (2 pts)', Icon: AlignCenter },
  ],
  [
    { id: 'text',  title: 'Text Label', Icon: Type  },
    { id: 'emoji', title: 'Emoji Marker', Icon: Smile },
  ],
  [
    { id: 'measure', title: 'Measure (2 pts)', Icon: Maximize2 },
    { id: 'zoom',    title: 'Zoom Range (2 pts)', Icon: ZoomIn  },
    { id: 'magnet',  title: 'Snap to OHLC', Icon: Crosshair },
  ],
];

const TOOL_HINTS: Partial<Record<DrawTool, string>> = {
  trendline: 'Click 2 points to draw trend line',
  hline:     'Click to draw horizontal line',
  channel:   'Click upper then lower price for parallel channel',
  text:      'Click to add text label',
  emoji:     'Click to place emoji marker',
  measure:   'Click 2 points to measure range',
  zoom:      'Click 2 points to zoom into that range',
  magnet:    'Click to snap-draw horizontal line to OHLC',
};

const EMOJIS = ['📈', '📉', '⭐', '✅', '❌', '🎯', '💰', '⚠️', '🔴', '🟢', '💡', '🔔'];

// ── Scale margins helper ──────────────────────────────────────────────────────
function getMargins(showRsi: boolean, showMacd: boolean) {
  if (!showRsi && !showMacd) return { price: { top: 0.02, bottom: 0.20 }, volume: { top: 0.82, bottom: 0.00 }, rsi: null, macd: null };
  if (showRsi && !showMacd)  return { price: { top: 0.02, bottom: 0.38 }, volume: { top: 0.63, bottom: 0.26 }, rsi: { top: 0.76, bottom: 0.02 }, macd: null };
  if (!showRsi && showMacd)  return { price: { top: 0.02, bottom: 0.38 }, volume: { top: 0.63, bottom: 0.26 }, rsi: null, macd: { top: 0.76, bottom: 0.02 } };
  return { price: { top: 0.02, bottom: 0.54 }, volume: { top: 0.47, bottom: 0.42 }, rsi: { top: 0.59, bottom: 0.24 }, macd: { top: 0.77, bottom: 0.02 } };
}

function getChartHeight(showRsi: boolean, showMacd: boolean) {
  return 310 + (showRsi ? 100 : 0) + (showMacd ? 100 : 0);
}

interface Props { symbol: string; exchange?: string }

export default function StockChart({ symbol, exchange = 'NSE' }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const chartRef      = useRef<ReturnType<typeof createChart> | null>(null);
  const mainSerRef    = useRef<any>(null);
  const indSerRef     = useRef<Map<string, any[]>>(new Map());
  const plinesRef     = useRef<Array<{ series: any; line: any }>>([]);
  const trendRef      = useRef<{ time: any; price: number } | null>(null);
  const channelRef    = useRef<{ price: number } | null>(null);
  const measureRef    = useRef<{ price: number; time: any } | null>(null);
  const zoomRef       = useRef<{ time: any } | null>(null);
  const indRef        = useRef<HTMLDivElement>(null);

  const [activeRange, setActiveRange] = useState<typeof RANGES[number]>(RANGES[0]);
  const [chartType,   setChartType]   = useState<'candle' | 'line'>('candle');
  const [bars,        setBars]        = useState<Bar[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [crosshair,   setCrosshair]   = useState<Bar | null>(null);
  const [chartReady,  setChartReady]  = useState(false);
  const [indicators,  setIndicators]  = useState<Indicators>({
    ma20: false, ma50: false, ma200: false, ema9: false, ema21: false,
    bb: false, vwap: false, rsi: false, macd: false,
  });
  const [activeTool,     setActiveTool]     = useState<DrawTool>('cursor');
  const [indOpen,        setIndOpen]        = useState(false);
  const [indSearch,      setIndSearch]      = useState('');
  const [emojiOpen,      setEmojiOpen]      = useState(false);
  const [emojiPos,       setEmojiPos]       = useState<{ price: number; time: any } | null>(null);
  const [measureResult,  setMeasureResult]  = useState<{ diff: number; pct: number; fromP: number; toP: number } | null>(null);
  const [refreshCount,   setRefreshCount]   = useState(0);

  const liveQuote    = useMarketStore(s => s.quotes[symbol.toUpperCase()]);
  const marketIsOpen = useMarketStore(s => s.status?.isOpen ?? false);

  // ── Close indicator dropdown on outside click ──────────────────────────────
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (indRef.current && !indRef.current.contains(e.target as Node)) setIndOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Auto-refresh during market hours (every 5 min to pull new bars) ────────
  useEffect(() => {
    if (!marketIsOpen) return;
    const id = setInterval(() => setRefreshCount(c => c + 1), 5 * 60_000);
    return () => clearInterval(id);
  }, [marketIsOpen]);

  // ── Fetch history ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    axios.get(`/api/stocks/${symbol}/history`, {
      params: { exchange, range: activeRange.range, interval: activeRange.interval },
    }).then(res => {
      if (cancelled) return;
      const raw: Bar[] = (res.data || []).filter((b: any) => b.close != null && b.close > 0);
      setBars(raw);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, exchange, activeRange, refreshCount]);

  // ── Build chart ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return;

    const isDark      = document.documentElement.classList.contains('dark');
    const bgColor     = isDark ? '#1a1f2e' : '#ffffff';
    const textColor   = isDark ? '#9ca3af' : '#6b7280';
    const gridColor   = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';

    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    indSerRef.current.clear();
    plinesRef.current = [];
    trendRef.current = channelRef.current = measureRef.current = zoomRef.current = null;

    const margins = getMargins(indicators.rsi, indicators.macd);
    const height  = getChartHeight(indicators.rsi, indicators.macd);

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: bgColor }, textColor },
      grid:   { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor, scaleMargins: margins.price },
      timeScale: {
        borderColor, timeVisible: true, secondsVisible: false,
        fixLeftEdge: false, fixRightEdge: true,
        rightOffset: 2, barSpacing: 8,
      },
      width:  containerRef.current.clientWidth,
      height,
    });
    chartRef.current = chart;

    const sorted = [...bars].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let mainSeries: any;
    if (chartType === 'candle') {
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#00c087', downColor: '#ef4444',
        borderUpColor: '#00c087', borderDownColor: '#ef4444',
        wickUpColor: '#00c087', wickDownColor: '#ef4444',
      });
      mainSeries.setData(sorted.map(b => ({
        time: toTimestamp(b.date) as any,
        open: b.open, high: b.high, low: b.low, close: b.close,
      })));
      chart.subscribeCrosshairMove(param => {
        if (param.time) {
          const ts = Number(param.time);
          setCrosshair(sorted.find(b => toTimestamp(b.date) === ts) ?? null);
        } else setCrosshair(null);
      });
    } else {
      mainSeries = chart.addSeries(LineSeries, {
        color: '#00c087', lineWidth: 2,
        crosshairMarkerVisible: true, crosshairMarkerRadius: 4,
        lastValueVisible: true, priceLineVisible: true,
      });
      mainSeries.setData(sorted.map(b => ({ time: toTimestamp(b.date) as any, value: b.close })));
    }
    mainSerRef.current = mainSeries;

    const volSeries = chart.addSeries(HistogramSeries, {
      color: '#00c08740', priceFormat: { type: 'volume' }, priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: margins.volume });
    volSeries.setData(sorted.map(b => ({
      time: toTimestamp(b.date) as any, value: b.volume,
      color: b.close >= b.open ? '#00c08740' : '#ef444440',
    })));

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current)
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    setChartReady(true);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      mainSerRef.current = null;
      setChartReady(false);
    };
  }, [bars, chartType]);

  // ── Overlay + sub-pane indicators ─────────────────────────────────────────
  useEffect(() => {
    if (!chartReady || !chartRef.current || bars.length === 0) return;
    const chart = chartRef.current;

    for (const arr of indSerRef.current.values())
      arr.forEach(s => { try { chart.removeSeries(s); } catch {} });
    indSerRef.current.clear();

    const sorted = [...bars].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const closes = sorted.map(b => b.close);
    const times  = sorted.map(b => toTimestamp(b.date) as any);

    const toSer = (vals: (number | null)[]) =>
      vals.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as any[];

    const margins = getMargins(indicators.rsi, indicators.macd);
    chart.applyOptions({ height: getChartHeight(indicators.rsi, indicators.macd) });
    chart.priceScale('right').applyOptions({ scaleMargins: margins.price });
    chart.priceScale('volume').applyOptions({ scaleMargins: margins.volume });

    const addLine = (key: string, data: any[], color: string, opts?: any) => {
      const s = chart.addSeries(LineSeries, {
        color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false, ...opts,
      });
      s.setData(data);
      indSerRef.current.set(key, [s]);
    };

    if (indicators.ma20)  addLine('ma20',  toSer(calcSMA(closes, 20)),  '#f59e0b');
    if (indicators.ma50)  addLine('ma50',  toSer(calcSMA(closes, 50)),  '#3b82f6');
    if (indicators.ma200) addLine('ma200', toSer(calcSMA(closes, 200)), '#ec4899');
    if (indicators.ema9)  addLine('ema9',  toSer(calcEMA(closes, 9)),   '#8b5cf6');
    if (indicators.ema21) addLine('ema21', toSer(calcEMA(closes, 21)),  '#06b6d4');

    if (indicators.bb) {
      const bb = calcBB(closes);
      const upper = bb.map((v, i) => v.upper !== null ? { time: times[i], value: v.upper } : null).filter(Boolean) as any[];
      const mid   = bb.map((v, i) => v.mid   !== null ? { time: times[i], value: v.mid   } : null).filter(Boolean) as any[];
      const lower = bb.map((v, i) => v.lower !== null ? { time: times[i], value: v.lower } : null).filter(Boolean) as any[];
      const su = chart.addSeries(LineSeries, { color: '#94a3b880', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      const sm = chart.addSeries(LineSeries, { color: '#94a3b8',   lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, lineStyle: LineStyle.Dashed });
      const sl = chart.addSeries(LineSeries, { color: '#94a3b880', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      su.setData(upper); sm.setData(mid); sl.setData(lower);
      indSerRef.current.set('bb', [su, sm, sl]);
    }

    if (indicators.vwap) addLine('vwap', toSer(calcVWAP(sorted)), '#10b981', { lineStyle: LineStyle.Dashed });

    if (indicators.rsi && margins.rsi) {
      const s = chart.addSeries(LineSeries, {
        color: '#a855f7', lineWidth: 1, priceScaleId: 'rsi',
        priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
      });
      s.setData(toSer(calcRSI(closes)));
      chart.priceScale('rsi').applyOptions({ scaleMargins: margins.rsi, borderVisible: true, alignLabels: true });
      s.createPriceLine({ price: 70, color: '#ef444460', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '70' });
      s.createPriceLine({ price: 30, color: '#22c55e60', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '30' });
      indSerRef.current.set('rsi', [s]);
    }

    if (indicators.macd && margins.macd) {
      const md = calcMACD(closes);
      const sm2 = chart.addSeries(LineSeries,      { color: '#f97316', lineWidth: 1, priceScaleId: 'macd', priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      const ss  = chart.addSeries(LineSeries,      { color: '#06b6d4', lineWidth: 1, priceScaleId: 'macd', priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      const sh  = chart.addSeries(HistogramSeries, { priceScaleId: 'macd', priceLineVisible: false, lastValueVisible: false });
      sm2.setData(md.map((v, i) => v.macd      !== null ? { time: times[i], value: v.macd      } : null).filter(Boolean) as any[]);
      ss.setData (md.map((v, i) => v.signal    !== null ? { time: times[i], value: v.signal    } : null).filter(Boolean) as any[]);
      sh.setData (md.map((v, i) => v.histogram !== null ? { time: times[i], value: v.histogram, color: v.histogram! >= 0 ? '#00c08760' : '#ef444460' } : null).filter(Boolean) as any[]);
      chart.priceScale('macd').applyOptions({ scaleMargins: margins.macd, borderVisible: true, alignLabels: true });
      indSerRef.current.set('macd', [sm2, ss, sh]);
    }

    chart.timeScale().fitContent();
  }, [indicators, chartReady, bars]);

  // ── Drawing tools ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartReady || !chartRef.current || !mainSerRef.current) return;
    const chart = chartRef.current;
    const main  = mainSerRef.current;
    const sorted = [...bars].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Reset pending multi-click states on tool change
    trendRef.current = channelRef.current = measureRef.current = zoomRef.current = null;
    setEmojiOpen(false);

    const onClick = (param: any) => {
      if (activeTool === 'cursor' || !param.point || !param.time) return;
      const rawPrice = main.coordinateToPrice(param.point.y);
      if (rawPrice === null || rawPrice === undefined) return;

      // ── Magnet: snap to nearest OHLC at this candle ──────────────────────
      const getSnappedPrice = (p: number): number => {
        if (activeTool !== 'magnet') return p;
        const ts = Number(param.time);
        const bar = sorted.find(b => toTimestamp(b.date) === ts);
        if (!bar) return p;
        const ohlc = [bar.open, bar.high, bar.low, bar.close];
        return ohlc.reduce((best, v) => Math.abs(v - p) < Math.abs(best - p) ? v : best);
      };

      const price = getSnappedPrice(rawPrice);

      // ── Horizontal line ──────────────────────────────────────────────────
      if (activeTool === 'hline') {
        const pl = main.createPriceLine({
          price, color: '#64748b', lineWidth: 1,
          lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '',
        });
        plinesRef.current.push({ series: main, line: pl });
      }

      // ── Magnet snap line ────────────────────────────────────────────────
      if (activeTool === 'magnet') {
        const pl = main.createPriceLine({
          price, color: '#00B386', lineWidth: 1,
          lineStyle: LineStyle.Solid, axisLabelVisible: true, title: '⊕',
        });
        plinesRef.current.push({ series: main, line: pl });
      }

      // ── Trend line ──────────────────────────────────────────────────────
      if (activeTool === 'trendline') {
        if (!trendRef.current) {
          trendRef.current = { time: param.time, price };
        } else {
          const t1 = trendRef.current;
          const ts = chart.addSeries(LineSeries, {
            color: '#ef4444', lineWidth: 1,
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
          });
          ts.setData([{ time: t1.time, value: t1.price }, { time: param.time, value: price }]);
          const existing = indSerRef.current.get('_drawings') ?? [];
          indSerRef.current.set('_drawings', [...existing, ts]);
          trendRef.current = null;
        }
      }

      // ── Parallel channel ─────────────────────────────────────────────────
      if (activeTool === 'channel') {
        if (!channelRef.current) {
          channelRef.current = { price };
        } else {
          const p1 = channelRef.current.price;
          const upper = Math.max(p1, price);
          const lower = Math.min(p1, price);
          const upperLine = main.createPriceLine({ price: upper, color: '#8b5cf6', lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'R' });
          const lowerLine = main.createPriceLine({ price: lower, color: '#8b5cf6', lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'S' });
          plinesRef.current.push({ series: main, line: upperLine });
          plinesRef.current.push({ series: main, line: lowerLine });
          channelRef.current = null;
        }
      }

      // ── Text label ───────────────────────────────────────────────────────
      if (activeTool === 'text') {
        const text = window.prompt('Enter label text:', '');
        if (text?.trim()) {
          const pl = main.createPriceLine({
            price, color: '#f59e0b', lineWidth: 1,
            lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: text.trim(),
          });
          plinesRef.current.push({ series: main, line: pl });
        }
      }

      // ── Emoji ─────────────────────────────────────────────────────────────
      if (activeTool === 'emoji') {
        setEmojiPos({ price, time: param.time });
        setEmojiOpen(true);
      }

      // ── Measure ──────────────────────────────────────────────────────────
      if (activeTool === 'measure') {
        if (!measureRef.current) {
          measureRef.current = { price, time: param.time };
        } else {
          const fromP = measureRef.current.price;
          const toP   = price;
          const diff  = toP - fromP;
          const pct   = (diff / fromP) * 100;
          // Draw measurement line
          const ts = chart.addSeries(LineSeries, {
            color: '#f97316', lineWidth: 2, lineStyle: LineStyle.Dashed,
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
          });
          ts.setData([
            { time: measureRef.current.time, value: fromP },
            { time: param.time, value: toP },
          ]);
          const existing = indSerRef.current.get('_drawings') ?? [];
          indSerRef.current.set('_drawings', [...existing, ts]);
          setMeasureResult({ diff, pct, fromP, toP });
          measureRef.current = null;
        }
      }

      // ── Zoom ──────────────────────────────────────────────────────────────
      if (activeTool === 'zoom') {
        if (!zoomRef.current) {
          zoomRef.current = { time: param.time };
        } else {
          const t1 = Math.min(Number(zoomRef.current.time), Number(param.time));
          const t2 = Math.max(Number(zoomRef.current.time), Number(param.time));
          if (t1 < t2) chart.timeScale().setVisibleRange({ from: t1 as any, to: t2 as any });
          zoomRef.current = null;
        }
      }
    };

    chart.subscribeClick(onClick);
    return () => {
      chart.unsubscribeClick(onClick);
      trendRef.current = channelRef.current = measureRef.current = zoomRef.current = null;
    };
  }, [activeTool, chartReady, bars]);

  // ── Live price update ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartReady || !mainSerRef.current || !liveQuote?.price || bars.length === 0) return;
    const sorted = [...bars].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const lastBar = sorted[sorted.length - 1];
    const lastTs  = toTimestamp(lastBar.date);
    try {
      if (chartType === 'candle') {
        mainSerRef.current.update({
          time:  lastTs as any,
          open:  lastBar.open,
          high:  Math.max(lastBar.high, liveQuote.price),
          low:   Math.min(lastBar.low,  liveQuote.price),
          close: liveQuote.price,
        });
      } else {
        mainSerRef.current.update({ time: lastTs as any, value: liveQuote.price });
      }
    } catch {}
  }, [liveQuote?.price, chartReady, chartType]);

  const clearDrawings = () => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const { series, line } of plinesRef.current)
      try { series.removePriceLine(line); } catch {}
    plinesRef.current = [];
    for (const s of indSerRef.current.get('_drawings') ?? [])
      try { chart.removeSeries(s); } catch {}
    indSerRef.current.delete('_drawings');
    trendRef.current = channelRef.current = measureRef.current = zoomRef.current = null;
    setMeasureResult(null);
    setEmojiOpen(false);
    setEmojiPos(null);
  };

  const toggleIndicator = (key: IndKey) =>
    setIndicators(prev => ({ ...prev, [key]: !prev[key] }));

  const lastBar      = bars.length > 0 ? bars[bars.length - 1] : null;
  const displayBar   = crosshair ?? lastBar;
  const activeCount  = Object.values(indicators).filter(Boolean).length;
  const filteredInds = IND_DEFS.filter(d =>
    d.label.toLowerCase().includes(indSearch.toLowerCase()) || d.key.toLowerCase().includes(indSearch.toLowerCase())
  );

  return (
    <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-3 space-y-2">
      {/* ── Top controls ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1">
          {RANGES.map(r => (
            <button key={r.label} onClick={() => setActiveRange(r)}
              className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold transition',
                activeRange.label === r.label ? 'bg-groww-primary text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800')}>
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Indicators dropdown */}
          <div className="relative" ref={indRef}>
            <button
              onClick={() => { setIndOpen(o => !o); setIndSearch(''); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition',
                indOpen || activeCount > 0
                  ? 'border-groww-primary text-groww-primary bg-groww-primary/5'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'
              )}
            >
              Indicators
              {activeCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-groww-primary text-white text-[9px] flex items-center justify-center font-bold">{activeCount}</span>
              )}
              <ChevronDown className={cn('w-3 h-3 opacity-60 transition-transform', indOpen && 'rotate-180')} />
            </button>

            {indOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-60 bg-white dark:bg-groww-card border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="p-2 border-b border-gray-100 dark:border-gray-800">
                  <input autoFocus placeholder="Search indicators…" value={indSearch}
                    onChange={e => setIndSearch(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 rounded-lg outline-none placeholder-gray-400" />
                </div>
                {filteredInds.filter(d => !d.sub).length > 0 && (
                  <>
                    <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Overlay</div>
                    {filteredInds.filter(d => !d.sub).map(({ key, label, color }) => (
                      <button key={key} onClick={() => toggleIndicator(key as IndKey)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/60 transition">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className={indicators[key as IndKey] ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-500 dark:text-gray-400'}>{label}</span>
                        {indicators[key as IndKey] && <Check className="w-3 h-3 ml-auto text-groww-primary shrink-0" />}
                      </button>
                    ))}
                  </>
                )}
                {filteredInds.filter(d => d.sub).length > 0 && (
                  <>
                    <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-t border-gray-100 dark:border-gray-800">Oscillators</div>
                    {filteredInds.filter(d => d.sub).map(({ key, label, color }) => (
                      <button key={key} onClick={() => toggleIndicator(key as IndKey)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/60 transition">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className={indicators[key as IndKey] ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-500 dark:text-gray-400'}>{label}</span>
                        <span className="text-[9px] text-gray-400 ml-0.5">sub-pane</span>
                        {indicators[key as IndKey] && <Check className="w-3 h-3 ml-auto text-groww-primary shrink-0" />}
                      </button>
                    ))}
                  </>
                )}
                {filteredInds.length === 0 && <div className="px-3 py-4 text-xs text-gray-400 text-center">No results</div>}
                <div className="h-2" />
              </div>
            )}
          </div>

          {/* Chart type */}
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {(['candle', 'line'] as const).map(t => (
              <button key={t} onClick={() => setChartType(t)}
                className={cn('px-2.5 py-1 rounded-md text-xs font-semibold transition capitalize',
                  chartType === t ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400')}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Active indicator pills ── */}
      {activeCount > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {IND_DEFS.filter(d => indicators[d.key as IndKey]).map(({ key, label, color }) => (
            <span key={key} className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              {label}
              <button onClick={() => toggleIndicator(key as IndKey)}
                className="ml-0.5 p-0.5 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition text-gray-400 hover:text-red-500">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── OHLCV readout ── */}
      {displayBar && chartType === 'candle' && (
        <div className="flex gap-3 text-[11px] font-medium flex-wrap">
          <span className="text-gray-400">O <span className="text-gray-700 dark:text-gray-200">{displayBar.open?.toFixed(2)}</span></span>
          <span className="text-gray-400">H <span className="text-gain">{displayBar.high?.toFixed(2)}</span></span>
          <span className="text-gray-400">L <span className="text-loss">{displayBar.low?.toFixed(2)}</span></span>
          <span className="text-gray-400">C <span className={displayBar.close >= displayBar.open ? 'text-gain' : 'text-loss'}>{displayBar.close?.toFixed(2)}</span></span>
          <span className="text-gray-400">V <span className="text-gray-700 dark:text-gray-200">{displayBar.volume?.toLocaleString('en-IN')}</span></span>
        </div>
      )}

      {/* ── Chart + left toolbar ── */}
      <div className="flex gap-2 items-start">
        {/* Left drawing toolbar */}
        <div className="flex flex-col bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg p-1 shrink-0">
          {TOOL_GROUPS.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <div className="border-t border-gray-200 dark:border-gray-700 my-1" />}
              {group.map(({ id, title, Icon }) => (
                <button key={id} onClick={() => setActiveTool(id)} title={title}
                  className={cn('p-1.5 rounded transition block',
                    activeTool === id
                      ? 'bg-groww-primary text-white'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700')}>
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
          ))}
          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          <button onClick={clearDrawings} title="Clear all drawings"
            className="p-1.5 rounded transition text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Chart canvas */}
        <div className="flex-1 relative min-w-0">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-groww-card/60 rounded-xl z-10">
              <div className="w-5 h-5 border-2 border-groww-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Tool hint */}
          {activeTool !== 'cursor' && TOOL_HINTS[activeTool] && (
            <div className="absolute top-1 left-1 z-10 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800 pointer-events-none">
              {TOOL_HINTS[activeTool]}
            </div>
          )}

          {/* Emoji picker overlay */}
          {emojiOpen && (
            <div className="absolute top-8 left-8 bg-white dark:bg-groww-card border border-gray-200 dark:border-gray-700 rounded-xl p-2 z-20 shadow-xl">
              <p className="text-[10px] text-gray-500 mb-1.5 px-1">Select emoji</p>
              <div className="grid grid-cols-4 gap-0.5">
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => {
                    if (mainSerRef.current && emojiPos) {
                      const pl = mainSerRef.current.createPriceLine({
                        price: emojiPos.price, color: '#f59e0b', lineWidth: 1,
                        lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: e,
                      });
                      plinesRef.current.push({ series: mainSerRef.current, line: pl });
                    }
                    setEmojiOpen(false);
                    setEmojiPos(null);
                  }} className="text-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition">
                    {e}
                  </button>
                ))}
              </div>
              <button onClick={() => { setEmojiOpen(false); setEmojiPos(null); }}
                className="w-full mt-1.5 text-[10px] text-gray-400 hover:text-red-500 transition">Cancel</button>
            </div>
          )}

          {/* Measure result overlay */}
          {measureResult && (
            <div className="absolute top-8 right-2 bg-white dark:bg-groww-card border border-gray-200 dark:border-gray-700 rounded-xl p-3 z-20 shadow-xl text-xs min-w-[140px]">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="font-bold text-gray-700 dark:text-gray-300">Measurement</span>
                <button onClick={() => setMeasureResult(null)} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
              </div>
              <div className="space-y-1 text-gray-600 dark:text-gray-400">
                <div>From: <span className="font-mono text-gray-900 dark:text-white">₹{measureResult.fromP.toFixed(2)}</span></div>
                <div>To: <span className="font-mono text-gray-900 dark:text-white">₹{measureResult.toP.toFixed(2)}</span></div>
                <div className={cn('font-bold', measureResult.diff >= 0 ? 'text-gain' : 'text-loss')}>
                  {measureResult.diff >= 0 ? '+' : ''}{measureResult.diff.toFixed(2)} ({measureResult.diff >= 0 ? '+' : ''}{measureResult.pct.toFixed(2)}%)
                </div>
              </div>
            </div>
          )}

          <div ref={containerRef} className="w-full rounded-xl overflow-hidden" />
        </div>
      </div>

      {/* Sub-pane legend */}
      {(indicators.rsi || indicators.macd) && (
        <div className="flex gap-3 text-[10px] font-medium px-1">
          {indicators.rsi  && <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded bg-purple-500 inline-block" />RSI(14)</span>}
          {indicators.macd && <>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded bg-orange-400 inline-block" />MACD</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded bg-cyan-400 inline-block" />Signal</span>
          </>}
        </div>
      )}
    </div>
  );
}
