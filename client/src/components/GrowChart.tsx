import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time, ColorType } from 'lightweight-charts';
import axios from 'axios';

interface GrowChartProps {
  symbol: string;
  exchange: 'NSE' | 'BSE';
  interval?: string;
  height?: number | string;
}

export default function GrowChart({
  symbol,
  exchange,
  interval = '1D',
  height = 400,
}: GrowChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !symbol) return;

    setError(null);

    // Ensure container has dimensions
    if (chartContainerRef.current.clientWidth === 0) {
      console.warn('Chart container has no width, skipping initialization');
      return;
    }

    try {
      // Create chart using official TradingView pattern
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: typeof height === 'number' ? height : 400,
        layout: {
          background: { type: ColorType.Solid, color: '#ffffff' },
          textColor: '#333333',
        },
        grid: {
          vertLines: { color: '#e1e1e1' },
          horzLines: { color: '#e1e1e1' },
        },
        crosshair: {
          mode: 1,
          vertLine: {
            width: 1,
            color: '#758696',
            style: 3,
          },
          horzLine: {
            width: 1,
            color: '#758696',
            style: 3,
          },
        },
        rightPriceScale: {
          borderColor: '#e1e1e1',
        },
        timeScale: {
          borderColor: '#e1e1e1',
          timeVisible: true,
          secondsVisible: false,
        },
      });

      const candlestickSeries = (chart as any).addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });

      chartRef.current = chart;
      seriesRef.current = candlestickSeries;

      // Handle resize following official pattern
      const handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
          });
        }
      };

      window.addEventListener('resize', handleResize);

      // Fetch historical data from backend
      async function fetchHistoricalData() {
        try {
          const res = await axios.get(`/api/stocks/${encodeURIComponent(symbol.toUpperCase())}/history`, {
            params: { exchange, interval: interval.toLowerCase() }
          });
          
          const data = res.data || [];
          const candleData: CandlestickData[] = data.map((d: any) => ({
            time: (new Date(d.date).getTime() / 1000) as Time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
          }));

          candlestickSeries.setData(candleData);
          chart.timeScale().fitContent();
        } catch (error) {
          console.error('Error fetching chart data:', error);
          // Generate sample data if API fails
          const sampleData = generateSampleData();
          candlestickSeries.setData(sampleData);
          chart.timeScale().fitContent();
        }
      }

      // Fetch live data and update last candle
      async function fetchLiveData() {
        try {
          const res = await axios.get(`/api/stocks/${encodeURIComponent(symbol.toUpperCase())}`, {
            params: { exchange }
          });
          
          const liveData = res.data;
          if (liveData && seriesRef.current) {
            const now = Math.floor(Date.now() / 1000) as Time;
            seriesRef.current.update({
              time: now,
              open: liveData.price,
              high: liveData.day_high || liveData.price,
              low: liveData.day_low || liveData.price,
              close: liveData.price,
            });
          }
        } catch (error) {
          console.error('Error fetching live data:', error);
        }
      }

      fetchHistoricalData();

      // Set up live polling (every 5 seconds during market hours)
      let pollInterval: ReturnType<typeof setInterval>;
      const checkMarketHours = () => {
        const now = new Date();
        const day = now.getDay();
        const istTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
        const istHours = istTime.getHours();
        const istMinutes = istTime.getMinutes();
        
        // Market hours: 9:15 AM to 3:30 PM IST, Monday to Friday
        const isMarketOpen = day >= 1 && day <= 5 && 
          ((istHours > 9 || (istHours === 9 && istMinutes >= 15)) && 
           (istHours < 15 || (istHours === 15 && istMinutes <= 30)));

        if (isMarketOpen && !isLive) {
          setIsLive(true);
          pollInterval = setInterval(fetchLiveData, 5000);
        } else if (!isMarketOpen && isLive) {
          setIsLive(false);
          if (pollInterval) clearInterval(pollInterval);
        }
      };

      checkMarketHours();
      const marketCheckInterval = setInterval(checkMarketHours, 60000);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (pollInterval) clearInterval(pollInterval);
        clearInterval(marketCheckInterval);
        chart.remove();
      };
    } catch (err) {
      console.error('Chart initialization error:', err);
      setError('Failed to initialize chart');
      return () => {};
    }
  }, [symbol, interval, exchange]);

  // Generate sample data for fallback
  function generateSampleData(): CandlestickData[] {
    const data: CandlestickData[] = [];
    const basePrice = 1000;
    const now = Date.now();
    
    for (let i = 100; i >= 0; i--) {
      const time = Math.floor((now - i * 24 * 60 * 60 * 1000) / 1000) as Time;
      const volatility = 0.02;
      const open = basePrice * (1 + (Math.random() - 0.5) * volatility);
      const close = open * (1 + (Math.random() - 0.5) * volatility);
      const high = Math.max(open, close) * (1 + Math.random() * volatility);
      const low = Math.min(open, close) * (1 - Math.random() * volatility);
      
      data.push({ time, open, high, low, close });
    }
    
    return data;
  }

  if (error) {
    return (
      <div 
        className="flex items-center justify-center bg-gray-100 dark:bg-gray-800"
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
      >
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <div
        ref={chartContainerRef}
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
        className="w-full"
      />
      {isLive && (
        <div className="absolute top-2 right-2 px-2 py-1 bg-green-500 text-white text-xs rounded-full animate-pulse">
          Live
        </div>
      )}
    </div>
  );
}
