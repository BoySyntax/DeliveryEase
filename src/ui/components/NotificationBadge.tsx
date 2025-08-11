import { Bell } from 'lucide-react';
import { useState, useEffect } from 'react';
import { orderNotificationService } from '../../lib/orderNotificationService';

interface NotificationBadgeProps {
  size?: number;
  className?: string;
}

export default function NotificationBadge({ size = 20, className }: NotificationBadgeProps) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadUnreadCount();

    // Subscribe to real-time notifications for count updates
    const setupSubscription = async () => {
      const subscription = await orderNotificationService.subscribeToNotifications(() => {
        // When new notification arrives, reload count
        loadUnreadCount();
      });
    };

    setupSubscription();

    // Refresh count every 30 seconds to stay in sync
    const interval = setInterval(loadUnreadCount, 30000);

    return () => {
      orderNotificationService.unsubscribeFromNotifications();
      clearInterval(interval);
    };
  }, []);

  const loadUnreadCount = async () => {
    try {
      const count = await orderNotificationService.getUnreadCount();
      setUnreadCount(count);
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  };

  return (
    <div className="relative">
      <Bell size={size} className={className} />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold shadow z-10">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </div>
  );
}
