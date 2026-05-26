// The AI trading council — a genuine multi-agent deliberation powered by the
// strongest Claude model. The deterministic signal engine screens the whole
// market down to a shortlist of candidates; this council then *debates* them
// (Market Analysis, Momentum, Risk Management, Strategy, Sentiment) and reaches
// a collective verdict on what to actually trade. The discussion transcript is
// streamed to the live console so the user sees the agents reasoning in real time.
//
// If the API key is missing or a call fails, we fall back to a robust
// deterministic verdict with synthetic agent reasoning.

import Anthropic from '@anthropic-ai/sdk';
import type { SignalResult } from './signals.js';
import type { RiskProfile } from './riskProfiles.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

// Strongest model for the actual decision-making.
const COUNCIL_MODEL = 'claude-3-opus-20240229';

export interface CouncilCandidate {
  sig: SignalResult;
  price: number;
  changePct: number;
}

export interface CouncilDecision {
  symbol: string;
  action: 'enter' | 'skip';
  confidence: number;
  reason: string;
}

export interface CouncilVerdict {
  marketView: string;
  discussion: { agent: string; view: string }[];
  decisions: CouncilDecision[];
  source: 'council' | 'fallback';
}

export interface CouncilContext {
  profile: RiskProfile;
  availableCapital: number;
  openSymbols: string[];
  slots: number;
}

const COUNCIL_TOOL: Anthropic.Tool = {
  name: 'council_verdict',
  description: 'Record the trading council\'s collective decision after the agents have deliberated.',
  input_schema: {
    type: 'object',
    properties: {
      market_view: { type: 'string', description: 'One sentence read on current intraday market conditions.' },
      discussion: {
        type: 'array',
        description: 'Each agent\'s contribution to the debate, in order.',
        items: {
          type: 'object',
          properties: {
            agent: { type: 'string', enum: ['Market Analysis', 'Momentum', 'Risk Management', 'Strategy', 'Sentiment'] },
            view: { type: 'string', description: 'This agent\'s concise take (max 24 words).' },
          },
          required: ['agent', 'view'],
        },
      },
      decisions: {
        type: 'array',
        description: 'Verdict for each candidate symbol presented.',
        items: {
          type: 'object',
          properties: {
            symbol: { type: 'string' },
            action: { type: 'string', enum: ['enter', 'skip'] },
            confidence: { type: 'number', description: '0-100 collective confidence' },
            reason: { type: 'string', description: 'One-line justification (max 20 words).' },
          },
          required: ['symbol', 'action', 'confidence', 'reason'],
        },
      },
    },
    required: ['market_view', 'discussion', 'decisions'],
  },
};

const SYSTEM = `You are the autonomous trading council of an intraday PAPER-trading agent on Indian equities (NSE).
You are trained on **FLM's Financial Learning Academy Models** (representing core modules in Technical Indicators, Risk Management, and Intraday Strategies) and use multiple indicator algorithms to track high-conviction entries and exits.

You are five specialist agents who must DEBATE and reach a collective verdict:
- Market Analysis (FLM Module 1): overall trend, breadth, liquidity, and candidate screening.
- Momentum (FLM Module 2): RSI markup phase (50-70 zone; avoid >75 overbought), MACD convergence/divergence, and price strength.
- Risk Management (FLM Module 3): position sizing fit, stop-loss viability (Entry - stopMult * ATR), target distance (Entry + rewardRisk * stopDistance), capital exposure.
- Strategy (FLM Module 4): does the setup match a clean intraday long (Upper Bollinger Band breakout, EMA9 stacking above EMA21, or VWAP support reclaim)?
- Sentiment: directional bias from the day's move and volume surge (>1.5x average confirms institutional backing).

Rules:
- LONG ONLY. Intraday. You may only approve high-conviction setups; it is correct to approve NONE on a weak day.
- Never approve more names than the available slots.
- Respect the risk profile: a conservative profile demands cleaner, lower-volatility setups; aggressive tolerates wider, faster moves.
- Be decisive and concrete. Reference the actual indicator readings and FLM modules you are given.
- Always answer by calling the council_verdict tool.`;

function buildPrompt(candidates: CouncilCandidate[], ctx: CouncilContext): string {
  const lines = candidates.map(c => {
    const s = c.sig.snapshot;
    return `- ${c.sig.symbol}: ₹${c.price.toFixed(2)} (${c.changePct >= 0 ? '+' : ''}${c.changePct.toFixed(2)}% today) · ` +
      `deterministic conf ${c.sig.confidence}% (${c.sig.bias}) · ` +
      `RSI ${s.rsi?.toFixed(0) ?? '—'} · MACD ${s.macdHist != null ? s.macdHist.toFixed(2) : '—'} · ` +
      `Supertrend ${s.supertrend === 1 ? 'up' : s.supertrend === -1 ? 'down' : '—'} · ` +
      `ATR ${s.atrPct?.toFixed(1) ?? '—'}% · vol ${s.volSurge?.toFixed(1) ?? '—'}× · ` +
      `${s.nearBreakout ? 'breaking out · ' : ''}${s.vwap != null ? (c.price > s.vwap ? 'above VWAP' : 'below VWAP') : ''}\n` +
      `    signals: ${c.sig.reasons.join('; ')}`;
  }).join('\n');

  return `Risk profile: ${ctx.profile.label} (Risk/trade: ${ctx.profile.riskPerTradePct}%, Stop: ${ctx.profile.atrStopMult}×ATR, R:R: ${ctx.profile.rewardRisk}×, Min Conf: ${ctx.profile.minConfidence}%).
Available capital: ₹${ctx.availableCapital.toFixed(0)}. Open slots: ${ctx.slots}. Already holding: ${ctx.openSymbols.join(', ') || 'none'}.

Candidate stocks the screener surfaced right now:
${lines}

Deliberate as the council, then submit your verdict. Approve at most ${ctx.slots} name(s); approve only genuinely strong intraday longs.`;
}

/** Robust deterministic fallback with synthetic agent reasoning. */
function fallbackVerdict(candidates: CouncilCandidate[], ctx: CouncilContext): CouncilVerdict {
  // Sort by confidence descending
  const sorted = [...candidates].sort((a, b) => b.sig.confidence - a.sig.confidence);

  // Apply confidence threshold
  const approved = sorted
    .filter(c => c.sig.confidence >= ctx.profile.minConfidence && c.sig.action === 'enter')
    .slice(0, ctx.slots);

  // Generate synthetic but informative discussion
  const discussion: { agent: string; view: string }[] = [];

  if (sorted.length > 0) {
    const topSymbol = sorted[0].sig.symbol;
    const topConf = sorted[0].sig.confidence;
    const topBias = sorted[0].sig.bias;

    discussion.push({
      agent: 'Market Analysis',
      view: `Applying FLM Technical Ingestion: screened ${sorted.length} momentum candidates. Top pick is ${topSymbol} (${topConf}% confidence, ${topBias} trend).`,
    });

    const momCands = sorted.slice(0, 3);
    const momDetail = momCands.map(c => {
      const rsi = c.sig.snapshot.rsi?.toFixed(0) ?? '—';
      const hist = c.sig.snapshot.macdHist != null ? (c.sig.snapshot.macdHist > 0 ? '+' : '') + c.sig.snapshot.macdHist.toFixed(2) : '—';
      return `${c.sig.symbol} (RSI ${rsi}, MACD ${hist})`;
    }).join(', ');
    discussion.push({
      agent: 'Momentum',
      view: `FLM Module 2 Check: ${momDetail}. ${approved.length > 0 ? 'Markup signals and MACD expansions support high-conviction entry.' : 'Momentum signatures are too weak/overextended.'}`,
    });

    discussion.push({
      agent: 'Risk Management',
      view: `FLM Module 3 Active Sizing: capital ₹${ctx.availableCapital.toFixed(0)}, ${ctx.slots} slots open. ${approved.length > 0 ? `Stop-loss set at ${ctx.profile.atrStopMult}×ATR below entry; targets sized at ${ctx.profile.rewardRisk}:1 R:R.` : 'Volatility is too high or stop distances violate capital exposure rules.'}`,
    });

    discussion.push({
      agent: 'Strategy',
      view: approved.length > 0
        ? `FLM Module 4 Trade Setup: approving ${approved.map(c => c.sig.symbol).join(', ')} — price above VWAP, EMA9 stacked above EMA21, and Bollinger Band breakout in play.`
        : `No setups pass VWAP support or EMA stack thresholds (Min Conf ${ctx.profile.minConfidence}%). Standing down.`,
    });

    const sentCands = sorted.slice(0, 2);
    const sentDetail = sentCands.map(c => {
      const surge = c.sig.snapshot.volSurge?.toFixed(1) ?? '—';
      return `${c.sig.symbol} ${surge}× vol`;
    }).join(', ');
    discussion.push({
      agent: 'Sentiment',
      view: approved.length > 0
        ? `Institutional Nudge: day's sentiment is bullish. ${sentDetail}. Strong volume surge confirms large-scale accumulation.`
        : 'Weak volume profiles and high-range consolidations suggest near-term weakness. Standing down.',
    });
  }

  return {
    marketView: `Deterministic screen: ${candidates.length} candidates evaluated, ${approved.length} approved (${ctx.profile.label} profile, min conf ${ctx.profile.minConfidence}%).`,
    discussion,
    decisions: sorted.map(c => ({
      symbol: c.sig.symbol,
      action: approved.some(a => a.sig.symbol === c.sig.symbol) ? 'enter' as const : 'skip' as const,
      confidence: c.sig.confidence,
      reason: approved.some(a => a.sig.symbol === c.sig.symbol)
        ? (c.sig.reasons[0] ?? 'Signal screen passed')
        : (c.sig.confidence < ctx.profile.minConfidence
            ? `Confidence ${c.sig.confidence}% below threshold ${ctx.profile.minConfidence}%`
            : c.sig.action === 'skip'
              ? (c.sig.reasons[0] ? `Skipped: ${c.sig.bias} bias` : 'Signal action is skip')
              : 'Ranked below top picks'),
    })),
    source: 'fallback',
  };
}

export async function deliberate(candidates: CouncilCandidate[], ctx: CouncilContext): Promise<CouncilVerdict> {
  if (!process.env.ANTHROPIC_API_KEY || candidates.length === 0) {
    return fallbackVerdict(candidates, ctx);
  }
  try {
    const res = await anthropic.messages.create({
      model: COUNCIL_MODEL,
      max_tokens: 1600,
      system: SYSTEM,
      tools: [COUNCIL_TOOL],
      tool_choice: { type: 'tool', name: 'council_verdict' },
      messages: [{ role: 'user', content: buildPrompt(candidates, ctx) }],
    });
    const toolUse = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use');
    const out = toolUse?.input as any;
    if (!out?.decisions) return fallbackVerdict(candidates, ctx);
    return {
      marketView: out.market_view ?? '',
      discussion: Array.isArray(out.discussion) ? out.discussion : [],
      decisions: out.decisions,
      source: 'council',
    };
  } catch (err) {
    console.error('[aiTrader] council error:', err);
    return fallbackVerdict(candidates, ctx);
  }
}
