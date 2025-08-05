import { supabase } from './supabase';

export interface OrderNotificationData {
  orderId: string;
  status: 'verified' | 'out_for_delivery';
  estimatedDeliveryDate?: string;
}

class EmailNotificationService {
  async sendOrderStatusUpdate(data: OrderNotificationData): Promise<boolean> {
    try {
      console.log('📧 Sending order status update:', data);
      
      const { data: result, error } = await supabase.functions.invoke('send-order-notification', {
        body: data
      });

      if (error) {
        console.error('❌ Error calling Edge Function:', error);
        return false;
      }

      console.log('✅ Email sent successfully via Edge Function');
      return true;
    } catch (error) {
      console.error('❌ Error in sendOrderStatusUpdate:', error);
      return false;
    }
  }

  async sendOrderVerifiedEmail(orderId: string): Promise<boolean> {
    return this.sendOrderStatusUpdate({
      orderId,
      status: 'verified'
    });
  }

  async sendOrderOutForDeliveryEmail(
    orderId: string, 
    estimatedDeliveryDate?: string
  ): Promise<boolean> {
    return this.sendOrderStatusUpdate({
      orderId,
      status: 'out_for_delivery',
      estimatedDeliveryDate
    });
  }
}

export const EmailService = new EmailNotificationService(); 