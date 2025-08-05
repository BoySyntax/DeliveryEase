// @ts-ignore - Deno runtime types
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

// @ts-ignore - Deno module import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept-profile, accept',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

interface EmailData {
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

async function sendEmailViaResend(emailData: EmailData): Promise<boolean> {
  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    
    if (!RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY not found in environment variables');
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
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'noreply@fordago.site',
        to: emailData.customerEmail,
        subject: subject,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${subject}</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                line-height: 1.6; 
                color: #1f2937; 
                background-color: #f3f4f6;
              }
              .container { 
                max-width: 600px; 
                margin: 0 auto; 
                background-color: #ffffff;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
              }
              .header { 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white; 
                padding: 32px 24px; 
                text-align: center;
              }
              .header h1 { 
                font-size: 28px; 
                font-weight: 700;
                margin-bottom: 8px;
              }
              .header p { 
                font-size: 16px; 
                opacity: 0.9;
              }
              .content { 
                padding: 32px 24px; 
                background-color: #ffffff;
              }
              .status-badge {
                display: inline-block;
                padding: 8px 16px;
                background-color: #10b981;
                color: white;
                border-radius: 20px;
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 24px;
              }
              .order-details {
                background-color: #f8fafc;
                border-radius: 8px;
                padding: 24px;
                margin: 24px 0;
              }
              .order-id {
                font-size: 18px;
                font-weight: 600;
                color: #1f2937;
                margin-bottom: 16px;
              }
              .items-table {
                width: 100%;
                border-collapse: collapse;
                margin: 16px 0;
              }
              .items-table th,
              .items-table td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #e5e7eb;
              }
              .items-table th {
                background-color: #f1f5f9;
                font-weight: 600;
                color: #374151;
              }
              .total-row {
                background-color: #f8fafc;
                font-weight: 600;
              }
              .total-amount {
                font-size: 20px;
                color: #059669;
              }
              .message {
                font-size: 16px;
                color: #374151;
                margin-bottom: 16px;
              }
              .footer { 
                text-align: center; 
                padding: 24px; 
                color: #6b7280; 
                font-size: 14px;
                background-color: #f9fafb;
                border-top: 1px solid #e5e7eb;
              }
              .footer p {
                margin-bottom: 8px;
              }
              .social-links {
                margin-top: 16px;
              }
              .social-links a {
                color: #6b7280;
                text-decoration: none;
                margin: 0 8px;
              }
              @media (max-width: 600px) {
                .container { margin: 0; border-radius: 0; }
                .header, .content, .footer { padding: 20px; }
                .items-table { font-size: 14px; }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🚚 DeliveryEase</h1>
                <p>Your trusted delivery partner</p>
              </div>
              <div class="content">
                <div class="status-badge">
                  ${emailData.status === 'verified' ? '✅ Order Verified' : '🚚 Out for Delivery'}
                </div>
                
                <div class="message">
                  <p>Hi <strong>${emailData.customerName}</strong>,</p>
                  <p>${emailData.status === 'verified' 
                    ? `Your order has been verified and is being processed. We'll notify you when it's out for delivery.`
                    : `Your order is out for delivery and will arrive on ${emailData.estimatedDeliveryDate || 'the estimated delivery date'}.`
                  }</p>
                </div>

                <div class="order-details">
                  <div class="order-id">Order #${emailData.orderId}</div>
                  
                  ${emailData.orderItems && emailData.orderItems.length > 0 ? `
                    <table class="items-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>Price</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${emailData.orderItems.map(item => `
                          <tr>
                            <td>${item.productName}</td>
                            <td>${item.quantity}</td>
                            <td>₱${item.price.toFixed(2)}</td>
                            <td>₱${(item.quantity * item.price).toFixed(2)}</td>
                          </tr>
                        `).join('')}
                        ${emailData.totalAmount ? `
                          <tr class="total-row">
                            <td colspan="3"><strong>Total Amount:</strong></td>
                            <td class="total-amount"><strong>₱${emailData.totalAmount.toFixed(2)}</strong></td>
                          </tr>
                        ` : ''}
                      </tbody>
                    </table>
                  ` : ''}
                </div>

                <div class="message">
                  <p>Thank you for choosing <strong>DeliveryEase</strong>!</p>
                  <p>If you have any questions, please don't hesitate to contact us.</p>
                </div>
              </div>
              <div class="footer">
                <p>This is an automated message. Please do not reply to this email.</p>
                <p>© 2024 DeliveryEase. All rights reserved.</p>
                <div class="social-links">
                  <a href="#">Website</a> • 
                  <a href="#">Support</a> • 
                  <a href="#">Privacy Policy</a>
                </div>
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

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { orderId, customerName, customerEmail, status, estimatedDeliveryDate, orderItems, totalAmount } = await req.json()

    // Validate required fields
    if (!orderId || !customerName || !customerEmail || !status) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Validate status
    if (status !== 'verified' && status !== 'out_for_delivery') {
      return new Response(
        JSON.stringify({ error: 'Invalid status. Must be "verified" or "out_for_delivery"' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const emailData: EmailData = {
      orderId,
      customerName,
      customerEmail,
      status,
      estimatedDeliveryDate,
      orderItems,
      totalAmount
    };

    console.log('📧 Sending email via Edge Function:', emailData);

    const success = await sendEmailViaResend(emailData);

    if (success) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Email sent successfully',
          orderId,
          customerEmail,
          status
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    } else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to send email' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

  } catch (error) {
    console.error('❌ Error in Edge Function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}) 