// Direct Email Service - Uses Supabase Edge Function to avoid CORS issues
// This sends emails through our Edge Function which handles the Resend API call

import { supabase } from './supabase';

export interface DirectEmailData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  status: 'verified' | 'out_for_delivery';
  estimatedDeliveryDate?: string;
  orderItems?: Array<{
    productName: string;
    quantity: number;
    price: number;
  }>;
  totalAmount?: number;
}

class DirectEmailService {
  // Send email notification via Supabase Edge Function
  async sendOrderEmail(emailData: DirectEmailData): Promise<boolean> {
    try {
      console.log('📧 Sending email via minimal-email Edge Function to:', emailData.customerEmail);

      // Call our minimal-email Edge Function
      const { data, error } = await supabase.functions.invoke('minimal-email', {
        body: {
          orderId: emailData.orderId,
          customerName: emailData.customerName,
          customerEmail: emailData.customerEmail,
          status: emailData.status,
          estimatedDeliveryDate: emailData.estimatedDeliveryDate,
          orderItems: emailData.orderItems,
          totalAmount: emailData.totalAmount
        }
      });

      if (error) {
        console.error('❌ Edge Function error:', error);
        return false;
      }

      if (data && data.success) {
        console.log('✅ Email sent successfully via minimal-email Edge Function!');
        return true;
      } else {
        console.error('❌ Email sending failed via minimal-email Edge Function:', data);
        return false;
      }

    } catch (error) {
      console.error('❌ Error sending email via minimal-email Edge Function:', error);
      return false;
    }
  }

  // Send order verified email
  async sendOrderVerifiedEmail(
    orderId: string, 
    customerEmail: string, 
    customerName: string,
    orderItems?: Array<{productName: string; quantity: number; price: number}>,
    totalAmount?: number
  ): Promise<boolean> {
    console.log('🚀 Sending verification email via minimal-email Edge Function...');
    
    return this.sendOrderEmail({
      orderId,
      customerName,
      customerEmail,
      status: 'verified',
      orderItems,
      totalAmount
    });
  }

  // Send order out for delivery email
  async sendOrderOutForDeliveryEmail(
    orderId: string, 
    customerEmail: string,
    customerName: string, 
    estimatedDeliveryDate?: string,
    orderItems?: Array<{productName: string; quantity: number; price: number}>,
    totalAmount?: number
  ): Promise<boolean> {
    console.log('🚀 Sending delivery email via minimal-email Edge Function...');
    
    return this.sendOrderEmail({
      orderId,
      customerName,
      customerEmail,
      status: 'out_for_delivery',
      estimatedDeliveryDate,
      orderItems,
      totalAmount
    });
  }
}

export const directEmailService = new DirectEmailService(); 