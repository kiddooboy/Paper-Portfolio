import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';

export default function SetMpinModal() {
  const setHasMpin = useAuthStore((s) => s.setHasMpin);
  const [mpin, setMpin] = useState('');
  const [showMpin, setShowMpin] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDigitClick = (digit: string) => {
    if (mpin.length < 4) setMpin(prev => prev + digit);
  };
  const handleDelete = () => setMpin(prev => prev.slice(0, -1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key >= '0' && e.key <= '9') setMpin(prev => prev.length < 4 ? prev + e.key : prev);
      else if (e.key === 'Backspace') setMpin(prev => prev.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSubmit = async () => {
    if (mpin.length !== 4) return;
    setLoading(true);
    try {
      await axios.post('/api/auth/set-mpin', { mpin });
      setHasMpin();
      toast.success('MPIN set! You can now use it for quick login.');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to set MPIN');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-groww-card rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-sm mx-4 p-6 space-y-5">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto w-14 h-14 bg-groww-primary/10 rounded-full flex items-center justify-center mb-3">
            <Lock className="w-7 h-7 text-groww-primary" />
          </div>
          <h2 className="text-xl font-bold">Set your MPIN</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Create a 4-digit MPIN for quick login. Required for your account.
          </p>
        </div>

        {/* Show/hide toggle */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowMpin(!showMpin)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-groww-primary"
          >
            {showMpin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showMpin ? 'Hide' : 'Show'}
          </button>
        </div>

        {/* Dot indicators */}
        <div className="flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'w-13 h-13 w-12 h-12 rounded-lg border-2 flex items-center justify-center text-xl font-bold transition-all',
                mpin[i]
                  ? 'border-groww-primary bg-groww-primary/10 text-groww-primary'
                  : 'border-gray-300 dark:border-gray-700'
              )}
            >
              {showMpin ? mpin[i] : mpin[i] ? '●' : ''}
            </div>
          ))}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2">
          {['1','2','3','4','5','6','7','8','9'].map((d) => (
            <button
              key={d}
              onClick={() => handleDigitClick(d)}
              className="py-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-lg font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              {d}
            </button>
          ))}
          <button
            onClick={handleDelete}
            className="py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-100 transition"
          >
            DEL
          </button>
          <button
            onClick={() => handleDigitClick('0')}
            className="py-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-lg font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            0
          </button>
          <button
            onClick={() => setMpin('')}
            className="py-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 font-semibold text-sm hover:bg-gray-100 transition"
          >
            CLR
          </button>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || mpin.length !== 4}
          className="w-full py-2.5 rounded-xl bg-groww-primary text-white font-semibold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? 'Setting MPIN...' : 'Set MPIN'}
        </button>
      </div>
    </div>
  );
}