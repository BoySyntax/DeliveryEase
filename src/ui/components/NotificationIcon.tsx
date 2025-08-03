import { Bell, Check, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { orderNotificationService, OrderNotification } from '../../lib/orderNotificationService';
import { cn } from '../../lib/utils';
import clockLoopGif from '../../assets/Clock_loop.gif';
import successTickGif from '../../assets/Success tick.gif';
import failedStatusGif from '../../assets/Failed Status.gif';
import truckkkGif from '../../assets/truckkk.gif';
import receiveOrderGif from '../../assets/Receive order (1).gif';

interface NotificationIconProps {
  className?: string;
}

export default function NotificationIcon({ className }: NotificationIconProps) {
  const [notifications, setNotifications] = useState<OrderNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadNotifications();
    loadUnreadCount();

    // Subscribe to real-time notifications
    const setupSubscription = async () => {
      const subscription = await orderNotificationService.subscribeToNotifications((newNotification) => {
        setNotifications(prev => [newNotification, ...prev]);
        setUnreadCount(prev => prev + 1);
      });
    };

    setupSubscription();

    return () => {
      orderNotificationService.unsubscribeFromNotifications();
    };
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const data = await orderNotificationService.getNotifications();
      setNotifications(data);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUnreadCount = async () => {
    try {
      const count = await orderNotificationService.getUnreadCount();
      setUnreadCount(count);
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  };

  const handleNotificationClick = async (notification: OrderNotification) => {
    try {
      // Mark as read
      await orderNotificationService.markAsRead(notification.id);
      
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notification.id ? { ...notif, notification_read: true } : notif
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      
      // Navigate to order details using the order ID
      if (notification.data?.orderId) {
        navigate(`/customer/orders/${notification.data.orderId}`);
      }
      
      // Close dropdown
      setIsOpen(false);
    } catch (error) {
      console.error('Error handling notification click:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await orderNotificationService.markAllAsRead();
      setNotifications(prev => prev.map(notif => ({ ...notif, notification_status: 'read' })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const getNotificationIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <div className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden">
          <img src={successTickGif} alt="Verified" className="w-14 h-14 object-contain" />
        </div>;
      case 'delivered':
        return <div className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden">
          <img src={receiveOrderGif} alt="Delivered" className="w-14 h-14 object-contain" />
        </div>;
      case 'rejected':
        return <div className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden">
          <img src={failedStatusGif} alt="Rejected" className="w-14 h-14 object-contain" />
        </div>;
      case 'delivering':
        return <div className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden">
          <img src={truckkkGif} alt="Delivering" className="w-14 h-14 object-contain" />
        </div>;
      case 'placed':
        return <div className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden">
          <img src={clockLoopGif} alt="Pending" className="w-14 h-14 object-contain" />
        </div>;
      default:
        return <div className="w-16 h-16 bg-gray-500 rounded-full flex items-center justify-center text-white text-3xl font-bold">
          ℹ
        </div>;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="relative">
      {/* Notification Icon */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative p-2 text-gray-600 hover:text-primary-600 transition-colors",
          className
        )}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold shadow z-10">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-xs text-primary-600 hover:text-primary-700"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-500">
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No notifications
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                                     className={cn(
                     "p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer",
                     !notification.notification_read && "bg-blue-50"
                   )}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-3">
                                         <div className="mt-1">
                       {getNotificationIcon(notification.notification_status)}
                     </div>
                    <div className="flex-1 min-w-0">
                                             <div className="flex items-start justify-between">
                         <h4 className="text-sm font-medium text-gray-900 truncate">
                           {(() => {
                             console.log('Notification status:', notification.notification_status);
                             console.log('Notification message:', notification.notification_message);
                             
                             switch (notification.notification_status) {
                               case 'verified': return 'Order Verified';
                               case 'rejected': return 'Payment Rejected';
                               case 'delivering': return 'Out for Delivery';
                               case 'delivered': return 'Order Delivered';
                               case 'placed': return 'Order Placed';
                               default: return 'Order Placed';
                             }
                           })()}
                         </h4>
                         {!notification.notification_read && (
                           <div className="w-2 h-2 bg-blue-500 rounded-full ml-2 flex-shrink-0" />
                         )}
                       </div>
                                               <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                          {notification.notification_message}
                        </p>
                        <p className="text-xs text-gray-400 mt-2 flex items-center justify-between">
                          <span>{formatTime(notification.notification_created_at)}</span>
                          <span className="text-xs text-gray-300">
                            {new Date(notification.notification_created_at).toLocaleTimeString([], { 
                              hour: '2-digit', 
                              minute: '2-digit',
                              second: '2-digit'
                            })}
                          </span>
                        </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
} 