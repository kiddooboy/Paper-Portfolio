import { useEffect, useState } from 'react';
import axios from 'axios';
import { Bell, Check } from 'lucide-react';
import { cn } from '../lib/utils';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  useEffect(() => { fetch(); }, []);
  const fetch = async () => { try { const r = await axios.get('/api/notifications'); setNotifications(r.data); } catch {} };

  const markRead = async (id: number) => {
    await axios.post(`/api/notifications/${id}/read`);
    fetch();
    // Dispatch event to update header notification count
    window.dispatchEvent(new CustomEvent('notification:read'));
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2"><Bell className="w-5 h-5"/> Notifications</h1>
      <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
        {notifications.length === 0 && <p className="p-4 text-sm text-gray-500 text-center">No notifications</p>}
        {notifications.map((n) => (
          <div key={n.id} className={cn('p-4 flex items-start gap-3', !n.read ? 'bg-green-50/50 dark:bg-green-900/5' : '')}>
            <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', !n.read ? 'bg-groww-primary' : 'bg-gray-300 dark:bg-gray-700')} />
            <div className="flex-1">
              <p className="text-sm font-medium">{n.title}</p>
              <p className="text-xs text-gray-500">{n.message}</p>
              <p className="text-[10px] text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
            </div>
            {!n.read && <button onClick={()=>markRead(n.id)} className="text-gray-400 hover:text-groww-primary"><Check className="w-4 h-4"/></button>}
          </div>
        ))}
      </div>
    </div>
  );
}
