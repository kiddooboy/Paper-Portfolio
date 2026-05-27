import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';

interface Step {
  sel: string | null;       // CSS selector of the feature to spotlight (null = centered)
  title: string;
  body: string;
}

// All the headline features, in tour order. Selectors map to data-tour
// attributes on the sidebar nav items + a few header controls.
const STEPS: Step[] = [
  { sel: null, title: 'Welcome to Paper Portfolio', body: "A quick tour of everything you can do. You start with ₹1,00,000 in virtual cash — practise trading the live NSE & BSE markets with zero risk." },
  { sel: '[data-tour="search"]', title: 'Global Search', body: 'Find any of 2,000+ NSE stocks and indices instantly. Press “/” anywhere to jump here.' },
  { sel: '[data-tour="/dashboard"]', title: 'Dashboard', body: 'Your home base — investments summary, sector heatmap, top gainers/losers, most active stocks and the AI assistant.' },
  { sel: '[data-tour="/market"]', title: 'Market', body: 'Browse and explore the full stock universe. Open any stock to see its chart, fundamentals and place an order.' },
  { sel: '[data-tour="/sectors"]', title: 'Sectors', body: 'See how every sector is performing today with a live heatmap and drill into the stocks within each one.' },
  { sel: '[data-tour="/portfolio"]', title: 'Portfolio', body: 'Track holdings, realised & unrealised P&L, sector allocation, XIRR, and your new Portfolio Health card — Nifty benchmark, drawdown and risk alerts.' },
  { sel: '[data-tour="/compass"]', title: 'Portfolio Compass', body: 'Run Monte-Carlo simulations to project where your portfolio could go over the next months.' },
  { sel: '[data-tour="/positions"]', title: 'Holdings & Day Positions', body: 'View long-term holdings and today’s intraday positions — buys, sells, MIS shorts and round-trips — resetting daily.' },
  { sel: '[data-tour="/orders"]', title: 'Orders', body: 'Every order you place: MARKET, LIMIT, SL/SL-M, GTT, AMO and bracket-style target + stop-loss, with fee breakdowns.' },
  { sel: '[data-tour="/watchlist"]', title: 'Watchlist', body: 'Bookmark stocks you’re tracking and watch their live prices in one place.' },
  { sel: '[data-tour="/screener"]', title: 'Screener', body: 'Filter the market by market-cap, P/E, ROE, dividend yield, 52-week range and more — or use ready presets.' },
  { sel: '[data-tour="/community"]', title: 'Community', body: 'Share ideas, discuss trades, and learn from other paper traders.' },
  { sel: '[data-tour="/leaderboard"]', title: 'Leaderboard', body: 'See how your returns stack up against everyone else and climb the ranks.' },
  { sel: '[data-tour="/achievements"]', title: 'Achievements', body: 'Earn badges as you hit trading milestones.' },
  { sel: '[data-tour="/news"]', title: 'News', body: 'Curated market news with AI sentiment — and the AI assistant factors news on your holdings into its answers.' },
  { sel: '[data-tour="/learn"]', title: 'Trading Academy', body: 'New to markets? Take the interactive course — equity basics, terms, analysis, risk, strategy & psychology — with quizzes and progress tracking.' },
  { sel: '[data-tour="greeqs"]', title: 'Greeqs Options Terminal', body: 'Jump to the dedicated Greeqs options terminal for advanced F&O analysis.' },
  { sel: '[data-tour="notifications"]', title: 'Notifications & Alerts', body: 'Order fills, price/indicator alerts and AI insights land in your notification centre. Set alerts on any stock’s page.' },
  { sel: null, title: "You're all set! 🚀", body: 'Explore at your own pace — and remember, every rupee is virtual. You can replay this tour anytime from your profile menu.' },
];

const GAP = 14;
const CARD_W = 320;

export default function ProductTour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = STEPS[i];

  // Resolve the current target rect (re-runs on step change + resize)
  useLayoutEffect(() => {
    function measure() {
      if (!step.sel) { setRect(null); return; }
      let el = document.querySelector(step.sel) as HTMLElement | null;
      // Mobile/tablet fallback: if element is hidden, spotlight the hamburger button to show menu access
      if (!el && window.innerWidth < 1024) {
        el = document.querySelector('[data-tour="hamburger"]') as HTMLElement | null;
      }
      if (!el) { setRect(null); return; }
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setRect(el.getBoundingClientRect());
    }
    measure();
    window.addEventListener('resize', measure);
    const t = setTimeout(measure, 320); // re-measure after scroll settles
    return () => { window.removeEventListener('resize', measure); clearTimeout(t); };
  }, [i, step.sel]);

  // Keyboard: → / Enter next, ← back, Esc skip
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
      else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  const next = () => (i < STEPS.length - 1 ? setI(i + 1) : onClose());
  const back = () => i > 0 && setI(i - 1);

  // Card position — beside the target if possible, else centered
  const card = (() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const isMobile = vw < 768;

    if (!rect) {
      const left = isMobile ? (vw - Math.min(CARD_W, vw - 24)) / 2 : vw / 2 - CARD_W / 2;
      const top = isMobile ? vh / 2 - 110 : vh / 2 - 110;
      return { left, top, centered: true };
    }

    if (isMobile) {
      const left = (vw - Math.min(CARD_W, vw - 24)) / 2;
      // If spotlight is in lower half of viewport, place card in upper half (top: 80).
      // Otherwise place card in lower half (top: vh - 245).
      const spotlightCenterY = rect.top + rect.height / 2;
      const top = spotlightCenterY > vh / 2 ? 80 : vh - 245;
      return { left, top, centered: false };
    }

    // Prefer placing to the RIGHT of the target (sidebar items live on the left)
    let left = rect.right + GAP;
    let top = rect.top;
    if (left + CARD_W > vw - 12) {
      // not enough room right → place BELOW (header items)
      left = Math.min(Math.max(12, rect.left), vw - CARD_W - 12);
      top = rect.bottom + GAP;
    }
    top = Math.min(Math.max(12, top), vh - 230);
    return { left, top, centered: false };
  })();

  const isLast = i === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true">
      {/* Spotlight overlay — a transparent ring over the target with a huge
          box-shadow that darkens everything else. Falls back to a plain dim
          backdrop for centered steps. */}
      {rect ? (
        <div
          style={{
            position: 'fixed',
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(15,23,42,0.42)',
            border: '2px solid #00d68f',
            transition: 'all .25s ease',
            pointerEvents: 'none',
          }}
        />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.42)', backdropFilter: 'blur(1.5px)' }} onClick={onClose} />
      )}

      {/* Popup card */}
      <div
        ref={cardRef}
        style={{ position: 'fixed', left: card.left, top: card.top, width: CARD_W }}
        className="bg-white dark:bg-groww-card rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-5 animate-[fadeIn_.2s_ease]"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          aria-label="Skip tour"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-2">
          <span className="w-7 h-7 rounded-lg bg-groww-primary/10 flex items-center justify-center text-groww-primary">
            <Sparkles className="w-4 h-4" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-groww-primary">
            {i + 1} of {STEPS.length}
          </span>
        </div>

        <h3 className="text-base font-bold mb-1.5">{step.title}</h3>
        <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-300">{step.body}</p>

        {/* Progress dots */}
        <div className="flex gap-1 mt-4 mb-4 flex-wrap">
          {STEPS.map((_, idx) => (
            <span
              key={idx}
              className={`h-1 rounded-full transition-all ${idx === i ? 'w-5 bg-groww-primary' : 'w-1.5 bg-gray-300 dark:bg-gray-600'}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <button
                onClick={back}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}
            <button
              onClick={next}
              className="flex items-center gap-1 text-xs font-semibold px-4 py-2 rounded-lg bg-groww-primary text-white hover:bg-green-600"
            >
              {isLast ? 'Finish' : 'Next'} {!isLast && <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }`}</style>
    </div>
  );
}
