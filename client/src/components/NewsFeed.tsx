import { useEffect, useState, useCallback } from 'react';
import { ExternalLink, Newspaper, AlertCircle, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../lib/utils';

interface Sentiment {
  label: string;
  score?: number;
  [key: string]: any;
}

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  publisher: string;
  sentiment?: Sentiment;
}

interface Props {
  query?: string;
  className?: string;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

function buildApiUrl(query: string) {
  const symbol = query.trim();
  if (symbol) return `${API_BASE}/api/news/stock/${encodeURIComponent(symbol)}`;
  return `${API_BASE}/api/news`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function SentimentBadge({ sentiment }: { sentiment?: Sentiment }) {
  if (!sentiment?.label) return null;
  const label = sentiment.label.toLowerCase();
  if (label.includes('positive') || label === 'bullish') {
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">
        <TrendingUp className="w-2.5 h-2.5" /> Positive
      </span>
    );
  }
  if (label.includes('negative') || label === 'bearish') {
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">
        <TrendingDown className="w-2.5 h-2.5" /> Negative
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">
      <Minus className="w-2.5 h-2.5" /> Neutral
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-4 space-y-2.5">
      <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded-lg w-3/4" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-lg w-full" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-lg w-5/6" />
      <div className="flex justify-between mt-1">
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-lg w-24" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-lg w-16" />
      </div>
    </div>
  );
}

export default function NewsFeed({ query = '', className }: Props) {
  const [articles, setArticles] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = buildApiUrl(query);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: NewsItem[] = await res.json();
      setArticles((json || []).slice(0, 10));
      setLastRefreshed(new Date());
    } catch {
      setError('Could not load news. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNews]);

  return (
    <div className={cn('space-y-3', className)}>
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-indigo-500" />
          {query.trim() ? `News for "${query.trim()}"` : 'Market News'}
        </h3>
        <div className="flex items-center gap-2">
          {lastRefreshed && !loading && (
            <span className="text-[10px] text-gray-400">
              Updated {lastRefreshed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={fetchNews}
            disabled={loading}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-2.5 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={fetchNews} className="ml-auto text-xs font-semibold underline underline-offset-2">Retry</button>
        </div>
      )}

      {/* Skeletons */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Articles */}
      {!loading && !error && articles.length === 0 && (
        <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-8 text-center text-sm text-gray-400">
          No articles found.
        </div>
      )}

      {!loading && articles.length > 0 && (
        <div className="space-y-3">
          {articles.map((article, i) => (
            <a
              key={i}
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group block bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-4 hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-md transition-all duration-150"
            >
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2">
                {article.title}
              </p>
              <div className="flex items-center justify-between mt-2.5 flex-wrap gap-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full truncate max-w-[140px]">
                    {article.publisher || article.source}
                  </span>
                  <span className="text-[11px] text-gray-400 truncate">{formatDate(article.pubDate)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <SentimentBadge sentiment={article.sentiment} />
                  <span className="shrink-0 flex items-center gap-1 text-[11px] text-gray-400 group-hover:text-indigo-500 transition-colors">
                    Read <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
