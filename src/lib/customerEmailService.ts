// Customer Email Service - Gets emails from Google Auth and sends notifications
import { supabase } from './supabase';

export interface CustomerEmailData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  status: 'verified' | 'out_for_delivery';
  estimatedDeliveryDate?: string;
}

class CustomerEmailService {
  private readonly RESEND_API_KEY = 're_9mbohhSC_8Qjsdd1R93WNED3NewD11f47';

  // Get customer email from auth.users table using RPC function
  async getCustomerEmail(customerId: string): Promise<string | null> {
    try {
      // Use the RPC function to get email from auth.users
      const { data: emailData, error: emailError } = await supabase
        .rpc('get_user_email', { user_id: customerId });

      if (emailError) {
        console.log('❌ Error getting email for customer:', customerId, emailError);
        return null;
      }

      if (!emailData) {
        console.log('❌ No email found for customer:', customerId);
        return null;
      }

      console.log('✅ Found email for customer:', customerId, '->', emailData);
      return emailData;
    } catch (error) {
      console.error('Error getting customer email:', error);
      return null;
    }
  }

  // Send email notification
  async sendOrderEmail(emailData: CustomerEmailData): Promise<boolean> {
    try {
      console.log('📧 Sending email to:', emailData.customerEmail);

      const subject = emailData.status === 'verified' 
        ? 'Your Order is Verified' 
        : 'Your Order is Out for Delivery';

      const body = emailData.status === 'verified'
        ? `Hi ${emailData.customerName}, your order #${emailData.orderId} has been verified.`
        : `Hi ${emailData.customerName}, your order #${emailData.orderId} is out for delivery and will arrive on ${emailData.estimatedDeliveryDate || 'the estimated delivery date'}.`;

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'onboarding@resend.dev',
          to: emailData.customerEmail,
          subject: subject,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>${subject}</title>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #f9f9f9; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>DeliveryEase</h1>
                </div>
                <div class="content">
                  <p>${body}</p>
                  <p>Thank you for choosing DeliveryEase!</p>
                </div>
                <div class="footer">
                  <p>This is an automated message. Please do not reply to this email.</p>
                </div>
              </div>
            </body>
            </html>
          `,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to send email:', response.status, errorText);
        return false;
      }

      const result = await response.json();
      console.log('✅ Email sent successfully! ID:', result.id);
      return true;

    } catch (error) {
      console.error('❌ Error sending email:', error);
      return false;
    }
  }

  // Send order verified email
  async sendOrderVerifiedEmail(orderId: string, customerId: string, customerName: string): Promise<boolean> {
    const customerEmail = await this.getCustomerEmail(customerId);
    
    if (!customerEmail) {
      console.log('❌ No email found for customer:', customerId);
      return false;
    }

    return this.sendOrderEmail({
      orderId,
      customerName,
      customerEmail,
      status: 'verified'
    });
  }

  // Send order out for delivery email
  async sendOrderOutForDeliveryEmail(
    orderId: string, 
    customerId: string,
    customerName: string, 
    estimatedDeliveryDate?: string
  ): Promise<boolean> {
    const customerEmail = await this.getCustomerEmail(customerId);
    
    if (!customerEmail) {
      console.log('❌ No email found for customer:', customerId);
      return false;
    }

    return this.sendOrderEmail({
      orderId,
      customerName,
      customerEmail,
      status: 'out_for_delivery',
      estimatedDeliveryDate
    });
  }
}

export const customerEmailService = new CustomerEmailService(); 