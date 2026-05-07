import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, RotateCcw, PieChart, TrendingUp, BarChart2, BookOpen, Zap, HelpCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from 'axios';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';

const MdComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
  h1: ({ children }) => <p className="font-bold mb-1 mt-3 first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="font-semibold mb-1 mt-2 first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="font-medium mb-0.5 mt-1.5 first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-1.5 mt-0.5 pl-4 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-1.5 mt-0.5 pl-4 list-decimal space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  code: ({ children, className }) => {
    const isBlock = !!className?.startsWith('language-');
    if (isBlock) return (
      <pre className="my-2 rounded-lg bg-gray-900 dark:bg-black p-2.5 overflow-x-auto text-[10px] text-gray-100 font-mono leading-relaxed">
        <code>{children}</code>
      </pre>
    );
    return <code className="bg-gray-100 dark:bg-gray-800 text-groww-primary text-[10px] font-mono px-1 py-0.5 rounded">{children}</code>;
  },
  pre: ({ children }) => <>{children}</>,
  a: ({ href, children }) => <a href={href} className="text-groww-primary hover:underline" target="_blank" rel="noreferrer">{children}</a>,
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const CHIPS = [
  { icon: <PieChart className="w-3 h-3" />, label: 'Analyse my portfolio', prompt: 'Analyse my portfolio in detail — P&L, sector allocation, concentration risk, and what I should watch out for.' },
  { icon: <TrendingUp className="w-3 h-3" />, label: 'Market overview', prompt: 'Give me a quick overview of how Indian markets are doing today — NIFTY, SENSEX, BANK NIFTY, and key sector movers.' },
  { icon: <BarChart2 className="w-3 h-3" />, label: 'Top gainers & losers', prompt: 'Which sectors and stocks are gaining and losing the most today? What might be driving the moves?' },
  { icon: <BookOpen className="w-3 h-3" />, label: 'Explain P/E ratio', prompt: 'Explain the P/E ratio — what it means, how to use it to evaluate stocks, and its limitations.' },
  { icon: <Zap className="w-3 h-3" />, label: 'Read charts', prompt: 'Teach me technical analysis basics — what to look for in a stock chart, key indicators, and buy/sell signals.' },
  { icon: <HelpCircle className="w-3 h-3" />, label: 'Options explained', prompt: 'Explain how options (Call and Put) work in the Indian stock market with simple examples.' },
];

const AI_LIMIT = 10;

export default function AIChatPanel() {
  const user = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [creditsUsed, setCreditsUsed] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    axios.get('/api/ai/credits').then((r) => setCreditsUsed(r.data.used)).catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 100) + 'px';
    }
  }, [input]);

  const exhausted = creditsUsed !== null && creditsUsed >= AI_LIMIT;
  const hasMessages = messages.length > 0;

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading || exhausted) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text.trim(), timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    try {
      const res = await axios.post('/api/ai/chat', {
        message: userMsg.content,
        history: messages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
      });
      if (res.data.creditsUsed != null) setCreditsUsed(res.data.creditsUsed);
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: res.data.response, timestamp: new Date() }]);
    } catch (err: any) {
      if (err.response?.data?.error === 'credits_exhausted') { setCreditsUsed(AI_LIMIT); return; }
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: 'Sorry, something went wrong. Please try again.', timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const clearChat = () => setMessages([]);

  const firstName = user?.name?.split(' ')[0] || 'there';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      {/* Panel header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#6366f1 0%,#00B386 100%)', padding: '5px' }}>
            <svg width="18" height="18" viewBox="0 0 26 26" fill="none"><rect x="4" y="7" width="18" height="14" rx="4" fill="white" fillOpacity="0.95"/><line x1="13" y1="7" x2="13" y2="3" stroke="white" strokeWidth="2" strokeLinecap="round"/><circle cx="13" cy="2.5" r="1.5" fill="white"/><circle cx="9.5" cy="13" r="2" fill="#6366f1"/><circle cx="16.5" cy="13" r="2" fill="#6366f1"/><circle cx="10.2" cy="12.3" r="0.6" fill="white"/><circle cx="17.2" cy="12.3" r="0.6" fill="white"/><rect x="9" y="17" width="2" height="2" rx="0.5" fill="#00B386"/><rect x="12" y="16" width="2" height="3" rx="0.5" fill="#6366f1"/><rect x="15" y="15" width="2" height="4" rx="0.5" fill="#00B386"/><rect x="1.5" y="11" width="2.5" height="5" rx="1.25" fill="white" fillOpacity="0.8"/><rect x="22" y="11" width="2.5" height="5" rx="1.25" fill="white" fillOpacity="0.8"/></svg>
          </div>
          <span className="font-semibold text-sm">AI Assistant</span>
          {creditsUsed !== null && !exhausted && (
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', creditsUsed >= 7 ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-500')}>
              {AI_LIMIT - creditsUsed} left
            </span>
          )}
        </div>
        {hasMessages && (
          <button onClick={clearChat} title="New chat" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
        {!hasMessages ? (
          /* Welcome state */
          <div className="flex flex-col h-full justify-between">
            <div className="pt-4">
              <p className="text-xl font-bold text-groww-primary">Hello, {firstName}</p>
              <p className="text-base font-semibold text-gray-800 dark:text-gray-100 mt-0.5">What can I do for you today?</p>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">Portfolio-aware · Live market data · Indian equity expert</p>
            </div>
            <div className="space-y-2 pb-2">
              {CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => sendMessage(chip.prompt)}
                  disabled={exhausted}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-xs font-medium text-gray-700 dark:text-gray-300 hover:border-groww-primary hover:text-groww-primary hover:bg-groww-primary/5 transition text-left disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="shrink-0 text-groww-primary">{chip.icon}</span>
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages */
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                <div className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5', msg.role === 'user' ? 'bg-groww-primary text-white' : 'bg-gray-200 dark:bg-gray-700')}>
                  {msg.role === 'user' ? 'Y' : <Sparkles className="w-3 h-3 text-groww-primary" />}
                </div>
                <div className={cn('max-w-[85%] rounded-2xl px-3 py-2', msg.role === 'user' ? 'bg-groww-primary text-white rounded-tr-sm' : 'bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-tl-sm')}>
                  {msg.role === 'assistant' ? (
                    <div className="text-xs text-gray-800 dark:text-gray-100 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MdComponents}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-xs whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  )}
                  <p className={cn('text-[9px] mt-1', msg.role === 'user' ? 'text-white/60 text-right' : 'text-gray-400')}>
                    {msg.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3 h-3 text-groww-primary" />
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl rounded-tl-sm px-3 py-2.5">
                  <div className="flex gap-1 items-center">
                    {[0, 150, 300].map((d) => <span key={d} className="w-1.5 h-1.5 bg-groww-primary/60 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-gray-100 dark:border-gray-800 px-3 py-3">
        {exhausted ? (
          <p className="text-xs text-center text-red-500 font-medium py-1">No credits remaining</p>
        ) : (
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about markets, portfolio, stocks…"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-groww-primary/30 focus:border-groww-primary dark:text-white placeholder-gray-400 transition"
              style={{ minHeight: '36px', maxHeight: '100px' }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className={cn('p-2 rounded-xl transition shrink-0', input.trim() && !isLoading ? 'bg-groww-primary text-white hover:bg-green-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed')}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
