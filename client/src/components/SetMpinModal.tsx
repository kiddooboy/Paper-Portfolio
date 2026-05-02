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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') setMpin(prev => prev.length < 4 ? prev + e.key : prev);
      else if (e.key === 'Backspace') setMpin(prev => prev.slice(0, -1));
      else if (e.key === 'Enter') handleSubmit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mpin]);

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
      <div className="bg-white dark:bg-groww-card rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-sm mx-4 p-8 space-y-6">
        <div className="text-center">
          <div className="mx-auto w-14 h-14 bg-groww-primary/10 rounded-full flex items-center justify-center mb-3">
            <Lock className="w-7 h-7 text-groww-primary" />
          </div>
          <h2 className="text-xl font-bold">Set your MPIN</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Create a 4-digit MPIN for quick login. Required for your account.
          </p>
        </div>

        {/* Dot indicators */}
        <div className="flex justify-center gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cn(
              'w-14 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all duration-150',
              mpin[i] ? 'border-groww-primary bg-groww-primary/10 text-groww-primary scale-105' : 'border-gray-300 dark:border-gray-700'
            )}>
              {mpin[i] ? (showMpin ? mpin[i] : '●') : ''}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>Use number keys · Backspace to delete</span>
          <button type="button" onClick={() => setShowMpin(!showMpin)} className="flex items-center gap-1 hover:text-groww-primary transition">
            {showMpin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showMpin ? 'Hide' : 'Show'}
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