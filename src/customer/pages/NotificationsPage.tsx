import { useState, useEffect, useRef } from 'react';
import { Bell, Check, Trash2, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { orderNotificationService, OrderNotification } from '../../lib/orderNotificationService';
import { cn } from '../../lib/utils';
import Loader from '../../ui/components/Loader';
import { supabase } from '../../lib/supabase';
import clockLoopGif from '../../assets/Clock_loop.gif';
import successTickGif from '../../assets/Success tick.gif';
import failedStatusGif from '../../assets/Failed Status.gif';
import truckkkGif from '../../assets/truckkk.gif';
import receiveOrderGif from '../../assets/Receive order (1).gif';
import orderCompletedGif from '../../assets/Order completed (1).gif';

type FilterType = 'all' | 'unread' | 'read';

interface SwipeableNotificationProps {
  notification: OrderNotification;
  isSwiped: boolean;
  onSwipe: (isSwiped: boolean) => void;
  onDelete: () => void;
  onMarkAsRead: () => void;
  isDeleting: boolean;
  isMarkingAsRead: boolean;
}

function SwipeableNotification({
  notification,
  isSwiped,
  onSwipe,
  onDelete,
  onMarkAsRead,
  isDeleting,
  isMarkingAsRead
}: SwipeableNotificationProps) {
  const [startX, setStartX] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setCurrentX(e.touches[0].clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const newX = e.touches[0].clientX;
    setCurrentX(newX);
    
    const deltaX = startX - newX;
    if (deltaX > 50) {
      onSwipe(true);
    } else {
      onSwipe(false);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setStartX(e.clientX);
    setCurrentX(e.clientX);
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const newX = e.clientX;
    setCurrentX(newX);
    
    const deltaX = startX - newX;
    if (deltaX > 50) {
      onSwipe(true);
    } else {
      onSwipe(false);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const getNotificationIcon = (title: string) => {
    // Check for different variations of the titles
    const lowerTitle = title.toLowerCase();
    
    if (lowerTitle.includes('verified') || lowerTitle.includes('approved')) {
      return <div className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden">
        <img src={successTickGif} alt="Verified" className="w-16 h-16 object-contain scale-[2]" />
      </div>;
    }
    
    if (lowerTitle.includes('delivered')) {
      return <div className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden">
        <img src={orderCompletedGif} alt="Order Completed" className="w-16 h-16 object-contain" />
      </div>;
    }
    
    if (lowerTitle.includes('rejected')) {
      return <div className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden">
        <img src={failedStatusGif} alt="Rejected" className="w-16 h-16 object-contain" />
      </div>;
    }
    
    if (lowerTitle.includes('delivering') || lowerTitle.includes('out for delivery')) {
      return <div className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden">
        <img src={truckkkGif} alt="Delivering" className="w-16 h-16 object-contain" />
      </div>;
    }
    
    if (lowerTitle.includes('placed') || lowerTitle.includes('pending')) {
      return <div className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden">
        <img src={clockLoopGif} alt="Pending" className="w-16 h-16 object-contain" />
      </div>;
    }
    
    // Default icon for unknown types
    return <div className="w-20 h-20 bg-gray-500 rounded-full flex items-center justify-center text-white text-4xl font-bold">
      ℹ
    </div>;
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
    <div className="relative overflow-hidden">
      {/* Delete Button */}
      <div className={cn(
        "absolute right-0 top-0 h-full bg-red-500 flex items-center justify-center transition-transform duration-300 z-10",
        isSwiped ? "translate-x-0" : "translate-x-full"
      )}>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="px-6 py-4 text-white font-medium disabled:opacity-50"
        >
          {isDeleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>

      {/* Notification Content */}
      <div
        ref={containerRef}
                 className={cn(
           "bg-white rounded-lg shadow-sm border border-gray-200 p-6 transition-all hover:shadow-md cursor-pointer relative z-20",
           !notification.read && "border-l-4 border-l-primary-500 bg-primary-50",
           isSwiped && "transform -translate-x-20"
         )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={onMarkAsRead}
      >
        <div className="flex items-start gap-4">
                           <div className="mt-1">
                   {getNotificationIcon(notification.title)}
                 </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                                 <h3 className="text-lg font-semibold text-gray-900 mb-1">
                   {notification.title}
                 </h3>
                 <p className="text-gray-600 mb-3 leading-relaxed">
                   {notification.message}
                 </p>
                <div className="flex items-center justify-between">
                                     <div className="flex flex-col">
                     <span className="text-sm text-gray-400">
                       {formatTime(notification.created_at)}
                     </span>
                     <span className="text-xs text-gray-300">
                       {new Date(notification.created_at).toLocaleTimeString([], { 
                         hour: '2-digit', 
                         minute: '2-digit',
                         second: '2-digit'
                       })}
                     </span>
                   </div>
                   {!notification.read && (
                     <span className="text-xs font-medium text-primary-600 bg-primary-100 px-2 py-1 rounded-full">
                       Unread
                     </span>
                   )}
                </div>
              </div>
                             {!notification.read && (
                 <button
                   onClick={(e) => {
                     e.stopPropagation();
                     onMarkAsRead();
                   }}
                   disabled={isMarkingAsRead}
                   className="ml-4 p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50"
                   title="Mark as read"
                 >
                   <Check size={16} />
                 </button>
               )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<OrderNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [markingAsRead, setMarkingAsRead] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [swipedNotification, setSwipedNotification] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadNotifications();

    // Subscribe to real-time notifications
    const setupSubscription = async () => {
      const subscription = await orderNotificationService.subscribeToNotifications((newNotification) => {
        setNotifications(prev => [newNotification, ...prev]);
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

  const handleNotificationClick = async (notification: OrderNotification) => {
    setMarkingAsRead(notification.id);
    try {
      // Mark as read
      await orderNotificationService.markAsRead(notification.id);
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notification.id ? { ...notif, read: true } : notif
        )
      );
      
      // Navigate to order details if there's an orderId in the data
      if (notification.data?.orderId) {
        navigate(`/customer/orders/${notification.data.orderId}`);
      }
    } catch (error) {
      console.error('Error handling notification click:', error);
    } finally {
      setMarkingAsRead(null);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await orderNotificationService.markAllAsRead();
      setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const handleDeleteNotification = async (notificationId: string) => {
    setDeleting(notificationId);
    try {
      // Use the notification service to delete
      const success = await orderNotificationService.deleteNotification(notificationId);
      
      if (success) {
        // Remove from local state
        setNotifications(prev => prev.filter(notif => notif.id !== notificationId));
        setSwipedNotification(null);
      } else {
        console.error('Failed to delete notification');
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    } finally {
      setDeleting(null);
    }
  };

  const filteredNotifications = notifications.filter(notification => {
    if (filter === 'unread') return !notification.read;
    if (filter === 'read') return notification.read;
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return <Loader fullScreen />;
  }

  return (
    <div className="max-w-4xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unreadCount > 0 && (
            <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
              {unreadCount} unread
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
          >
            <Check size={16} />
            Mark all as read
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filter:</span>
        </div>
        <div className="flex gap-2">
          {(['all', 'unread', 'read'] as FilterType[]).map((filterType) => (
            <button
              key={filterType}
              onClick={() => setFilter(filterType)}
              className={cn(
                "px-3 py-1 text-sm font-medium rounded-md transition-colors",
                filter === filterType
                  ? "bg-primary-100 text-primary-700"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              )}
            >
              {filterType.charAt(0).toUpperCase() + filterType.slice(1)}
              {filterType === 'unread' && unreadCount > 0 && (
                <span className="ml-1 text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-4">
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {filter === 'all' ? 'No notifications yet' : `No ${filter} notifications`}
            </h3>
            <p className="text-gray-500">
              {filter === 'all' 
                ? 'You\'ll see notifications about your orders and deliveries here.'
                : `You don't have any ${filter} notifications.`
              }
            </p>
          </div>
        ) : (
                     filteredNotifications.map((notification) => (
             <SwipeableNotification
               key={notification.id}
               notification={notification}
               isSwiped={swipedNotification === notification.id}
               onSwipe={(isSwiped) => setSwipedNotification(isSwiped ? notification.id : null)}
               onDelete={() => handleDeleteNotification(notification.id)}
               onMarkAsRead={() => handleNotificationClick(notification)}
               isDeleting={deleting === notification.id}
               isMarkingAsRead={markingAsRead === notification.id}
             />
                       ))
        )}
      </div>
    </div>
  );
} 