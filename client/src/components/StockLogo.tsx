import { useState } from 'react';
import { getLogoUrl, getInitialsColor } from '../lib/stockLogos';

interface StockLogoProps {
  symbol: string;
  size?: number;
  className?: string;
}

/**
 * Renders a real company logo for a given stock symbol.
 * Falls back to a colored circle with the first two letters of the symbol.
 */
export default function StockLogo({ symbol, size = 40, className = '' }: StockLogoProps) {
  const [errored, setErrored] = useState(false);
  const url = getLogoUrl(symbol);
  const showImage = url && !errored;

  const style = { width: size, height: size, minWidth: size };

  if (showImage) {
    return (
      <img
        src={url}
        alt={symbol}
        style={style}
        onError={() => setErrored(true)}
        className={`rounded-full bg-white object-contain p-0.5 border border-gray-100 dark:border-gray-700 ${className}`}
      />
    );
  }

  // Fallback to colored initials
  const initials = symbol.slice(0, 2).toUpperCase();
  return (
    <div
      style={{ ...style, backgroundColor: getInitialsColor(symbol) }}
      className={`rounded-full flex items-center justify-center text-white font-semibold ${className}`}
    >
      <span style={{ fontSize: size * 0.4 }}>{initials}</span>
    </div>
  );
}
