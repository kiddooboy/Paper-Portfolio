// Claude explanation layer.
//
// The signal engine makes the decision; Claude turns the raw signal breakdown
// into a short, human "why" for the console — the "trade explanation engine".
// It is best-effort and never blocks a trade: if the API is slow/unavailable we
// fall back to a deterministic summary built from the signals themselves.

import Anthropic from '@anthropic-ai/sdk';
import type { SignalResult } from './signals.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

function fallback(sig: SignalResult, kind: 'entry' | 'exit', extra?: string): string {
  if (kind === 'exit') return extra ?? 'Exit conditions met.';
  const top = sig.reasons.slice(0, 3).join(', ');
  return `Confidence ${sig.confidence}%. ${top || 'Bullish setup detected'}.`;
}

/** Short narrative for why the AI entered a trade. Best-effort; ~1-2 sentences. */
export async function explainEntry(sig: SignalResult, riskLabel: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return fallback(sig, 'entry');
  try {
    const breakdown = sig.signals.map(s => `${s.agent}: ${s.detail} (${s.score > 0 ? '+' : ''}${s.score})`).join('\n');
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system:
        'You are the reasoning voice of an autonomous intraday trading agent on a PAPER-trading simulator. ' +
        'Given a signal breakdown, explain in ONE crisp sentence (max 28 words) why the agent is entering a long trade. ' +
        'Be concrete and reference the strongest signals. No disclaimers, no preamble.',
      messages: [{
        role: 'user',
        content: `Symbol: ${sig.symbol}\nRisk profile: ${riskLabel}\nComposite confidence: ${sig.confidence}%\nSignals:\n${breakdown}`,
      }],
    });
    const text = res.content[0]?.type === 'text' ? res.content[0].text.trim() : '';
    return text || fallback(sig, 'entry');
  } catch {
    return fallback(sig, 'entry');
  }
}
