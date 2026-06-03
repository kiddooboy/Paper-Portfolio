// Tiny two-state pill that flips a user's display preference between USD and ₹.
// Persists immediately via the auth store (which POSTs to /api/auth/preferences).

import { useAuthStore } from '../store/authStore';

export default function CurrencyToggle({ className = '' }: { className?: string }) {
  const current = useAuthStore((s) => s.user?.currency_display || 'INR');
  const setCurrency = useAuthStore((s) => s.setCurrencyDisplay);

  const Btn = ({ ccy, label }: { ccy: 'USD' | 'INR'; label: string }) => {
    const active = current === ccy;
    return (
      <button
        type="button"
        onClick={() => setCurrency(ccy)}
        className={`px-2.5 py-1 text-xs font-bold rounded-md transition ${
          active
            ? 'bg-groww-primary text-white shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
        aria-pressed={active}
      >
        {label}
      </button>
    );
  };

  return (
    <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 ${className}`}>
      <Btn ccy="USD" label="$" />
      <Btn ccy="INR" label="₹" />
    </div>
  );
}
