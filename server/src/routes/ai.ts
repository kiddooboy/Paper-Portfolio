import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// POST /api/ai/chat - Chat with AI assistant
router.post('/chat', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // System prompt for stock market and securities expertise
    const systemPrompt = `You are an expert AI assistant specializing in stock markets, securities, and financial markets. Your expertise includes:

- Stock analysis and fundamental/technical analysis
- Market trends and economic indicators
- Investment strategies (value investing, growth investing, etc.)
- Financial concepts and terminology (P/E ratio, EPS, market cap, etc.)
- Portfolio optimization and diversification
- Risk management
- Indian stock market (NSE, BSE) specifics
- Global market dynamics
- Derivatives (options, futures)
- Mutual funds and ETFs
- IPOs and primary markets

Provide clear, accurate, and helpful responses. Always include appropriate disclaimers that your responses are for informational purposes only and not financial advice. Be concise but thorough in your explanations.

When discussing specific stocks, provide balanced perspectives mentioning both potential risks and opportunities. Always encourage users to do their own research before making investment decisions.`;

    // Build the messages array with system prompt and conversation history
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(history || []),
      { role: 'user', content: message },
    ];

    // Call AI API (you can replace this with your preferred AI service)
    // For now, using a placeholder response
    const response = await generateAIResponse(messages);

    res.json({ response });
  } catch (error: any) {
    console.error('[AI Chat] Error:', error);
    res.status(500).json({ error: 'Failed to generate AI response' });
  }
});

async function generateAIResponse(messages: any[]): Promise<string> {
  // Placeholder implementation - replace with actual AI API call
  // You can integrate with:
  // - OpenAI API (GPT-4, GPT-3.5)
  // - Anthropic API (Claude)
  // - Google AI (Gemini)
  // - Or any other AI service

  // For demonstration, return a contextual response
  const lastUserMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';

  if (lastUserMessage.includes('stock') || lastUserMessage.includes('share')) {
    return `I'd be happy to help you with stock analysis! To provide specific recommendations, I'd need to know:

1. Which stock or sector you're interested in
2. Your investment horizon (short-term vs long-term)
3. Your risk tolerance

In general, when analyzing stocks, consider:
- **Fundamental Analysis**: Look at P/E ratio, EPS growth, debt levels, and market cap
- **Technical Analysis**: Study price trends, volume patterns, and support/resistance levels
- **Sector Trends**: Understand the industry dynamics and competitive landscape

Remember: Always do your own research and consider consulting a financial advisor before making investment decisions.`;
  }

  if (lastUserMessage.includes('market') || lastUserMessage.includes('trend')) {
    return `Market analysis involves understanding various factors:

**Key Market Indicators:**
- Nifty 50 and Sensex (Indian benchmarks)
- Sector indices (Bank Nifty, IT, Pharma, etc.)
- Global market cues (S&P 500, NASDAQ, FTSE)

**Factors Affecting Markets:**
- Economic indicators (GDP, inflation, interest rates)
- Corporate earnings
- Government policies and regulations
- Global events and geopolitical tensions
- Foreign institutional investment (FII) flows

**Current Market Outlook:**
I recommend checking real-time market data for the most current trends. The market can be volatile, so maintain a long-term perspective and diversify your portfolio.

Would you like me to elaborate on any specific aspect?`;
  }

  if (lastUserMessage.includes('invest') || lastUserMessage.includes('strategy')) {
    return `Here are some popular investment strategies:

**1. Value Investing**
- Buy undervalued stocks with strong fundamentals
- Focus on intrinsic value vs market price
- Long-term horizon (3-5+ years)

**2. Growth Investing**
- Invest in companies with high growth potential
- Accept higher P/E ratios for growth
- Focus on revenue and earnings growth

**3. Index Fund Investing**
- Passive investing in market indices
- Low fees and broad diversification
- Good for beginners

**4. Dividend Investing**
- Focus on dividend-paying stocks
- Regular income stream
- Generally lower risk

**5. SIP (Systematic Investment Plan)**
- Invest fixed amount regularly
- Rupee cost averaging
- Disciplined approach

**Important Principles:**
- Diversify across sectors and asset classes
- Invest only what you can afford to lose
- Have an emergency fund before investing
- Review and rebalance portfolio periodically

Which strategy interests you most?`;
  }

  return `I'm your AI assistant for stock market and securities. I can help you with:

📊 **Stock Analysis**
- Fundamental and technical analysis
- Company financials and ratios
- Sector comparisons

📈 **Market Insights**
- Market trends and indicators
- Economic factors affecting markets
- Sector analysis

💡 **Investment Strategies**
- Value vs growth investing
- Portfolio diversification
- Risk management

📚 **Financial Concepts**
- P/E ratio, EPS, market cap
- Derivatives (options, futures)
- Mutual funds and ETFs

Please ask your specific question, and I'll provide detailed information to help you make informed decisions.

*Disclaimer: My responses are for informational purposes only and should not be considered as financial advice. Always do your own research and consult a financial advisor before making investment decisions.*`;
}

export default router;
