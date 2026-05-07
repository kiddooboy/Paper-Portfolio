import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ArrowLeft, Lock, Eye, EyeOff } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';

export default function SetupMpinPage() {
  const [mpin, setMpin] = useState('');
  const [showMpin, setShowMpin] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setHasMpin = useAuthStore((s) => s.setHasMpin);

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
    if (mpin.length !== 4) {
      toast.error('Please enter a 4-digit MPIN');
      return;
    }
    setLoading(true);
    try {
      await axios.post('/api/auth/set-mpin', { mpin });
      setHasMpin();
      toast.success('MPIN set successfully');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to set MPIN');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-groww-dark flex flex-col">
      <div className="flex items-center gap-3 p-4">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">Set MPIN</h1>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-groww-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-groww-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Create your MPIN</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Set a 4-digit MPIN for quick login on this device.
            </p>
          </div>

          {/* Dot indicators */}
          <div className="flex justify-center gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={cn(
                'w-12 h-12 sm:w-16 sm:h-16 rounded-xl border-2 flex items-center justify-center text-xl sm:text-2xl font-bold transition-all duration-150',
                mpin[i] ? 'border-groww-primary bg-groww-primary/10 text-groww-primary scale-105' : 'border-gray-300 dark:border-gray-700'
              )}>
                {mpin[i] ? (showMpin ? mpin[i] : 'â—') : ''}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Use number keys Â· Backspace to delete</span>
            <button type="button" onClick={() => setShowMpin(!showMpin)} className="flex items-center gap-1 hover:text-groww-primary transition">
              {showMpin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showMpin ? 'Hide' : 'Show'}
            </button>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleSubmit}
              disabled={loading || mpin.length !== 4}
              className="w-full py-3 rounded-xl bg-groww-primary text-white font-semibold hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loading ? 'Setting MPIN...' : 'Set MPIN'}
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full py-3 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              Skip for Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
