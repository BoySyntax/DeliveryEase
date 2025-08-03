import { supabase } from './supabase';

export interface OrderNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  data: any;
  created_at: string;
}

export interface CreateOrderNotificationData {
  orderId: string;
  title: string; // Changed from status to title
  message: string;
}

class OrderNotificationService {
  // Get all notifications for the current user
  async getNotifications(): Promise<OrderNotification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select(`
        id,
        user_id,
        title,
        message,
        type,
        read,
        data,
        created_at
      `)
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching notifications:', error);
      return [];
    }

    console.log('Fetched notifications:', data);
    if (data && data.length > 0) {
      console.log('First notification details:', {
        id: data[0].id,
        title: data[0].title,
        message: data[0].message,
        type: data[0].type,
        data: data[0].data,
        created_at: data[0].created_at
      });
    } else {
      console.log('No notifications found in database');
    }
    return data || [];
  }

  // Get unread notifications count
  async getUnreadCount(): Promise<number> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;

      const { data, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('read', false);

      if (error) {
        console.error('Error fetching unread count (direct query):', error);
        
        // Fallback to RPC
        const { data: rpcData, error: rpcError } = await supabase
          .rpc('get_unread_notification_count');

        if (rpcError) {
          console.error('Error fetching unread count (RPC fallback):', rpcError);
          return 0;
        }

        return rpcData || 0;
      }

      return data?.length || 0;
    } catch (error) {
      console.error('Error fetching unread count:', error);
      return 0;
    }
  }

  // Mark a single notification as read
  async markAsRead(notificationId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .select();

      if (error) {
        console.error('Error marking notification as read:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return false;
    }
  }

  // Mark all notifications as read
  async markAllAsRead(): Promise<number> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;

      const { data, error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false)
        .select();

      if (error) {
        console.error('Error marking notifications as read (direct query):', error);
        
        // Fallback to RPC
        const { data: rpcData, error: rpcError } = await supabase
          .rpc('mark_all_notifications_read');

        if (rpcError) {
          console.error('Error marking notifications as read (RPC fallback):', rpcError);
          return 0;
        }

        return rpcData || 0;
      }

      return data?.length || 0;
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      return 0;
    }
  }

  // Delete a notification by removing it from the database
  async deleteNotification(notificationId: string): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      console.log('Attempting to delete notification:', notificationId, 'for user:', user.id);

      const { data, error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .eq('user_id', user.id)
        .select();

      if (error) {
        console.error('Error deleting notification:', error);
        return false;
      }

      console.log('Successfully deleted notification:', data);
      return true;
    } catch (error) {
      console.error('Error deleting notification:', error);
      return false;
    }
  }

  // Create a notification for an order
  async createNotification(notificationData: CreateOrderNotificationData): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      // Use the create_notification function
      const { data, error } = await supabase
        .rpc('create_notification', {
          p_user_id: user.id,
          p_title: notificationData.title,
          p_message: notificationData.message,
          p_type: 'info',
          p_data: { orderId: notificationData.orderId }
        });

      if (error) {
        console.error('Error creating notification:', error);
        return false;
      }

      console.log('Notification created successfully:', data);
      return true;
    } catch (error) {
      console.error('Error creating notification:', error);
      return false;
    }
  }

  // Subscribe to real-time notifications
  async subscribeToNotifications(callback: (notification: OrderNotification) => void) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    return supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          callback(payload.new as OrderNotification);
        }
      )
      .subscribe();
  }

  // Unsubscribe from notifications
  unsubscribeFromNotifications() {
    supabase.removeAllChannels();
  }
}

export const orderNotificationService = new OrderNotificationService(); 