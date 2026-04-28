import { memo, useEffect, useRef } from 'react';

interface TradingViewWidgetProps {
  symbol: string;            // raw symbol e.g. "RELIANCE"
  exchange?: 'NSE' | 'BSE';  // defaults to NSE
  theme?: 'light' | 'dark';
  height?: number;           // px, default 500
  interval?: 'D' | 'W' | 'M' | '60' | '15' | '5' | '1';
}

/**
 * Embeds TradingView's free "Advanced Chart" widget for any NSE/BSE stock.
 * Loads only the lightweight bootstrap script — no API key required.
 */
function TradingViewWidget({
  symbol,
  exchange = 'NSE',
  theme = 'light',
  height = 500,
  interval = 'D',
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Detect theme dynamically based on document class
    const resolvedTheme =
      theme || (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

    // Clear any previous widget instance (symbol change re-renders)
    container.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.type = 'text/javascript';
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: `${exchange}:${symbol}`,
      interval,
      timezone: 'Asia/Kolkata',
      theme: resolvedTheme,
      style: '1', // candles
      locale: 'en',
      enable_publishing: false,
      allow_symbol_change: false,
      hide_side_toolbar: false,
      withdateranges: true,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      details: false,
      container_id: 'tv-chart-container',
      support_host: 'https://www.tradingview.com',
    });
    container.appendChild(script);

    return () => {
      if (container) container.innerHTML = '';
    };
  }, [symbol, exchange, theme, interval]);

  return (
    <div className="rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800 bg-white dark:bg-groww-card">
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ height: `${height}px`, width: '100%' }}
      />
    </div>
  );
}

export default memo(TradingViewWidget);
