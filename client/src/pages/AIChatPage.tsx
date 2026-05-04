import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, User, Bot, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { cn } from '../lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AIChatPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m your AI assistant for stock market and securities. I can help you with:\n\n• Stock analysis and recommendations\n• Market trends and insights\n• Investment strategies\n• Financial concepts and terminology\n• Portfolio optimization\n\nWhat would you like to know today?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await axios.post('/api/ai/chat', {
        message: userMessage.content,
        history: messages.slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.data.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: '1',
        role: 'assistant',
        content: 'Hello! I\'m your AI assistant for stock market and securities. I can help you with:\n\n• Stock analysis and recommendations\n• Market trends and insights\n• Investment strategies\n• Financial concepts and terminology\n• Portfolio optimization\n\nWhat would you like to know today?',
        timestamp: new Date(),
      },
    ]);
  };

  return (
    <div className="h-[calc(100vh-60px)] flex flex-col bg-white dark:bg-groww-card">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-groww-primary text-white p-2 rounded-lg">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">AI Market Assistant</h1>
            <p className="text-sm text-gray-500">Your intelligent stock market advisor</p>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-xs font-medium"
          title="Clear chat"
        >
          Clear
        </button>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'flex gap-3 max-w-4xl',
              message.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
            )}
          >
            <div
              className={cn(
                'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                message.role === 'user'
                  ? 'bg-groww-primary text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              )}
            >
              {message.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div
              className={cn(
                'rounded-2xl px-4 py-3 max-w-[80%]',
                message.role === 'user'
                  ? 'bg-groww-primary text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              )}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              <p className="text-[10px] opacity-60 mt-1">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3 max-w-4xl mr-auto">
            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-4">
        <div className="max-w-4xl mx-auto flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about stocks, market trends, investment strategies..."
            className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-groww-primary focus:border-transparent dark:text-white"
            rows={1}
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={cn(
              'px-4 py-3 rounded-xl flex items-center gap-2 transition',
              !input.trim() || isLoading
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-groww-primary text-white hover:bg-groww-primary/90'
            )}
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
        <p className="text-xs text-gray-500 text-center mt-2">
          AI responses are for informational purposes only. Always do your own research before making investment decisions.
        </p>
      </div>
    </div>
  );
}
