import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuthStore } from '../store/authStore';
import { cn } from '../lib/utils';
import {
  ArrowUp, ArrowDown, MessageCircle, Plus, X,
  Flame, Clock, TrendingUp, Trash2, Send, Users, ImagePlus, AtSign,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
type Post = {
  id: number;
  user_id: number;
  author_name: string;
  category: string;
  title: string;
  body: string;
  upvotes: number;
  downvotes: number;
  comments_count: number;
  my_vote: 1 | -1 | null;
  created_at: string;
};

type Comment = {
  id: number;
  user_id: number;
  author_name: string;
  body: string;
  upvotes: number;
  my_vote: 1 | -1 | null;
  parent_id: number | null;
  created_at: string;
};

type MentionUser = { id: number; name: string };

// ── Constants ──────────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'all',           label: 'All',              icon: '🌐' },
  { key: 'market',        label: 'Market',           icon: '📈' },
  { key: 'strategies',    label: 'Strategies',       icon: '💡' },
  { key: 'intraday',      label: 'Intraday',         icon: '⚡' },
  { key: 'fundamentals',  label: 'Fundamentals',     icon: '📊' },
  { key: 'beginners',     label: 'Beginners',        icon: '🔰' },
  { key: 'trades',        label: 'Trades & Wins',    icon: '🏆' },
  { key: 'news',          label: 'News',             icon: '📰' },
  { key: 'general',       label: 'General',          icon: '💬' },
];

const CAT_COLORS: Record<string, string> = {
  market:       'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  strategies:   'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  intraday:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  fundamentals: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  beginners:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  trades:       'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  news:         'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  general:      'bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-300',
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso + 'Z').getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function avatarColor(name: string) {
  const colors = ['#00B386', '#6366F1', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[h];
}

function stripMarkdown(text: string) {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}(.*?)`{1,3}/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/[-_*]{3,}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Avatar ─────────────────────────────────────────────────────────────────
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{ width: size, height: size, backgroundColor: avatarColor(name), fontSize: size * 0.36 }}
    >
      {initials(name)}
    </div>
  );
}

// ── Render text with clickable links and @mentions ─────────────────────────
function RichText({ text }: { text: string }) {
  const URL_RE = /(https?:\/\/[^\s]+)/g;
  const MENTION_RE = /@([\w ]+?)(?=\s|$|[^a-zA-Z0-9 ])/g;

  const parts: React.ReactNode[] = [];
  let last = 0;
  const combined = new RegExp(`${URL_RE.source}|${MENTION_RE.source}`, 'g');
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = combined.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) {
      // URL
      parts.push(
        <a key={key++} href={m[1]} target="_blank" rel="noopener noreferrer"
          className="text-groww-primary underline underline-offset-2 break-all hover:text-green-600 transition-colors"
          onClick={e => e.stopPropagation()}
        >
          {m[1]}
        </a>
      );
    } else if (m[2]) {
      // @mention
      parts.push(
        <span key={key++} className="text-groww-primary font-semibold">
          @{m[2]}
        </span>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// ── Markdown body (for expanded post bodies) ───────────────────────────────
function MarkdownBody({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        h1: ({ children }) => <h1 className="text-base font-bold text-gray-900 dark:text-white mb-2 mt-3">{children}</h1>,
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
        img: ({ src, alt }) => (
          <img
            src={src} alt={alt || ''}
            className="max-w-full rounded-xl my-2 border border-gray-100 dark:border-gray-800 cursor-pointer"
            style={{ maxHeight: 400, objectFit: 'contain' }}
            onClick={() => window.open(src, '_blank')}
          />
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-groww-primary underline underline-offset-2 hover:text-green-600 transition-colors"
          >
            {children}
          </a>
        ),
        hr: () => <hr className="my-3 border-gray-200 dark:border-gray-700" />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

// ── Smart @mention textarea ────────────────────────────────────────────────
function MentionTextarea({
  value, onChange, placeholder, rows, className, onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  onSubmit?: () => void;
}) {
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
  const [, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [activeIdx, setActiveIdx] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    try {
      const res = await axios.get('/api/community/users', { params: { q } });
      setSuggestions(res.data);
      setActiveIdx(0);
    } catch {}
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    onChange(text);

    // Detect @mention trigger
    const cursor = e.target.selectionStart ?? text.length;
    const before = text.slice(0, cursor);
    const match = before.match(/@([\w ]*)$/);
    if (match) {
      setMentionStart(cursor - match[0].length);
      setMentionQuery(match[1]);
      fetchSuggestions(match[1]);
    } else {
      setSuggestions([]);
      setMentionStart(-1);
    }
  };

  const insertMention = (user: MentionUser) => {
    if (!taRef.current) return;
    const cursor = taRef.current.selectionStart ?? value.length;
    const before = value.slice(0, mentionStart);
    const after = value.slice(cursor);
    const inserted = `@${user.name} `;
    const newVal = before + inserted + after;
    onChange(newVal);
    setSuggestions([]);
    setMentionStart(-1);
    // Restore focus
    requestAnimationFrame(() => {
      if (taRef.current) {
        taRef.current.focus();
        const pos = before.length + inserted.length;
        taRef.current.setSelectionRange(pos, pos);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(suggestions[activeIdx]); return; }
      if (e.key === 'Escape')    { setSuggestions([]); return; }
    }
    if (onSubmit && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSubmit();
  };

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)
       && taRef.current && !taRef.current.contains(e.target as Node)) {
        setSuggestions([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative flex-1 min-w-0">
      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={cn('w-full', className)}
      />
      {suggestions.length > 0 && (
        <div
          ref={dropRef}
          className="absolute z-50 mt-1 w-56 bg-white dark:bg-groww-card border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden"
          style={{ top: '100%', left: 0 }}
        >
          {suggestions.map((u, i) => (
            <button
              key={u.id}
              onMouseDown={e => { e.preventDefault(); insertMention(u); }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition',
                i === activeIdx
                  ? 'bg-groww-primary/10 text-groww-primary'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
              )}
            >
              <Avatar name={u.name} size={22} />
              <span className="truncate font-medium">{u.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Compose Modal ──────────────────────────────────────────────────────────
function ComposeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Post) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('general');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await axios.post('/api/community/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url: string = res.data.url;
      setImages(imgs => [...imgs, url]);
      setBody(b => b + (b && !b.endsWith('\n') ? '\n' : '') + `![image](${url})\n`);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadImage(file);
    e.target.value = '';
  };

  const submit = async () => {
    if (!title.trim() || !body.trim()) return setError('Title and body are required');
    setLoading(true); setError('');
    try {
      const res = await axios.post('/api/community/posts', { title, body, category });
      onCreated(res.data);
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to post');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="w-full sm:max-w-xl bg-white dark:bg-groww-card rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Create Post</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Category chips */}
          <div>
            <label className="text-xs font-semibold text-gray-400 mb-2 block uppercase tracking-wider">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.filter(c => c.key !== 'all').map(c => (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-semibold border transition',
                    category === c.key
                      ? 'bg-groww-primary text-white border-groww-primary'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-groww-primary hover:text-groww-primary'
                  )}
                >
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-gray-400 mb-1.5 block uppercase tracking-wider">Title</label>
            <input
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-groww-primary focus:border-transparent transition"
              placeholder="What's on your mind?"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Body with @mention support */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Details</label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                  <AtSign className="w-3 h-3" /> to mention
                </span>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-groww-primary transition disabled:opacity-50"
                  title="Upload image"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  {uploading ? 'Uploading…' : 'Add image'}
                </button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleFilePick} />
              </div>
            </div>
            <MentionTextarea
              value={body}
              onChange={setBody}
              placeholder="Share your analysis, strategy, or question… Use @Name to mention someone, paste URLs to auto-link."
              rows={6}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-groww-primary focus:border-transparent resize-none transition"
            />
            {/* Image preview strip */}
            {images.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {images.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
                    <button
                      onClick={() => {
                        setImages(imgs => imgs.filter((_, j) => j !== i));
                        setBody(b => b.replace(`![image](${url})\n`, ''));
                      }}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}

          <button
            onClick={submit}
            disabled={loading || uploading}
            className="w-full py-2.5 rounded-xl bg-groww-primary text-white font-bold text-sm hover:bg-green-600 active:scale-[0.98] transition disabled:opacity-50"
          >
            {loading ? 'Posting…' : 'Post to Community'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Comment Item ───────────────────────────────────────────────────────────
function CommentItem({ comment, onVote }: { comment: Comment; onVote: (id: number, v: 1 | -1) => void }) {
  return (
    <div className="flex gap-3 py-3">
      <Avatar name={comment.author_name} size={26} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{comment.author_name}</span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{timeAgo(comment.created_at)}</span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap break-words">
          <RichText text={comment.body} />
        </p>
        <button
          onClick={() => onVote(comment.id, 1)}
          className={cn(
            'mt-1.5 flex items-center gap-1 text-xs font-semibold transition',
            comment.my_vote === 1
              ? 'text-groww-primary'
              : 'text-gray-400 hover:text-groww-primary'
          )}
        >
          <ArrowUp className="w-3.5 h-3.5" />
          {comment.upvotes > 0 && <span>{comment.upvotes}</span>}
        </button>
      </div>
    </div>
  );
}

// ── Post Card ──────────────────────────────────────────────────────────────
function PostCard({
  post, userId, onVote, onDelete,
}: {
  post: Post; userId: number;
  onVote: (id: number, v: 1 | -1) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [posting, setPosting] = useState(false);
  const cat = CATEGORIES.find(c => c.key === post.category);
  const score = post.upvotes - post.downvotes;
  const preview = stripMarkdown(post.body);
  const isLong = preview.length > 240;

  const loadComments = async () => {
    if (loadingComments) return;
    setLoadingComments(true);
    try {
      const res = await axios.get(`/api/community/posts/${post.id}/comments`);
      setComments(res.data);
    } finally {
      setLoadingComments(false);
    }
  };

  const toggleExpand = () => {
    if (!expanded) loadComments();
    setExpanded(e => !e);
  };

  const submitComment = async () => {
    if (!commentBody.trim()) return;
    setPosting(true);
    try {
      const res = await axios.post(`/api/community/posts/${post.id}/comments`, { body: commentBody });
      setComments(c => [...c, res.data]);
      setCommentBody('');
    } finally {
      setPosting(false);
    }
  };

  const voteComment = async (commentId: number, vote: 1 | -1) => {
    try {
      const res = await axios.post(`/api/community/comments/${commentId}/vote`, { vote });
      setComments(cs => cs.map(c =>
        c.id === commentId
          ? { ...c, my_vote: res.data.vote, upvotes: c.upvotes + (res.data.vote === 1 ? 1 : -1) }
          : c
      ));
    } catch {}
  };

  return (
    <article className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition overflow-hidden">
      <div className="p-4 pb-3">
        {/* Author row */}
        <div className="flex items-center gap-2 mb-3">
          <Avatar name={post.author_name} size={28} />
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{post.author_name}</span>
            <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(post.created_at)}</span>
          </div>
          {cat && (
            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0', CAT_COLORS[post.category] ?? CAT_COLORS.general)}>
              {cat.icon} {cat.label}
            </span>
          )}
          {post.user_id === userId && (
            <button
              onClick={() => onDelete(post.id)}
              className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Title */}
        <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-snug mb-2">{post.title}</h3>

        {/* Body */}
        {expanded ? (
          <div className="mt-1 mb-1">
            <MarkdownBody>{post.body}</MarkdownBody>
          </div>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            {isLong ? preview.slice(0, 240) + '…' : <RichText text={preview} />}
          </p>
        )}

        {isLong && (
          <button
            onClick={toggleExpand}
            className="mt-1.5 text-xs text-groww-primary font-semibold hover:underline"
          >
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-1 px-4 pb-3 pt-0">
        <button
          onClick={() => onVote(post.id, 1)}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition',
            post.my_vote === 1
              ? 'bg-green-50 dark:bg-green-900/20 text-groww-primary'
              : 'text-gray-500 hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-groww-primary'
          )}
        >
          <ArrowUp className="w-3.5 h-3.5" />
          <span>{score}</span>
        </button>

        <button
          onClick={() => onVote(post.id, -1)}
          className={cn(
            'flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition',
            post.my_vote === -1
              ? 'bg-red-50 dark:bg-red-900/20 text-red-500'
              : 'text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500'
          )}
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={toggleExpand}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition ml-1"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          {post.comments_count} {post.comments_count === 1 ? 'comment' : 'comments'}
        </button>
      </div>

      {/* Comments panel */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 pb-4">
          {/* Comment input */}
          <div className="flex gap-2 pt-3 pb-1">
            <MentionTextarea
              value={commentBody}
              onChange={setCommentBody}
              placeholder="Add a comment… type @ to mention"
              rows={2}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-groww-primary resize-none overflow-hidden transition"
              onSubmit={submitComment}
            />
            <button
              onClick={submitComment}
              disabled={posting || !commentBody.trim()}
              className="p-2.5 rounded-xl bg-groww-primary text-white hover:bg-green-600 active:scale-95 transition disabled:opacity-40 self-end"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {/* Comments list */}
          {loadingComments ? (
            <p className="text-xs text-gray-400 py-3">Loading comments…</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-gray-400 py-3 text-center">No comments yet. Be the first!</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
              {comments.map(c => (
                <CommentItem key={c.id} comment={c} onVote={voteComment} />
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ── Skeleton loader ────────────────────────────────────────────────────────
function PostSkeleton() {
  return (
    <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-16 rounded-full bg-gray-100 dark:bg-gray-800 ml-auto" />
      </div>
      <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700 mb-2" />
      <div className="space-y-1.5">
        <div className="h-3 rounded bg-gray-100 dark:bg-gray-800" />
        <div className="h-3 rounded bg-gray-100 dark:bg-gray-800 w-5/6" />
        <div className="h-3 rounded bg-gray-100 dark:bg-gray-800 w-4/6" />
      </div>
      <div className="flex gap-2 mt-4">
        <div className="h-6 w-14 rounded-lg bg-gray-100 dark:bg-gray-800" />
        <div className="h-6 w-20 rounded-lg bg-gray-100 dark:bg-gray-800" />
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function CommunityPage() {
  const user = useAuthStore(s => s.user);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<'hot' | 'new' | 'top'>('hot');
  const [compose, setCompose] = useState(false);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const params: any = { sort };
      if (category !== 'all') params.category = category;
      const res = await axios.get('/api/community/posts', { params });
      setPosts(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPosts(); }, [category, sort]);

  const votePost = async (postId: number, vote: 1 | -1) => {
    try {
      const res = await axios.post(`/api/community/posts/${postId}/vote`, { vote });
      setPosts(ps => ps.map(p => {
        if (p.id !== postId) return p;
        const prev = p.my_vote;
        let up = p.upvotes, dn = p.downvotes;
        if (prev === vote) { vote === 1 ? up-- : dn--; }
        else if (prev !== null) { vote === 1 ? (up++, dn--) : (dn++, up--); }
        else { vote === 1 ? up++ : dn++; }
        return { ...p, upvotes: Math.max(0, up), downvotes: Math.max(0, dn), my_vote: res.data.vote };
      }));
    } catch {}
  };

  const deletePost = async (postId: number) => {
    if (!confirm('Delete this post?')) return;
    await axios.delete(`/api/community/posts/${postId}`);
    setPosts(ps => ps.filter(p => p.id !== postId));
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-groww-dark">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-groww-primary" />
              Community
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Discuss markets, strategies & trades with fellow traders
            </p>
          </div>
          <button
            onClick={() => setCompose(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-groww-primary text-white rounded-xl font-semibold text-sm hover:bg-green-600 active:scale-[0.98] transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Post</span>
            <span className="sm:hidden">Post</span>
          </button>
        </div>

        {/* ── Category pills ── */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-hide -mx-4 px-4">
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition shrink-0',
                category === c.key
                  ? 'bg-groww-primary text-white shadow-sm'
                  : 'bg-white dark:bg-groww-card border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-groww-primary hover:text-groww-primary dark:hover:border-groww-primary dark:hover:text-groww-primary'
              )}
            >
              <span>{c.icon}</span>
              <span>{c.label}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-5">
          {/* ── Main feed ── */}
          <main className="flex-1 min-w-0">
            {/* Sort bar */}
            <div className="flex items-center gap-1.5 mb-4">
              <span className="text-xs text-gray-400 font-medium mr-1">Sort:</span>
              {([
                { key: 'hot' as const, icon: <Flame className="w-3.5 h-3.5" />, label: 'Hot' },
                { key: 'new' as const, icon: <Clock className="w-3.5 h-3.5" />, label: 'New' },
                { key: 'top' as const, icon: <TrendingUp className="w-3.5 h-3.5" />, label: 'Top' },
              ]).map(s => (
                <button
                  key={s.key}
                  onClick={() => setSort(s.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition',
                    sort === s.key
                      ? 'bg-groww-primary text-white shadow-sm'
                      : 'bg-white dark:bg-groww-card border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-groww-primary hover:text-groww-primary'
                  )}
                >
                  {s.icon} {s.label}
                </button>
              ))}
            </div>

            {/* Feed */}
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <PostSkeleton key={i} />)}
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800">
                <div className="text-5xl mb-3">💬</div>
                <p className="text-base font-bold text-gray-800 dark:text-gray-200 mb-1">No posts yet</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  {category === 'all' ? 'Be the first to start a discussion!' : 'No posts in this category yet.'}
                </p>
                <button
                  onClick={() => setCompose(true)}
                  className="px-5 py-2 bg-groww-primary text-white rounded-xl font-semibold text-sm hover:bg-green-600 transition"
                >
                  Create First Post
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {posts.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    userId={user?.id ?? 0}
                    onVote={votePost}
                    onDelete={deletePost}
                  />
                ))}
              </div>
            )}
          </main>

          {/* ── Right sidebar ── */}
          <aside className="hidden xl:flex flex-col gap-4 w-56 shrink-0">
            <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="bg-groww-primary/10 dark:bg-groww-primary/5 px-4 py-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-groww-primary">About Community</h3>
              </div>
              <div className="p-4">
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mb-3">
                  A space for Indian traders to share ideas, strategies, and learnings. Be respectful and add value.
                </p>
                <div className="space-y-2">
                  {[
                    { icon: '📈', text: 'Market Analysis' },
                    { icon: '💡', text: 'Trading Strategies' },
                    { icon: '⚡', text: 'Intraday Setups' },
                    { icon: '🔰', text: 'Beginner Friendly' },
                  ].map(item => (
                    <div key={item.text} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <span>{item.icon}</span>
                      <span>{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="bg-amber-50 dark:bg-amber-900/10 px-4 py-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Community Rules</h3>
              </div>
              <ol className="p-4 space-y-2.5 text-xs text-gray-600 dark:text-gray-400 list-none">
                {[
                  'Be respectful and constructive',
                  'No spam or self-promotion',
                  'Paper trading — not financial advice',
                  'Share P&L with context',
                  'Help beginners learn',
                ].map((rule, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="font-bold text-gray-400 dark:text-gray-500 shrink-0">{i + 1}.</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="bg-green-50 dark:bg-green-900/10 rounded-xl border border-green-100 dark:border-green-900/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">🤖</span>
                <span className="text-xs font-bold text-green-700 dark:text-green-400">PaperBot</span>
              </div>
              <p className="text-xs text-green-700 dark:text-green-400 leading-relaxed">
                Posts daily trading strategies and market insights every morning at 8 AM IST.
              </p>
            </div>
          </aside>
        </div>
      </div>

      {compose && (
        <ComposeModal
          onClose={() => setCompose(false)}
          onCreated={(post) => setPosts(ps => [post, ...ps])}
        />
      )}
    </div>
  );
}
