import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ArrowLeft, Lock, Eye, EyeOff } from 'lucide-react';
import { cn } from '../lib/utils';

export default function SetupMpinPage() {
  const [mpin, setMpin] = useState('');
  const [showMpin, setShowMpin] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
    if (mpin.length !== 4) {
      toast.error('Please enter a 4-digit MPIN');
      return;
    }
    setLoading(true);
    try {
      await axios.post('/api/auth/set-mpin', { mpin });
      toast.success('MPIN set successfully');
      navigate('/');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to set MPIN');
    } finally {
      setLoading(false);
    }
  };

  const skipSetup = () => navigate('/');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-groww-dark flex flex-col">
      <div className="flex items-center gap-3 p-4">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">Set MPIN</h1>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-groww-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-groww-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Create your MPIN</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Set a 4-digit MPIN for quick login on this device.
            </p>
          </div>

          {/* MPIN Input Display */}
          <div className="flex justify-center gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  'w-14 h-14 rounded-lg border-2 flex items-center justify-center text-2xl font-bold transition-all',
                  mpin[i]
                    ? 'border-groww-primary bg-groww-primary/10 text-groww-primary'
                    : 'border-gray-300 dark:border-gray-700'
                )}
              >
                {showMpin ? mpin[i] : mpin[i] ? '●' : ''}
              </div>
            ))}
          </div>

          {/* Show/Hide Toggle */}
          <button
            onClick={() => setShowMpin(!showMpin)}
            className="flex items-center gap-2 mx-auto text-sm text-gray-600 dark:text-gray-400 hover:text-groww-primary"
          >
            {showMpin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showMpin ? 'Hide' : 'Show'} MPIN
          </button>

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                onClick={() => handleDigitClick(digit)}
                className="py-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xl font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                {digit}
              </button>
            ))}
            <button
              onClick={handleDelete}
              className="py-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-semibold hover:bg-red-100 dark:hover:bg-red-900/30 transition"
            >
              DEL
            </button>
            <button
              onClick={() => handleDigitClick('0')}
              className="py-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xl font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              0
            </button>
            <button
              onClick={() => setMpin('')}
              className="py-4 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 font-semibold hover:bg-gray-100 dark:hover:bg-gray-600 transition"
            >
              CLR
            </button>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleSubmit}
              disabled={loading || mpin.length !== 4}
              className="w-full py-3 rounded-xl bg-groww-primary text-white font-semibold hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loading ? 'Setting MPIN...' : 'Set MPIN'}
            </button>
            <button
              onClick={skipSetup}
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
