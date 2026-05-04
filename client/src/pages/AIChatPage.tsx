import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X, RotateCcw, TrendingUp, BookOpen, PieChart, BarChart2, HelpCircle, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from 'axios';
import { cn } from '../lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const QUICK_CHIPS = [
  { icon: <PieChart className="w-3.5 h-3.5" />, label: 'Analyse my portfolio', prompt: 'Analyse my portfolio in detail — P&L, sector allocation, concentration risk, and what I should watch out for.' },
  { icon: <TrendingUp className="w-3.5 h-3.5" />, label: 'Market overview today', prompt: 'Give me a quick overview of how the Indian markets are doing today — NIFTY, SENSEX, BANK NIFTY, and key sector movers.' },
  { icon: <BarChart2 className="w-3.5 h-3.5" />, label: 'Top gainers & losers', prompt: 'Which sectors and stocks are gaining and losing the most in the market today? What might be driving the moves?' },
  { icon: <BookOpen className="w-3.5 h-3.5" />, label: 'Explain P/E ratio', prompt: 'Explain the P/E ratio — what it means, how to use it to evaluate stocks, and its limitations.' },
  { icon: <Zap className="w-3.5 h-3.5" />, label: 'How to read charts', prompt: 'Teach me technical analysis basics — what to look for in a stock chart, key indicators, and how to identify buy/sell signals.' },
  { icon: <HelpCircle className="w-3.5 h-3.5" />, label: 'Options explained', prompt: 'Explain how options (Call and Put) work in the Indian stock market with simple examples. Include the Greeks.' },
];

const WELCOME = `Hello! I'm your AI financial assistant — powered by Claude and deeply integrated with your portfolio and live market data.

I can help you with:
- **Your portfolio** — analyse holdings, P&L, risk, and sector exposure
- **Stock analysis** — fundamentals, technicals, valuation
- **Market insights** — live NIFTY/SENSEX levels, sector trends, macro drivers
- **Learning** — options, F&O, chart patterns, financial ratios, tax implications
- **Strategy** — position sizing, risk management, investment frameworks

What would you like to know?`;

export default function AIChatPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: WELCOME, timestamp: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showChips, setShowChips] = useState(true);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    setShowChips(false);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await axios.post('/api/ai/chat', {
        message: userMsg.content,
        history: messages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
      });
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.data.response,
        timestamp: new Date(),
      }]);
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'Something went wrong. Please try again.';
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ ${errMsg}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([{ id: '1', role: 'assistant', content: WELCOME, timestamp: new Date() }]);
    setShowChips(true);
  };

  const onlyWelcome = messages.length === 1;

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] bg-gray-50 dark:bg-groww-dark">
      {/* Header */}
      <div className="shrink-0 bg-white dark:bg-groww-card border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-groww-primary rounded-xl flex items-center justify-center shadow-sm">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight">AI Market Assistant</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Portfolio-aware · Live market data · Indian equity expert</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!onlyWelcome && (
            <button
              onClick={clearChat}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
              title="New chat"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New chat</span>
            </button>
          )}
          <button
            onClick={() => navigate('/dashboard')}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
            {/* Avatar */}
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5',
              msg.role === 'user'
                ? 'bg-groww-primary text-white'
                : 'bg-gray-200 dark:bg-gray-700'
            )}>
              {msg.role === 'user' ? 'You' : <Sparkles className="w-4 h-4 text-groww-primary" />}
            </div>

            {/* Bubble */}
            <div className={cn(
              'max-w-[85%] rounded-2xl px-4 py-3',
              msg.role === 'user'
                ? 'bg-groww-primary text-white rounded-tr-sm'
                : 'bg-white dark:bg-groww-card border border-gray-100 dark:border-gray-800 rounded-tl-sm'
            )}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100
                  prose-headings:text-gray-900 dark:prose-headings:text-white
                  prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1
                  prose-h2:text-sm prose-h3:text-sm
                  prose-p:my-1 prose-p:leading-relaxed
                  prose-ul:my-1 prose-ul:pl-4 prose-li:my-0.5
                  prose-ol:my-1 prose-ol:pl-4
                  prose-strong:text-gray-900 dark:prose-strong:text-white
                  prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded prose-code:text-xs prose-code:text-groww-primary
                  prose-table:text-xs prose-th:py-1 prose-td:py-1
                  prose-a:text-groww-primary prose-a:no-underline hover:prose-a:underline
                  [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              )}
              <p className={cn('text-[10px] mt-1.5', msg.role === 'user' ? 'text-white/60 text-right' : 'text-gray-400')}>
                {msg.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {/* Loading dots */}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-groww-primary" />
            </div>
            <div className="bg-white dark:bg-groww-card border border-gray-100 dark:border-gray-800 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1 items-center h-5">
                {[0, 150, 300].map((delay) => (
                  <span key={delay} className="w-2 h-2 bg-groww-primary/60 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick chips — shown only at start */}
      {showChips && onlyWelcome && (
        <div className="shrink-0 px-4 pb-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Quick questions</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip.label}
                onClick={() => sendMessage(chip.prompt)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-groww-card border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 hover:border-groww-primary hover:text-groww-primary transition"
              >
                {chip.icon}
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 bg-white dark:bg-groww-card border-t border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="flex gap-2 items-end max-w-4xl mx-auto">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your portfolio, stocks, markets, strategies..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-groww-primary focus:border-transparent dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition"
            style={{ minHeight: '42px', maxHeight: '120px' }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className={cn(
              'p-2.5 rounded-xl transition shrink-0',
              input.trim() && !isLoading
                ? 'bg-groww-primary text-white hover:bg-green-600 shadow-sm'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-gray-400 text-center mt-1.5">
          For educational use on a paper trading platform · Not real financial advice · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
