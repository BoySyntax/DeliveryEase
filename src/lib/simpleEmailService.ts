// Simple Email Service - Works immediately without edge functions
// This sends emails directly from the frontend using Resend API

export interface EmailData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  status: 'verified' | 'out_for_delivery';
  estimatedDeliveryDate?: string;
}

class SimpleEmailService {
  private readonly RESEND_API_KEY = 're_9mbohhSC_8Qjsdd1R93WNED3NewD11f47'; // Your API key from Supabase

  async sendOrderEmail(emailData: EmailData): Promise<boolean> {
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
          from: 'onboarding@resend.dev', // Use Resend's default sender
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
                .header { background-color: #0a2767; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #f9f9f9; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>fordaGO</h1>
                </div>
                <div class="content">
                  <p>${body}</p>
                  <p>Thank you for choosing fordaGO!</p>
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
  async sendOrderVerifiedEmail(orderId: string, customerName: string, customerEmail: string): Promise<boolean> {
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
    customerName: string, 
    customerEmail: string, 
    estimatedDeliveryDate?: string
  ): Promise<boolean> {
    return this.sendOrderEmail({
      orderId,
      customerName,
      customerEmail,
      status: 'out_for_delivery',
      estimatedDeliveryDate
    });
  }
}

export const simpleEmailService = new SimpleEmailService(); 