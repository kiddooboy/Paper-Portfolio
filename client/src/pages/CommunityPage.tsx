import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { cn } from '../lib/utils';
import {
  ArrowUp, ArrowDown, MessageCircle, Plus, X, ChevronDown,
  Flame, Clock, TrendingUp, Trash2, Send, Users,
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

// ── Constants ──────────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'all',           label: 'All',                icon: '🌐' },
  { key: 'market',        label: 'Market Analysis',    icon: '📈' },
  { key: 'strategies',    label: 'Strategies',         icon: '💡' },
  { key: 'intraday',      label: 'Intraday',           icon: '⚡' },
  { key: 'fundamentals',  label: 'Fundamentals',       icon: '📊' },
  { key: 'beginners',     label: 'Beginners',          icon: '🔰' },
  { key: 'trades',        label: 'Trades & Wins',      icon: '🏆' },
  { key: 'news',          label: 'News & Events',      icon: '📰' },
  { key: 'general',       label: 'General',            icon: '💬' },
];

const CAT_COLORS: Record<string, string> = {
  market:       'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  strategies:   'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  intraday:     'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  fundamentals: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400',
  beginners:    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  trades:       'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  news:         'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  general:      'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

const timeAgo = (iso: string) => {
  const diff = (Date.now() - new Date(iso + 'Z').getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const initials = (name: string) =>
  name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

const avatarColor = (name: string) => {
  const colors = ['#00B386', '#6366F1', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[h];
};

// ── Sub-components ─────────────────────────────────────────────────────────
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

function VoteButtons({
  upvotes, downvotes, myVote, onVote, vertical = false,
}: {
  upvotes: number; downvotes: number; myVote: 1 | -1 | null;
  onVote: (v: 1 | -1) => void; vertical?: boolean;
}) {
  const score = upvotes - downvotes;
  return (
    <div className={cn('flex items-center gap-1', vertical ? 'flex-col' : 'flex-row')}>
      <button
        onClick={() => onVote(1)}
        className={cn(
          'p-1 rounded transition',
          myVote === 1
            ? 'text-groww-primary bg-green-50 dark:bg-green-900/20'
            : 'text-gray-400 hover:text-groww-primary hover:bg-green-50 dark:hover:bg-green-900/20'
        )}
      >
        <ArrowUp className="w-4 h-4" />
      </button>
      <span className={cn(
        'text-xs font-bold min-w-[20px] text-center',
        myVote === 1 ? 'text-groww-primary' : myVote === -1 ? 'text-red-500' : 'text-gray-500'
      )}>
        {score}
      </span>
      <button
        onClick={() => onVote(-1)}
        className={cn(
          'p-1 rounded transition',
          myVote === -1
            ? 'text-red-500 bg-red-50 dark:bg-red-900/20'
            : 'text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
        )}
      >
        <ArrowDown className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Compose Post Modal ─────────────────────────────────────────────────────
function ComposeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Post) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('general');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl bg-white dark:bg-groww-card rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Create Post</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Category */}
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.filter(c => c.key !== 'all').map(c => (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-semibold border transition',
                    category === c.key
                      ? 'bg-groww-primary text-white border-groww-primary'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-groww-primary'
                  )}
                >
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">Title</label>
            <input
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-groww-primary"
              placeholder="What's on your mind?"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Body */}
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">Details</label>
            <textarea
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-groww-primary resize-none"
              placeholder="Share your analysis, strategy, or question..."
              rows={5}
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            onClick={submit}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-groww-primary text-white font-bold text-sm hover:bg-green-600 transition disabled:opacity-50"
          >
            {loading ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Comment Thread ─────────────────────────────────────────────────────────
function CommentItem({
  comment, onVote,
}: {
  comment: Comment;
  onVote: (id: number, v: 1 | -1) => void;
}) {
  return (
    <div className="flex gap-3 py-3">
      <Avatar name={comment.author_name} size={28} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{comment.author_name}</span>
          <span className="text-[10px] text-gray-400">{timeAgo(comment.created_at)}</span>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{comment.body}</p>
        <div className="mt-1.5">
          <VoteButtons
            upvotes={comment.upvotes}
            downvotes={0}
            myVote={comment.my_vote}
            onVote={(v) => onVote(comment.id, v)}
          />
        </div>
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
          ? { ...c, my_vote: res.data.vote, upvotes: c.upvotes + (res.data.vote === 1 ? 1 : res.data.vote === null ? -1 : -1) }
          : c
      ));
    } catch {}
  };

  return (
    <article className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden hover:border-gray-200 dark:hover:border-gray-700 transition">
      {/* Post body */}
      <div className="flex gap-3 p-4">
        {/* Vote column */}
        <VoteButtons
          upvotes={post.upvotes}
          downvotes={post.downvotes}
          myVote={post.my_vote}
          onVote={(v) => onVote(post.id, v)}
          vertical
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Author row */}
          <div className="flex items-center gap-2 mb-2">
            <Avatar name={post.author_name} size={30} />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{post.author_name}</span>
            <span className="text-[10px] text-gray-400">{timeAgo(post.created_at)}</span>
            {cat && (
              <span className={cn('ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold', CAT_COLORS[post.category] || CAT_COLORS.general)}>
                {cat.icon} {cat.label}
              </span>
            )}
            {post.user_id === userId && (
              <button
                onClick={() => onDelete(post.id)}
                className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-300 hover:text-red-500 transition ml-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Title */}
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 leading-snug">{post.title}</h3>

          {/* Body preview / full */}
          <p className={cn(
            'text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap',
            !expanded && 'line-clamp-3'
          )}>
            {post.body}
          </p>
          {post.body.length > 200 && (
            <button
              onClick={toggleExpand}
              className="text-xs text-groww-primary font-semibold mt-1 hover:underline"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}

          {/* Actions bar */}
          <div className="flex items-center gap-4 mt-3">
            <button
              onClick={toggleExpand}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-groww-primary transition font-medium"
            >
              <MessageCircle className="w-4 h-4" />
              {post.comments_count} {post.comments_count === 1 ? 'comment' : 'comments'}
            </button>
          </div>
        </div>
      </div>

      {/* Comments section */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 pb-4">
          {/* Comment input */}
          <div className="flex gap-2 pt-3 pb-2">
            <textarea
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-groww-primary resize-none"
              placeholder="Add a comment…"
              rows={2}
              value={commentBody}
              onChange={e => setCommentBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitComment(); }}
            />
            <button
              onClick={submitComment}
              disabled={posting || !commentBody.trim()}
              className="p-2 rounded-xl bg-groww-primary text-white hover:bg-green-600 transition disabled:opacity-40 self-end"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {/* Comment list */}
          {loadingComments ? (
            <p className="text-xs text-gray-400 py-2">Loading comments…</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">No comments yet. Be the first!</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
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

// ── Main Page ──────────────────────────────────────────────────────────────
export default function CommunityPage() {
  const user = useAuthStore(s => s.user);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<'hot' | 'new' | 'top'>('hot');
  const [compose, setCompose] = useState(false);
  const [showMobileCats, setShowMobileCats] = useState(false);

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

  const activeCat = CATEGORIES.find(c => c.key === category);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-groww-bg">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="w-6 h-6 text-groww-primary" />
              Community
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Discuss markets, strategies & trades with fellow traders</p>
          </div>
          <button
            onClick={() => setCompose(true)}
            className="flex items-center gap-2 px-4 py-2 bg-groww-primary text-white rounded-xl font-semibold text-sm hover:bg-green-600 transition shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Post
          </button>
        </div>

        <div className="flex gap-5">
          {/* ── Left: Category sidebar ── */}
          <aside className="hidden lg:flex flex-col gap-1 w-52 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-3 mb-1">Topics</p>
            {CATEGORIES.map(c => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition text-left w-full',
                  category === c.key
                    ? 'bg-green-50 dark:bg-green-900/20 text-groww-primary'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                )}
              >
                <span className="text-base">{c.icon}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </aside>

          {/* ── Main feed ── */}
          <main className="flex-1 min-w-0">
            {/* Mobile category + sort bar */}
            <div className="flex items-center gap-2 mb-4">
              {/* Mobile category picker */}
              <button
                className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-groww-card"
                onClick={() => setShowMobileCats(v => !v)}
              >
                <span>{activeCat?.icon}</span>
                <span className="max-w-[100px] truncate">{activeCat?.label}</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {/* Sort */}
              <div className="flex gap-1 ml-auto">
                {([
                  { key: 'hot', icon: <Flame className="w-3.5 h-3.5" />, label: 'Hot' },
                  { key: 'new', icon: <Clock className="w-3.5 h-3.5" />, label: 'New' },
                  { key: 'top', icon: <TrendingUp className="w-3.5 h-3.5" />, label: 'Top' },
                ] as const).map(s => (
                  <button
                    key={s.key}
                    onClick={() => setSort(s.key)}
                    className={cn(
                      'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition',
                      sort === s.key
                        ? 'bg-groww-primary text-white'
                        : 'bg-white dark:bg-groww-card border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-groww-primary'
                    )}
                  >
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mobile category dropdown */}
            {showMobileCats && (
              <div className="lg:hidden grid grid-cols-3 gap-1.5 mb-4 p-3 bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800">
                {CATEGORIES.map(c => (
                  <button
                    key={c.key}
                    onClick={() => { setCategory(c.key); setShowMobileCats(false); }}
                    className={cn(
                      'flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg text-xs font-medium transition',
                      category === c.key
                        ? 'bg-green-50 dark:bg-green-900/20 text-groww-primary'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    )}
                  >
                    <span className="text-lg">{c.icon}</span>
                    <span className="truncate w-full text-center">{c.label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Feed */}
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-32 rounded-xl bg-white dark:bg-groww-card border border-gray-100 dark:border-gray-800 animate-pulse" />
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-20 bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800">
                <p className="text-4xl mb-3">💬</p>
                <p className="text-base font-bold text-gray-800 dark:text-gray-200 mb-1">No posts yet</p>
                <p className="text-sm text-gray-500 mb-4">Be the first to start a discussion!</p>
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

          {/* ── Right: Community stats ── */}
          <aside className="hidden xl:flex flex-col gap-4 w-60 shrink-0">
            <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">About Community</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-3">
                A space for Indian traders to share ideas, strategies, and learnings. Be respectful and add value.
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <span className="text-base">📈</span> Market Analysis & Calls
                </div>
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <span className="text-base">💡</span> Trading Strategies
                </div>
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <span className="text-base">🔰</span> Beginner Friendly
                </div>
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <span className="text-base">🏆</span> Share Your Wins
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Community Rules</h3>
              <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-2 list-decimal list-inside">
                <li>Be respectful and constructive</li>
                <li>No spam or self-promotion</li>
                <li>This is paper trading — not financial advice</li>
                <li>Share P&L screenshots with context</li>
                <li>Help beginners learn</li>
              </ol>
            </div>
          </aside>
        </div>
      </div>

      {compose && (
        <ComposeModal
          onClose={() => setCompose(false)}
          onCreated={(post) => { setPosts(ps => [post, ...ps]); }}
        />
      )}
    </div>
  );
}
