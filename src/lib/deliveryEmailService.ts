// Delivery Email Service - Handles emails for delivery status changes
import { supabase } from './supabase';

export interface DeliveryEmailData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  estimatedDeliveryDate?: string;
  orderItems?: Array<{
    productName: string;
    quantity: number;
    price: number;
  }>;
  totalAmount?: number;
}

class DeliveryEmailService {
  // Send delivery status email via quick-processor
  async sendDeliveryEmail(emailData: DeliveryEmailData): Promise<boolean> {
    try {
      console.log('📧 Sending delivery email via quick-processor to:', emailData.customerEmail);

      const { data, error } = await supabase.functions.invoke('quick-processor', {
        body: {
          orderId: emailData.orderId,
          customerName: emailData.customerName,
          customerEmail: emailData.customerEmail,
          status: 'out_for_delivery',
          estimatedDeliveryDate: emailData.estimatedDeliveryDate,
          orderItems: emailData.orderItems,
          totalAmount: emailData.totalAmount
        }
      });

      if (error) {
        console.error('❌ Delivery email error:', error);
        return false;
      }

      if (data && data.success) {
        console.log('✅ Delivery email sent successfully!');
        return true;
      } else {
        console.error('❌ Delivery email sending failed:', data);
        return false;
      }

    } catch (error) {
      console.error('❌ Error sending delivery email:', error);
      return false;
    }
  }

  // Send delivery email for a specific order
  async sendDeliveryEmailForOrder(orderId: string): Promise<boolean> {
    try {
      console.log('🚀 Sending delivery email for order:', orderId);
      
      // Get order details
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select(`
          id,
          customer_id,
          total,
          items:order_items(
            quantity,
            price,
            product:products(
              name
            )
          )
        `)
        .eq('id', orderId)
        .single();

      if (orderError) {
        console.error('❌ Error fetching order:', orderError);
        return false;
      }

      // Get customer details
      const { data: customerData, error: customerError } = await supabase
        .from('profiles')
        .select('name, email')
        .eq('id', orderData.customer_id)
        .single();

      if (customerError || !customerData?.email) {
        console.error('❌ Error fetching customer or no email:', customerError);
        return false;
      }

      // Prepare order items
      const orderItems = orderData.items?.map(item => ({
        productName: item.product?.name || 'Unknown Product',
        quantity: item.quantity,
        price: item.price
      })) || [];

      // Calculate estimated delivery date (1-3 days from now)
      const estimatedDeliveryDate = new Date();
      estimatedDeliveryDate.setDate(estimatedDeliveryDate.getDate() + 1);
      const formattedDate = estimatedDeliveryDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });

      // Send the email
      return await this.sendDeliveryEmail({
        orderId: orderData.id,
        customerName: customerData.name || 'Customer',
        customerEmail: customerData.email,
        estimatedDeliveryDate: formattedDate,
        orderItems,
        totalAmount: orderData.total
      });

    } catch (error) {
      console.error('❌ Error in sendDeliveryEmailForOrder:', error);
      return false;
    }
  }

  // Send delivery emails for all orders with delivery status
  async sendDeliveryEmailsForAllDeliveryOrders(): Promise<{ success: number; failed: number }> {
    try {
      console.log('🚀 Sending delivery emails for all delivery orders...');
      
      // Get all orders with delivery status
      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          id,
          customer_id,
          total,
          delivery_status
        `)
        .in('delivery_status', ['out_for_delivery', 'delivering']);

      if (error) {
        console.error('❌ Error fetching delivery orders:', error);
        return { success: 0, failed: 0 };
      }

      console.log(`📦 Found ${orders?.length || 0} orders with delivery status`);

      let successCount = 0;
      let failedCount = 0;

      // Send emails for each order
      for (const order of orders || []) {
        const success = await this.sendDeliveryEmailForOrder(order.id);
        if (success) {
          successCount++;
        } else {
          failedCount++;
        }
        
        // Add a small delay between emails to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`✅ Delivery emails sent: ${successCount} success, ${failedCount} failed`);
      return { success: successCount, failed: failedCount };

    } catch (error) {
      console.error('❌ Error in sendDeliveryEmailsForAllDeliveryOrders:', error);
      return { success: 0, failed: 0 };
    }
  }
}

export const deliveryEmailService = new DeliveryEmailService(); 