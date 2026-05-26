// The AI trading council — a genuine multi-agent deliberation powered by the
// strongest Claude model. The deterministic signal engine screens the whole
// market down to a shortlist of candidates; this council then *debates* them
// (Market Analysis, Momentum, Risk Management, Strategy, Sentiment) and reaches
// a collective verdict on what to actually trade. The discussion transcript is
// streamed to the live console so the user sees the agents reasoning in real time.
//
// If the API key is missing or a call fails, we fall back to the deterministic
// confidence so the engine never stalls.

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
You are five specialist agents who must DEBATE and then reach a collective verdict:
- Market Analysis: overall trend, breadth, regime (trending vs choppy).
- Momentum: RSI/MACD/price action strength on each name.
- Risk Management: position sizing fit, stop-loss viability, capital exposure, avoid overextended names.
- Strategy: does the setup match a clean intraday long (breakout / momentum continuation / VWAP reclaim)?
- Sentiment: directional bias from the day's move and volume.

Rules:
- LONG ONLY. Intraday. You may only approve high-conviction setups; it is correct to approve NONE on a weak day.
- Never approve more names than the available slots.
- Respect the risk profile: a conservative profile demands cleaner, lower-volatility setups; aggressive tolerates wider, faster moves.
- Be decisive and concrete. Reference the actual indicator readings you are given.
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

/** Deterministic fallback when the council can't run. */
function fallbackVerdict(candidates: CouncilCandidate[], ctx: CouncilContext): CouncilVerdict {
  const approved = candidates
    .filter(c => c.sig.confidence >= ctx.profile.minConfidence)
    .slice(0, ctx.slots);
  return {
    marketView: 'Council offline — using deterministic signal screen.',
    discussion: [],
    decisions: candidates.map(c => ({
      symbol: c.sig.symbol,
      action: approved.includes(c) ? 'enter' : 'skip',
      confidence: c.sig.confidence,
      reason: c.sig.reasons[0] ?? 'signal screen',
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
