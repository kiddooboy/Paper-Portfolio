import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';

interface Props {
  icon?: ReactNode;
  title: string;
  message?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

/** Friendly empty state for any list/table — title, optional message, optional CTA. */
export default function EmptyState({
  icon, title, message, actionLabel, actionHref, onAction, className,
}: Props) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-10 px-6 ${className ?? ''}`}>
      <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3 text-gray-400 dark:text-gray-500">
        {icon ?? <Inbox className="w-6 h-6" />}
      </div>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</p>
      {message && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs">{message}</p>
      )}
      {actionLabel && actionHref && (
        <Link
          to={actionHref}
          className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-groww-primary hover:underline"
        >
          {actionLabel} →
        </Link>
      )}
      {actionLabel && onAction && !actionHref && (
        <button
          onClick={onAction}
          className="mt-4 text-xs font-semibold text-groww-primary hover:underline"
        >
          {actionLabel} →
        </button>
      )}
    </div>
  );
}
