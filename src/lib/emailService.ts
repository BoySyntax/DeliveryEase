import { supabase } from './supabase';

export interface OrderNotificationData {
  orderId: string;
  status: string;
  customerEmail: string;
  customerName: string;
  orderTotal: number;
  orderItems?: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  deliveryAddress?: {
    full_name: string;
    street_address: string;
    barangay: string;
    city: string;
    province: string;
  };
}

export class EmailService {
  static async sendOrderNotification(data: OrderNotificationData): Promise<boolean> {
    try {
      const { error } = await supabase.functions.invoke('send-order-notification', {
        body: data
      });

      if (error) {
        console.error('Error sending email notification:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to send email notification:', error);
      return false;
    }
  }

  static async sendOrderStatusUpdate(
    orderId: string, 
    status: string, 
    customerEmail: string, 
    customerName: string, 
    orderTotal: number,
    orderItems?: Array<{ name: string; quantity: number; price: number }>,
    deliveryAddress?: any
  ): Promise<boolean> {
    return this.sendOrderNotification({
      orderId,
      status,
      customerEmail,
      customerName,
      orderTotal,
      orderItems,
      deliveryAddress
    });
  }
} 