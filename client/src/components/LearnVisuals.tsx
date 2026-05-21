// ── Learning Academy visuals ───────────────────────────────────────────────
// SVG infographics + candlestick illustrations referenced from lessons via
// a { type: 'visual', name } content block. All are theme-aware (green = up,
// red = down, blue = accent; labels use currentColor).

const UP = '#16a34a';
const DN = '#ef4444';
const BLUE = '#3b82f6';
const AMBER = '#d97706';

interface CandleSpec { x: number; o: number; c: number; h: number; l: number }

function Candles({ data, w = 12 }: { data: CandleSpec[]; w?: number }) {
  return (
    <>
      {data.map((d, i) => {
        const up = d.c <= d.o; // smaller y = higher price; close above open => c<o
        const color = up ? UP : DN;
        const bodyTop = Math.min(d.o, d.c);
        const bodyH = Math.max(2, Math.abs(d.c - d.o));
        const cx = d.x + w / 2;
        return (
          <g key={i}>
            <line x1={cx} x2={cx} y1={d.h} y2={d.l} stroke={color} strokeWidth={1.4} />
            <rect x={d.x} y={bodyTop} width={w} height={bodyH} rx={1.5} fill={color} />
          </g>
        );
      })}
    </>
  );
}

const VISUALS: Record<string, () => JSX.Element> = {
  // Anatomy of a candlestick — bullish vs bearish with labels
  'candle-anatomy': () => (
    <svg viewBox="0 0 320 170" className="w-full h-auto">
      {/* Bullish */}
      <line x1="80" y1="20" x2="80" y2="150" stroke={UP} strokeWidth="1.6" />
      <rect x="68" y="55" width="24" height="70" rx="2" fill={UP} />
      <text x="110" y="30" fontSize="9" className="fill-current">High (wick top)</text>
      <text x="110" y="62" fontSize="9" className="fill-current">Close</text>
      <text x="110" y="123" fontSize="9" className="fill-current">Open</text>
      <text x="110" y="152" fontSize="9" className="fill-current">Low (wick bottom)</text>
      <text x="58" y="165" fontSize="9" fontWeight="700" fill={UP} textAnchor="middle">Bullish ▲</text>
      {/* Bearish */}
      <line x1="240" y1="20" x2="240" y2="150" stroke={DN} strokeWidth="1.6" />
      <rect x="228" y="50" width="24" height="70" rx="2" fill={DN} />
      <text x="200" y="56" fontSize="9" textAnchor="end" className="fill-current">Open</text>
      <text x="200" y="118" fontSize="9" textAnchor="end" className="fill-current">Close</text>
      <text x="240" y="165" fontSize="9" fontWeight="700" fill={DN} textAnchor="middle">Bearish ▼</text>
    </svg>
  ),

  // Uptrend — higher highs & higher lows
  'uptrend': () => (
    <svg viewBox="0 0 320 150" className="w-full h-auto">
      <Candles data={[
        { x: 14, o: 110, c: 96, h: 88, l: 118 },
        { x: 44, o: 100, c: 86, h: 78, l: 108 },
        { x: 74, o: 92, c: 100, h: 84, l: 110 },
        { x: 104, o: 96, c: 78, h: 70, l: 104 },
        { x: 134, o: 82, c: 66, h: 58, l: 90 },
        { x: 164, o: 70, c: 80, h: 62, l: 88 },
        { x: 194, o: 76, c: 54, h: 46, l: 84 },
        { x: 224, o: 58, c: 42, h: 34, l: 66 },
        { x: 254, o: 46, c: 56, h: 38, l: 64 },
        { x: 284, o: 50, c: 30, h: 22, l: 58 },
      ]} />
      <line x1="10" y1="128" x2="310" y2="40" stroke={UP} strokeWidth="1.4" strokeDasharray="4 3" opacity="0.7" />
      <text x="300" y="34" fontSize="9" fontWeight="700" fill={UP} textAnchor="end">Higher highs &amp; higher lows</text>
    </svg>
  ),

  // Downtrend — lower highs & lower lows
  'downtrend': () => (
    <svg viewBox="0 0 320 150" className="w-full h-auto">
      <Candles data={[
        { x: 14, o: 40, c: 54, h: 30, l: 62 },
        { x: 44, o: 50, c: 66, h: 42, l: 74 },
        { x: 74, o: 62, c: 52, h: 46, l: 70 },
        { x: 104, o: 60, c: 78, h: 52, l: 86 },
        { x: 134, o: 74, c: 90, h: 66, l: 98 },
        { x: 164, o: 86, c: 76, h: 70, l: 94 },
        { x: 194, o: 84, c: 102, h: 76, l: 110 },
        { x: 224, o: 98, c: 114, h: 90, l: 122 },
        { x: 254, o: 110, c: 100, h: 94, l: 118 },
        { x: 284, o: 106, c: 126, h: 98, l: 134 },
      ]} />
      <line x1="10" y1="36" x2="310" y2="120" stroke={DN} strokeWidth="1.4" strokeDasharray="4 3" opacity="0.7" />
      <text x="20" y="30" fontSize="9" fontWeight="700" fill={DN}>Lower highs &amp; lower lows</text>
    </svg>
  ),

  // Support & resistance — price bouncing between two lines
  'support-resistance': () => (
    <svg viewBox="0 0 320 150" className="w-full h-auto">
      <line x1="8" y1="34" x2="312" y2="34" stroke={DN} strokeWidth="1.4" strokeDasharray="5 3" />
      <line x1="8" y1="120" x2="312" y2="120" stroke={UP} strokeWidth="1.4" strokeDasharray="5 3" />
      <text x="312" y="28" fontSize="9" fontWeight="700" fill={DN} textAnchor="end">Resistance</text>
      <text x="8" y="135" fontSize="9" fontWeight="700" fill={UP}>Support</text>
      <Candles data={[
        { x: 20, o: 110, c: 96, h: 116, l: 90 },
        { x: 50, o: 96, c: 50, h: 44, l: 100 },
        { x: 80, o: 52, c: 64, h: 40, l: 70 },
        { x: 110, o: 64, c: 108, h: 58, l: 116 },
        { x: 140, o: 108, c: 70, h: 62, l: 114 },
        { x: 170, o: 70, c: 42, h: 36, l: 76 },
        { x: 200, o: 44, c: 78, h: 38, l: 84 },
        { x: 230, o: 78, c: 112, h: 72, l: 118 },
        { x: 260, o: 112, c: 60, h: 52, l: 116 },
        { x: 290, o: 60, c: 44, h: 38, l: 66 },
      ]} />
    </svg>
  ),

  // Breakout — consolidation then a strong break above resistance
  'breakout': () => (
    <svg viewBox="0 0 320 150" className="w-full h-auto">
      <line x1="8" y1="60" x2="230" y2="60" stroke={AMBER} strokeWidth="1.4" strokeDasharray="5 3" />
      <text x="12" y="54" fontSize="9" fontWeight="700" fill={AMBER}>Resistance</text>
      {/* consolidation */}
      <Candles data={[
        { x: 20, o: 96, c: 82, h: 74, l: 102 },
        { x: 48, o: 84, c: 92, h: 70, l: 100 },
        { x: 76, o: 90, c: 78, h: 68, l: 98 },
        { x: 104, o: 80, c: 88, h: 70, l: 96 },
        { x: 132, o: 86, c: 76, h: 66, l: 94 },
        { x: 160, o: 78, c: 84, h: 68, l: 92 },
        { x: 188, o: 84, c: 72, h: 64, l: 90 },
      ]} />
      {/* breakout candle */}
      <Candles data={[{ x: 224, o: 70, c: 26, h: 18, l: 78 }]} w={16} />
      <Candles data={[{ x: 264, o: 28, c: 16, h: 10, l: 36 }]} w={16} />
      <path d="M236 56 L236 40 M230 46 L236 40 L242 46" stroke={UP} strokeWidth="2" fill="none" />
      <text x="248" y="120" fontSize="9" fontWeight="700" fill={UP} textAnchor="middle">Breakout!</text>
    </svg>
  ),

  // Mean reversion — stretch from average then snap back
  'mean-reversion': () => (
    <svg viewBox="0 0 320 150" className="w-full h-auto">
      <line x1="8" y1="75" x2="312" y2="75" stroke={BLUE} strokeWidth="1.4" strokeDasharray="5 3" />
      <text x="312" y="69" fontSize="9" fontWeight="700" fill={BLUE} textAnchor="end">Average (mean)</text>
      <Candles data={[
        { x: 18, o: 78, c: 72, h: 66, l: 84 },
        { x: 46, o: 72, c: 58, h: 50, l: 80 },
        { x: 74, o: 58, c: 40, h: 32, l: 66 },
        { x: 102, o: 40, c: 28, h: 20, l: 48 },
        { x: 130, o: 30, c: 48, h: 24, l: 54 },
        { x: 158, o: 48, c: 70, h: 42, l: 78 },
        { x: 186, o: 72, c: 88, h: 66, l: 96 },
        { x: 214, o: 88, c: 108, h: 82, l: 116 },
        { x: 242, o: 106, c: 88, h: 80, l: 112 },
        { x: 270, o: 86, c: 74, h: 68, l: 92 },
      ]} />
      <path d="M104 16 q14 10 0 16" fill="none" />
      <text x="104" y="14" fontSize="8" fill={UP} textAnchor="middle">oversold → bounce</text>
      <text x="228" y="134" fontSize="8" fill={DN} textAnchor="middle">overbought → fall</text>
    </svg>
  ),

  // Moving average overlay
  'moving-average': () => (
    <svg viewBox="0 0 320 150" className="w-full h-auto">
      <Candles data={[
        { x: 14, o: 100, c: 90, h: 84, l: 108 },
        { x: 42, o: 92, c: 104, h: 86, l: 112 },
        { x: 70, o: 102, c: 84, h: 78, l: 110 },
        { x: 98, o: 86, c: 72, h: 64, l: 94 },
        { x: 126, o: 74, c: 88, h: 68, l: 96 },
        { x: 154, o: 86, c: 66, h: 58, l: 92 },
        { x: 182, o: 68, c: 54, h: 46, l: 76 },
        { x: 210, o: 56, c: 70, h: 48, l: 78 },
        { x: 238, o: 68, c: 50, h: 42, l: 76 },
        { x: 266, o: 52, c: 38, h: 30, l: 60 },
        { x: 294, o: 40, c: 48, h: 32, l: 56 },
      ]} />
      <path d="M20 104 Q90 96 130 86 T240 64 T300 50" fill="none" stroke={BLUE} strokeWidth="2" />
      <text x="300" y="44" fontSize="9" fontWeight="700" fill={BLUE} textAnchor="end">Moving average</text>
    </svg>
  ),

  // RSI oscillator with 70/30 zones
  'rsi': () => (
    <svg viewBox="0 0 320 130" className="w-full h-auto">
      <rect x="8" y="14" width="304" height="26" fill={DN} opacity="0.08" />
      <rect x="8" y="86" width="304" height="26" fill={UP} opacity="0.08" />
      <line x1="8" y1="40" x2="312" y2="40" stroke={DN} strokeWidth="1" strokeDasharray="4 3" />
      <line x1="8" y1="86" x2="312" y2="86" stroke={UP} strokeWidth="1" strokeDasharray="4 3" />
      <text x="312" y="26" fontSize="9" fill={DN} textAnchor="end">70 · Overbought</text>
      <text x="312" y="104" fontSize="9" fill={UP} textAnchor="end">30 · Oversold</text>
      <path d="M10 70 C50 30, 70 24, 100 36 S150 96, 190 92 S250 30, 310 48" fill="none" stroke={BLUE} strokeWidth="2" />
    </svg>
  ),

  // Bid / Ask / Spread
  'bid-ask': () => (
    <svg viewBox="0 0 320 110" className="w-full h-auto">
      <rect x="14" y="34" width="120" height="44" rx="6" fill={UP} opacity="0.14" stroke={UP} />
      <rect x="186" y="34" width="120" height="44" rx="6" fill={DN} opacity="0.14" stroke={DN} />
      <text x="74" y="30" fontSize="10" fontWeight="700" fill={UP} textAnchor="middle">BID</text>
      <text x="74" y="62" fontSize="14" fontWeight="700" className="fill-current" textAnchor="middle">₹100.20</text>
      <text x="74" y="74" fontSize="8" className="fill-current" textAnchor="middle" opacity="0.7">highest buyer</text>
      <text x="246" y="30" fontSize="10" fontWeight="700" fill={DN} textAnchor="middle">ASK</text>
      <text x="246" y="62" fontSize="14" fontWeight="700" className="fill-current" textAnchor="middle">₹100.35</text>
      <text x="246" y="74" fontSize="8" className="fill-current" textAnchor="middle" opacity="0.7">lowest seller</text>
      <line x1="134" y1="56" x2="186" y2="56" className="stroke-current" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
      <text x="160" y="50" fontSize="8" fontWeight="700" fill={AMBER} textAnchor="middle">spread</text>
      <text x="160" y="92" fontSize="8" fill={AMBER} textAnchor="middle">₹0.15</text>
    </svg>
  ),

  // Risk / reward 1:2
  'risk-reward': () => (
    <svg viewBox="0 0 320 130" className="w-full h-auto">
      <rect x="60" y="70" width="60" height="40" rx="4" fill={DN} opacity="0.85" />
      <text x="90" y="95" fontSize="11" fontWeight="700" fill="#fff" textAnchor="middle">Risk</text>
      <text x="90" y="124" fontSize="9" className="fill-current" textAnchor="middle">₹1 (to stop-loss)</text>
      <rect x="180" y="20" width="60" height="90" rx="4" fill={UP} opacity="0.85" />
      <text x="210" y="70" fontSize="11" fontWeight="700" fill="#fff" textAnchor="middle">Reward</text>
      <text x="210" y="124" fontSize="9" className="fill-current" textAnchor="middle">₹2 (to target)</text>
      <text x="160" y="14" fontSize="10" fontWeight="700" className="fill-current" textAnchor="middle">Risk : Reward = 1 : 2</text>
    </svg>
  ),

  // Diversification — concentrated vs spread
  'diversification': () => (
    <svg viewBox="0 0 320 130" className="w-full h-auto">
      <circle cx="78" cy="60" r="46" fill={DN} opacity="0.2" stroke={DN} />
      <path d="M78 60 L78 14 A46 46 0 0 1 117 80 Z" fill={DN} opacity="0.75" />
      <text x="78" y="120" fontSize="9" className="fill-current" textAnchor="middle">Concentrated (risky)</text>
      <g>
        {[UP, BLUE, AMBER, '#8b5cf6', '#ec4899', '#14b8a6'].map((c, i) => {
          const a0 = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const a1 = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2;
          const r = 46, cx = 242, cy = 60;
          const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
          const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
          return <path key={i} d={`M${cx} ${cy} L${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1} Z`} fill={c} opacity="0.8" />;
        })}
      </g>
      <text x="242" y="120" fontSize="9" className="fill-current" textAnchor="middle">Diversified (safer)</text>
    </svg>
  ),

  // Option payoff — call & put hockey sticks
  'option-payoff': () => (
    <svg viewBox="0 0 320 150" className="w-full h-auto">
      <line x1="20" y1="75" x2="300" y2="75" className="stroke-current" strokeWidth="1" opacity="0.4" />
      <line x1="160" y1="12" x2="160" y2="138" className="stroke-current" strokeWidth="1" opacity="0.25" strokeDasharray="3 3" />
      <text x="160" y="148" fontSize="8" className="fill-current" textAnchor="middle">Strike</text>
      {/* Call: flat (loss = premium) then rising */}
      <path d="M20 95 L160 95 L290 25" fill="none" stroke={UP} strokeWidth="2.2" />
      <text x="288" y="20" fontSize="9" fontWeight="700" fill={UP} textAnchor="end">Call buyer (bullish)</text>
      {/* Put: falling then flat */}
      <path d="M30 25 L160 95 L300 95" fill="none" stroke={DN} strokeWidth="2.2" strokeDasharray="5 3" />
      <text x="34" y="20" fontSize="9" fontWeight="700" fill={DN}>Put buyer (bearish)</text>
      <text x="78" y="110" fontSize="8" className="fill-current" opacity="0.7">max loss = premium</text>
    </svg>
  ),

  // Bull vs Bear market
  'bull-bear': () => (
    <svg viewBox="0 0 320 120" className="w-full h-auto">
      <path d="M20 100 L150 30" fill="none" stroke={UP} strokeWidth="2.5" />
      <path d="M138 30 L150 30 L150 42" fill="none" stroke={UP} strokeWidth="2.5" />
      <text x="84" y="58" fontSize="11" fontWeight="700" fill={UP} transform="rotate(-28 84 58)">Bull market ▲</text>
      <path d="M180 30 L300 100" fill="none" stroke={DN} strokeWidth="2.5" />
      <path d="M300 88 L300 100 L288 100" fill="none" stroke={DN} strokeWidth="2.5" />
      <text x="244" y="56" fontSize="11" fontWeight="700" fill={DN} transform="rotate(28 244 56)">Bear market ▼</text>
    </svg>
  ),
};

export default function LearnVisual({ name, caption }: { name: string; caption?: string }) {
  const V = VISUALS[name];
  if (!V) return null;
  return (
    <figure className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/30 p-4 my-1 text-gray-500 dark:text-gray-400">
      <V />
      {caption && <figcaption className="text-[11px] text-center mt-2 text-gray-500 dark:text-gray-400">{caption}</figcaption>}
    </figure>
  );
}
