import { supabase } from './supabase';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  data: any;
  created_at: string;
}

export interface CreateNotificationData {
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  data?: any;
}

class NotificationService {
  // Get all notifications for the current user
  async getNotifications(): Promise<Notification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching notifications:', error);
      return [];
    }

    return data || [];
  }

  // Get unread notifications count
  async getUnreadCount(): Promise<number> {
    const { data, error } = await supabase
      .rpc('get_unread_notification_count');

    if (error) {
      console.error('Error fetching unread count:', error);
      return 0;
    }

    return data || 0;
  }

  // Mark a notification as read
  async markAsRead(notificationId: string): Promise<boolean> {
    const { data, error } = await supabase
      .rpc('mark_notification_read', { p_notification_id: notificationId });

    if (error) {
      console.error('Error marking notification as read:', error);
      return false;
    }

    return data || false;
  }

  // Mark all notifications as read
  async markAllAsRead(): Promise<number> {
    const { data, error } = await supabase
      .rpc('mark_all_notifications_read');

    if (error) {
      console.error('Error marking all notifications as read:', error);
      return 0;
    }

    return data || 0;
  }

  // Create a notification for the current user
  async createNotification(notificationData: CreateNotificationData): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user found');
      return null;
    }

    const { data, error } = await supabase
      .rpc('create_notification', {
        p_user_id: user.id,
        p_title: notificationData.title,
        p_message: notificationData.message,
        p_type: notificationData.type || 'info',
        p_data: notificationData.data || {}
      });

    if (error) {
      console.error('Error creating notification:', error);
      return null;
    }

    return data;
  }

  // Create a notification for a specific user (for admin operations)
  async createNotificationForUser(userId: string, notificationData: CreateNotificationData): Promise<string | null> {
    console.log('createNotificationForUser called with:', { userId, notificationData });
    
    // Try direct insert first (simpler approach)
    const { data, error } = await supabase
      .from('notifications')
      .insert([{
        user_id: userId,
        title: notificationData.title,
        message: notificationData.message,
        type: notificationData.type || 'info',
        data: notificationData.data || {},
        read: false
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating notification for user (direct insert):', error);
      
      // Fallback to RPC if direct insert fails
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('create_notification', {
          p_user_id: userId,
          p_title: notificationData.title,
          p_message: notificationData.message,
          p_type: notificationData.type || 'info',
          p_data: notificationData.data || {}
        });

      if (rpcError) {
        console.error('Error creating notification for user (RPC):', rpcError);
        return null;
      }

      console.log('Notification created successfully via RPC:', rpcData);
      return rpcData;
    }

    console.log('Notification created successfully via direct insert:', data);
    return data.id;
  }

  // Create order status notification
  async createOrderStatusNotification(
    orderId: string,
    status: string,
    orderTotal: number,
    customerName: string
  ): Promise<string | null> {
    const title = `Order Status Update`;
    const message = `Your order #${orderId.slice(0, 8)} has been ${status}. Total: ₱${orderTotal.toFixed(2)}`;
    
    return this.createNotification({
      title,
      message,
      type: 'info',
      data: {
        orderId,
        status,
        orderTotal,
        customerName
      }
    });
  }

  // Create delivery notification
  async createDeliveryNotification(
    orderId: string,
    status: string,
    driverName?: string
  ): Promise<string | null> {
    const title = `Delivery Update`;
    let message = `Your order #${orderId.slice(0, 8)} is now ${status}`;
    
    if (driverName && status === 'assigned') {
      message += `. Driver: ${driverName}`;
    }

    return this.createNotification({
      title,
      message,
      type: 'success',
      data: {
        orderId,
        status,
        driverName
      }
    });
  }

  // Subscribe to real-time notifications
  subscribeToNotifications(callback: (notification: Notification) => void) {
    return supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications'
        },
        (payload) => {
          // Check if the notification is for the current user
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (user && payload.new.user_id === user.id) {
              callback(payload.new as Notification);
            }
          });
        }
      )
      .subscribe();
  }

  // Unsubscribe from notifications
  unsubscribeFromNotifications() {
    supabase.removeAllChannels();
  }
}

export const notificationService = new NotificationService(); 