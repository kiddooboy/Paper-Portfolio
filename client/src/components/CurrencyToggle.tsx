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
        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
          active
            ? 'bg-amber-400 text-slate-950 shadow-sm'
            : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'
        }`}
        aria-pressed={active}
      >
        {label}
      </button>
    );
  };

  return (
    <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-white/5 border border-white/10 ${className}`}>
      <Btn ccy="USD" label="$" />
      <Btn ccy="INR" label="₹" />
    </div>
  );
}
