import { useEffect } from 'react';
import { Bell, Check } from 'lucide-react';
import { cn, formatDbDate } from '../lib/utils';
import { useNotificationsStore } from '../store/notificationsStore';

export default function NotificationsPage() {
  const notifications = useNotificationsStore((s) => s.items);
  const fetchNotifications = useNotificationsStore((s) => s.fetch);
  const storeMarkRead = useNotificationsStore((s) => s.markRead);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markRead = async (id: number) => {
    await storeMarkRead(id);
    // Notify any listeners (e.g. header badge) that read state changed
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
              <p className="text-[10px] text-gray-400 mt-1">{formatDbDate(n.created_at)}</p>
            </div>
            {!n.read && <button onClick={()=>markRead(n.id)} className="text-gray-400 hover:text-groww-primary"><Check className="w-4 h-4"/></button>}
          </div>
        ))}
      </div>
    </div>
  );
}
