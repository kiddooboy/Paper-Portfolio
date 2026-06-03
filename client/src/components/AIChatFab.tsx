// Floating AI Chat launcher — fixed bottom-right, sits above the mobile bottom
// nav and any toasts. Clicking it routes to the full /ai-chat page.
//
// Replaces the inline AIChatPanel that used to take up the right rail of the
// Dashboard, freeing that real estate for the new HomeWatchlist.

import { Link, useLocation } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

export default function AIChatFab() {
  const location = useLocation();
  // Hide the FAB on the AI chat page itself (avoids redundant control) and on
  // the fullscreen Terminal page.
  if (location.pathname === '/ai-chat' || location.pathname.startsWith('/terminal')) {
    return null;
  }

  return (
    <Link
      to="/ai-chat"
      aria-label="Ask AI Assistant"
      title="Ask AI Assistant"
      className="
        fixed z-40
        right-4 bottom-20 lg:bottom-6
        flex items-center gap-2
        h-12 px-4
        rounded-full
        bg-gradient-to-br from-emerald-500 to-teal-600
        hover:from-emerald-600 hover:to-teal-700
        text-white font-semibold text-sm
        shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50
        transition-all duration-200
        hover:scale-[1.03] active:scale-[0.98]
        group
      "
      data-tour="ai-fab"
    >
      <Sparkles className="w-4.5 h-4.5 transition-transform group-hover:rotate-12" />
      <span className="hidden sm:inline">Ask AI</span>
      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-white dark:ring-gray-900 animate-pulse" />
    </Link>
  );
}
