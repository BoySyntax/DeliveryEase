import { supabase } from './supabase';

export interface EmailNotificationData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  status: 'verified' | 'out_for_delivery';
  estimatedDeliveryDate?: string;
}

class EmailService {
  private async getResendApiKey(): Promise<string> {
    // In a real implementation, this would come from environment variables
    // For now, we'll use a placeholder that should be set in Supabase Edge Functions
    return process.env.RESEND_API_KEY || '';
  }

  private async sendEmailViaResend(emailData: EmailNotificationData): Promise<boolean> {
    try {
      const apiKey = await this.getResendApiKey();
      if (!apiKey) {
        console.error('Resend API key not found');
        return false;
      }

      const subject = emailData.status === 'verified' 
        ? 'Your Order is Verified' 
        : 'Your Order is Out for Delivery';

      const body = emailData.status === 'verified'
        ? `Hi ${emailData.customerName}, your order #${emailData.orderId} has been verified.`
        : `Hi ${emailData.customerName}, your order #${emailData.orderId} is out for delivery and will arrive on ${emailData.estimatedDeliveryDate || 'the estimated delivery date'}.`;

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'noreply@deliveryease.com', // This should be a verified domain
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
        console.error('Failed to send email via Resend:', response.status, errorText);
        return false;
      }

      console.log('Email sent successfully via Resend');
      return true;
    } catch (error) {
      console.error('Error sending email via Resend:', error);
      return false;
    }
  }

  async sendOrderStatusEmail(emailData: EmailNotificationData): Promise<boolean> {
    // Try Resend first
    const resendSuccess = await this.sendEmailViaResend(emailData);
    if (resendSuccess) {
      return true;
    }

    // Fallback: Log the email that would have been sent
    console.log('Email notification would be sent:', {
      to: emailData.customerEmail,
      subject: emailData.status === 'verified' ? 'Your Order is Verified' : 'Your Order is Out for Delivery',
      body: emailData.status === 'verified'
        ? `Hi ${emailData.customerName}, your order #${emailData.orderId} has been verified.`
        : `Hi ${emailData.customerName}, your order #${emailData.orderId} is out for delivery and will arrive on ${emailData.estimatedDeliveryDate || 'the estimated delivery date'}.`
    });

    return false;
  }

  async sendOrderVerifiedEmail(orderId: string, customerName: string, customerEmail: string): Promise<boolean> {
    return this.sendOrderStatusEmail({
      orderId,
      customerName,
      customerEmail,
      status: 'verified'
    });
  }

  async sendOrderOutForDeliveryEmail(
    orderId: string, 
    customerName: string, 
    customerEmail: string, 
    estimatedDeliveryDate?: string
  ): Promise<boolean> {
    return this.sendOrderStatusEmail({
      orderId,
      customerName,
      customerEmail,
      status: 'out_for_delivery',
      estimatedDeliveryDate
    });
  }
}

export const emailService = new EmailService(); 