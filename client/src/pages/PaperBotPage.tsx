import { useState, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/utils';
import { Bot, Calendar, Clock, Flame, BookOpen, TrendingUp, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

type BotPost = {
  id: number;
  title: string;
  body: string;
  category: string;
  created_at: string;
};

const CAT_COLORS: Record<string, string> = {
  market:       'bg-blue-500/10 text-blue-400 border-blue-500/20',
  strategies:   'bg-purple-500/10 text-purple-400 border-purple-500/20',
  intraday:     'bg-amber-500/10 text-amber-400 border-amber-500/20',
  fundamentals: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  beginners:    'bg-green-500/10 text-green-400 border-green-500/20',
  trades:       'bg-orange-500/10 text-orange-400 border-orange-500/20',
  news:         'bg-red-500/10 text-red-400 border-red-500/20',
  general:      'bg-gray-500/10 text-gray-400 border-gray-500/20',
};

const CAT_ICONS: Record<string, string> = {
  market: '📈', strategies: '💡', intraday: '⚡', fundamentals: '📊',
  beginners: '🔰', trades: '🏆', news: '📰', general: '💬',
};

function formatDate(iso: string) {
  const d = new Date(iso + 'Z');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(iso: string) {
  const d = new Date(iso + 'Z');
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function PostSkeleton() {
  return (
    <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-6 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700" />
        <div className="flex-1">
          <div className="h-4 w-48 rounded bg-gray-200 dark:bg-gray-700 mb-2" />
          <div className="h-3 w-24 rounded bg-gray-100 dark:bg-gray-800" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 rounded bg-gray-100 dark:bg-gray-800" />
        <div className="h-3 rounded bg-gray-100 dark:bg-gray-800 w-5/6" />
        <div className="h-3 rounded bg-gray-100 dark:bg-gray-800 w-4/6" />
        <div className="h-3 rounded bg-gray-100 dark:bg-gray-800 w-3/6" />
      </div>
    </div>
  );
}

function MarkdownBody({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        h1: ({ children }) => <h1 className="text-base font-bold text-gray-900 dark:text-white mb-2 mt-4">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2 mt-3">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1.5 mt-2">{children}</h3>,
        ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-3 text-sm text-gray-700 dark:text-gray-300">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-3 text-sm text-gray-700 dark:text-gray-300">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-groww-primary pl-3 my-2 text-gray-600 dark:text-gray-400 italic text-sm">
            {children}
          </blockquote>
        ),
        code: ({ children }) => (
          <code className="bg-gray-100 dark:bg-gray-800 text-groww-primary text-xs px-1.5 py-0.5 rounded font-mono">
            {children}
          </code>
        ),
        hr: () => <hr className="my-3 border-gray-200 dark:border-gray-700" />,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-groww-primary underline underline-offset-2 hover:text-green-600 transition-colors"
          >
            {children}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function PostCard({ post, isLatest }: { post: BotPost; isLatest: boolean }) {
  const [expanded, setExpanded] = useState(isLatest);
  const catColor = CAT_COLORS[post.category] || CAT_COLORS.general;
  const catIcon = CAT_ICONS[post.category] || '💬';

  return (
    <article className={cn(
      'bg-white dark:bg-groww-card rounded-2xl border overflow-hidden transition-all duration-300',
      isLatest
        ? 'border-groww-primary/30 dark:border-groww-primary/20 shadow-lg shadow-green-500/5'
        : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
    )}>
      {isLatest && (
        <div className="bg-gradient-to-r from-groww-primary/10 via-emerald-500/5 to-transparent px-5 py-2 flex items-center gap-2 border-b border-groww-primary/10">
          <Sparkles className="w-3.5 h-3.5 text-groww-primary" />
          <span className="text-[11px] font-bold text-groww-primary uppercase tracking-wider">Latest Post</span>
        </div>
      )}

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shrink-0 shadow-sm">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-green-600 dark:text-green-400">PaperBot</span>
              <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold border', catColor)}>
                {catIcon} {post.category}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400 dark:text-gray-500">
              <Calendar className="w-3 h-3" />
              <span>{formatDate(post.created_at)}</span>
              <span>·</span>
              <Clock className="w-3 h-3" />
              <span>{formatTime(post.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-[15px] font-bold text-gray-900 dark:text-white leading-snug mb-3">
          {post.title}
        </h3>

        {/* Body */}
        <div className={cn(
          'transition-all duration-300 overflow-hidden',
          expanded ? 'max-h-[3000px]' : 'max-h-[120px]'
        )}>
          <MarkdownBody>{post.body}</MarkdownBody>
        </div>

        {/* Expand/Collapse */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-groww-primary hover:text-green-600 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Read full post
            </>
          )}
        </button>
      </div>
    </article>
  );
}

export default function PaperBotPage() {
  const [posts, setPosts] = useState<BotPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      try {
        const params: any = { limit: 30 };
        if (category !== 'all') params.category = category;
        const res = await axios.get('/api/paperbot/posts', { params });
        setPosts(res.data);
      } catch {
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [category]);

  const categories = [
    { key: 'all', label: 'All Posts', icon: '🌐' },
    { key: 'market', label: 'Market', icon: '📈' },
    { key: 'strategies', label: 'Strategies', icon: '💡' },
    { key: 'intraday', label: 'Intraday', icon: '⚡' },
    { key: 'fundamentals', label: 'Fundamentals', icon: '📊' },
    { key: 'beginners', label: 'Beginners', icon: '🔰' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-groww-dark">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Hero */}
        <div className="relative mb-6 rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-green-600 via-emerald-600 to-teal-700" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent_50%)]" />
          <div className="relative px-6 py-8 sm:px-8 sm:py-10">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-lg ring-1 ring-white/20">
                <Bot className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                  PaperBot
                  <span className="px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">AI</span>
                </h1>
                <p className="text-green-100/80 text-sm mt-1.5 max-w-md leading-relaxed">
                  Your daily AI trading companion — sharing strategies, analysis, and market insights every morning at 8 AM IST.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-5">
              <div className="flex items-center gap-1.5 text-xs text-green-100/70">
                <Flame className="w-3.5 h-3.5" />
                <span>Daily posts</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-green-100/70">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Educational content</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-green-100/70">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Market insights</span>
              </div>
            </div>
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-hide -mx-4 px-4">
          {categories.map(c => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition shrink-0',
                category === c.key
                  ? 'bg-groww-primary text-white shadow-sm'
                  : 'bg-white dark:bg-groww-card border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-groww-primary hover:text-groww-primary'
              )}
            >
              <span>{c.icon}</span>
              <span>{c.label}</span>
            </button>
          ))}
        </div>

        {/* Posts */}
        {loading ? (
          <div className="space-y-4">
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800">
            <div className="text-5xl mb-3">🤖</div>
            <p className="text-base font-bold text-gray-800 dark:text-gray-200 mb-1">
              No posts yet
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              PaperBot posts daily strategies every morning. Check back soon!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post, i) => (
              <PostCard key={post.id} post={post} isLatest={i === 0} />
            ))}
          </div>
        )}

        {/* Disclaimer */}
        <div className="mt-8 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 text-center">
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            📌 PaperBot is AI-generated educational content. This is a paper trading platform — not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
