import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../lib/utils';

interface Props {
  symbol: string;
  companyName?: string;
  quantity: number;
  price: number;
  orderType: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SellConfirmModal({ symbol, companyName, quantity, price, orderType, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus Cancel by default — safer than Yes, avoids accidental confirm via keyboard
  useEffect(() => {
    // Small delay so any keyup from the triggering click doesn't immediately fire
    const t = setTimeout(() => cancelRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const total = price * quantity;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white dark:bg-groww-card rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-sm mx-4 p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h2 className="font-bold text-base">Confirm Sell Order</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Please review your order before confirming</p>
          </div>
        </div>

        {/* Order details */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 space-y-2.5 text-sm">
          <Row label="Stock" value={symbol} />
          {companyName && <Row label="Company" value={companyName} />}
          <Row label="Action" value="SELL" valueClass="text-red-500 font-bold" />
          <Row label="Order Type" value={orderType} />
          <Row label="Quantity" value={String(quantity)} />
          <Row label="Price" value={formatCurrency(price)} />
          <div className="border-t border-gray-200 dark:border-gray-700 pt-2.5">
            <Row label="Total Value" value={formatCurrency(total)} valueClass="font-bold text-base" />
          </div>
        </div>

        {/* Buttons — Tab cycles: Cancel → Yes → Cancel */}
        <div className="flex gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            No, Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            Yes, Sell
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Row({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}
