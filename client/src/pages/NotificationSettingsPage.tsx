import { useEffect, useState } from 'react';
import axios from 'axios';
import { Bell, Save } from 'lucide-react';
import notify from '../lib/notify';

const ALL_TYPES = [
  { key: 'order',       label: 'Orders',        desc: 'Order fills, failures, queued AMOs, MIS square-off' },
  { key: 'price_alert', label: 'Price Alerts',  desc: 'Price level, % move, and indicator-based alerts' },
  { key: 'system',      label: 'System',        desc: 'Smart holdings alerts (>5% moves), corporate actions' },
  { key: 'ai_insight',  label: 'AI Insights',   desc: 'Daily AI digest of news affecting your holdings' },
];

export default function NotificationSettingsPage() {
  const [enabled, setEnabled] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get('/api/notifications/prefs')
      .then((r) => setEnabled(r.data?.enabled || []))
      .catch(notify.fromError)
      .finally(() => setLoading(false));
  }, []);

  const toggle = (key: string) => {
    setEnabled((s) => s.includes(key) ? s.filter((k) => k !== key) : [...s, key]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await axios.put('/api/notifications/prefs', { enabled });
      notify.success('Preferences saved');
    } catch (err) { notify.fromError(err); }
    finally { setSaving(false); }
  };

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="w-6 h-6 text-groww-primary" />
          Notification Preferences
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Choose which notification types you want delivered to the inbox.
        </p>
      </div>

      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
        {loading ? (
          <div className="p-6 text-center text-gray-400 text-sm">Loading…</div>
        ) : ALL_TYPES.map((t) => (
          <label key={t.key} className="flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40">
            <input
              type="checkbox"
              checked={enabled.includes(t.key)}
              onChange={() => toggle(t.key)}
              className="mt-1 w-4 h-4 accent-groww-primary"
            />
            <div>
              <p className="text-sm font-semibold">{t.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.desc}</p>
            </div>
          </label>
        ))}
      </div>

      <button
        onClick={save}
        disabled={saving || loading}
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-groww-primary text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90"
      >
        <Save className="w-4 h-4" />
        {saving ? 'Saving…' : 'Save preferences'}
      </button>
    </div>
  );
}
