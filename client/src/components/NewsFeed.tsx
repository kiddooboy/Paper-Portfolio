import { useEffect, useState, useCallback } from 'react';
import { ExternalLink, Newspaper, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

interface Props {
  query?: string;
  className?: string;
}

function buildFeedUrl(query: string) {
  const q = query.trim()
    ? `${encodeURIComponent(query.trim())}+NSE+stock+india`
    : 'stock+market+india';
  const googleRss = `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`;
  return `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(googleRss)}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
      const url = buildFeedUrl(query);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.status !== 'ok') throw new Error('Feed error');
      const items: NewsItem[] = (json.items || []).slice(0, 10).map((item: any) => ({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        source: item.author || item.source?.name || new URL(item.link).hostname.replace('www.', ''),
      }));
      setArticles(items);
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
              <div className="flex items-center justify-between mt-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full truncate max-w-[140px]">
                    {article.source}
                  </span>
                  <span className="text-[11px] text-gray-400 truncate">{formatDate(article.pubDate)}</span>
                </div>
                <span className="shrink-0 flex items-center gap-1 text-[11px] text-gray-400 group-hover:text-indigo-500 transition-colors">
                  Read <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
