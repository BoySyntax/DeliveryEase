import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import Loader from '../../ui/components/Loader';
import { useNavigate } from 'react-router-dom';
import { Package, Truck, CheckCircle, XCircle, Clock, User, AlertCircle } from 'lucide-react';

// Types
interface OrderNotification {
  id: string;
  created_at: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  delivery_status: 'pending' | 'assigned' | 'delivering' | 'delivered';
  batch_id: string | null;
  total: number;
  notification_read: boolean;
  status_changed_at?: string;
}

interface NotificationDisplay {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  icon: React.ReactNode;
  color: string;
  urgency: 'high' | 'medium' | 'low';
}

export default function NotificationsPage() {
  const [orders, setOrders] = useState<OrderNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadNotifications();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadNotifications() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          approval_status,
          delivery_status,
          batch_id,
          total,
          notification_read
        `)
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      
      setOrders(data || []);
      
      // Reset notification_read to false for orders with recent status changes
      // This ensures users get notified of status changes
      if (data && data.length > 0) {
        const ordersWithRecentChanges = data.filter(order => hasRecentStatusChange(order));
        
        if (ordersWithRecentChanges.length > 0) {
          const orderIdsToReset = ordersWithRecentChanges.map(order => order.id);
          await supabase
            .from('orders')
            .update({ notification_read: false })
            .in('id', orderIdsToReset);
        }
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  }

  // Convert order data to display notifications
  function createNotificationDisplay(order: OrderNotification): NotificationDisplay | null {
    const orderId = order.id.slice(0, 8);
    const now = new Date();
    const orderCreatedAt = new Date(order.created_at);
    const timeDiff = now.getTime() - orderCreatedAt.getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);

    // Only show notifications for recent status changes (within last 24 hours)
    if (hoursDiff > 24) {
      return null;
    }

    // Show notification for pending orders (only if recently created)
    if (order.approval_status === 'pending' && hoursDiff < 1) {
      return {
        id: order.id,
        title: 'Order Pending',
        message: `Order #${orderId} is pending approval. Please wait while we verify your payment.`,
        timestamp: order.created_at,
        icon: <Clock className="w-5 h-5" />,
        color: 'text-yellow-600 bg-yellow-50 border-yellow-200',
        urgency: 'medium'
      };
    }

    // Show notification for rejected orders
    if (order.approval_status === 'rejected') {
      return {
        id: order.id,
        title: 'Order Rejected',
        message: `Order #${orderId} has been rejected. Please check your payment proof or contact support.`,
        timestamp: order.created_at,
        icon: <XCircle className="w-5 h-5" />,
        color: 'text-red-600 bg-red-50 border-red-200',
        urgency: 'high'
      };
    }

    // Show notification for verified orders (approved) - only if recently approved
    if (order.approval_status === 'approved' && hoursDiff < 6) {
      return {
        id: order.id,
        title: 'Payment Verified',
        message: `Order #${orderId} payment has been verified. Your order is preparing for delivery.`,
        timestamp: order.created_at,
        icon: <CheckCircle className="w-5 h-5" />,
        color: 'text-green-600 bg-green-50 border-green-200',
        urgency: 'medium'
      };
    }

    // Show notification for delivery statuses (only if recent)
    if (order.delivery_status === 'assigned' && hoursDiff < 12) {
      return {
        id: order.id,
        title: 'Driver Assigned',
        message: `Order #${orderId} has been assigned to a driver and will be out for delivery soon.`,
        timestamp: order.created_at,
        icon: <User className="w-5 h-5" />,
        color: 'text-purple-600 bg-purple-50 border-purple-200',
        urgency: 'medium'
      };
    }

    if (order.delivery_status === 'delivering' && hoursDiff < 12) {
      return {
        id: order.id,
        title: 'Out for Delivery',
        message: `Order #${orderId} is now out for delivery. Your order will arrive soon!`,
        timestamp: order.created_at,
        icon: <Truck className="w-5 h-5" />,
        color: 'text-blue-600 bg-blue-50 border-blue-200',
        urgency: 'high'
      };
    }

    if (order.delivery_status === 'delivered' && hoursDiff < 6) {
      return {
        id: order.id,
        title: 'Order Delivered',
        message: `Order #${orderId} has been successfully delivered! Thank you for choosing DeliveryEase.`,
        timestamp: order.created_at,
        icon: <CheckCircle className="w-5 h-5" />,
        color: 'text-green-600 bg-green-50 border-green-200',
        urgency: 'medium'
      };
    }

    // Return null for any other cases
    return null;
  }

  // Function to check if order has recent status changes
  function hasRecentStatusChange(order: OrderNotification): boolean {
    const now = new Date();
    const orderCreatedAt = new Date(order.created_at);
    const timeDiff = now.getTime() - orderCreatedAt.getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    // Consider it recent if within 24 hours
    return hoursDiff <= 24;
  }

  // Handle notification click
  const handleNotificationClick = async (id: string) => {
    // Mark this specific notification as read
    await supabase
      .from('orders')
      .update({ notification_read: true })
      .eq('id', id);
    
    navigate(`/customer/orders/${id}`);
  };

  // Function to mark all notifications as read
  const markAllAsRead = async () => {
    if (orders.length > 0) {
      const unreadOrderIds = orders
        .filter(order => !order.notification_read)
        .map(order => order.id);
      
      if (unreadOrderIds.length > 0) {
        await supabase
          .from('orders')
          .update({ notification_read: true })
          .in('id', unreadOrderIds);
        
        // Reload notifications to update the UI
        await loadNotifications();
      }
    }
  };

  if (loading) return <Loader label="Loading notifications..." />;

  const displayNotifications = orders.map(createNotificationDisplay).filter(n => n !== null);
  const urgentCount = displayNotifications.filter(n => n.urgency === 'high').length;

  return (
    <div className="max-w-3xl mx-auto p-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <p className="text-gray-600 mt-1">
              Stay updated on your delivery progress
              {urgentCount > 0 && (
                <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                  {urgentCount} urgent
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={markAllAsRead}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Mark all as read
            </button>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      {displayNotifications.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No notifications</h3>
          <p className="text-gray-600">You haven't placed any orders yet. Start shopping to see updates here!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayNotifications.map((notification) => {
            const order = orders.find(o => o.id === notification.id);
            const isUnread = order && !order.notification_read;
            
            return (
              <div key={notification.id} className="group relative">
                <div className={`bg-white rounded-lg shadow-sm border-l-4 p-4 transition-all duration-200 hover:shadow-md cursor-pointer ${notification.color} ${isUnread ? 'border-l-4 border-l-blue-500' : ''}`}>
                  {/* Content */}
                  <div 
                    className="flex items-start gap-3"
                    onClick={() => handleNotificationClick(notification.id)}
                  >
                    <div className={`p-2 rounded-full ${notification.color.replace('text-', 'bg-').replace('bg-', 'bg-').replace('-600', '-100')}`}>
                      {notification.icon}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-gray-900">
                          {notification.title}
                        </h3>
                        {notification.urgency === 'high' && (
                          <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                        )}
                        {isUnread && (
                          <span className="inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
                        )}
                      </div>
                      
                      <p className="text-sm text-gray-700 mb-2">
                        {notification.message}
                      </p>
                      
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{new Date(notification.timestamp).toLocaleString()}</span>
                        {isUnread && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                            New
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
} 