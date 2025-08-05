// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// @ts-ignore
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OrderItem {
  quantity: number;
  price: number;
  product: {
    name: string;
    image_url?: string;
  };
}

interface OrderDetails {
  id: string;
  total: number;
  created_at: string;
  items: OrderItem[];
}

interface EmailNotificationData {
  orderId: string;
  status: 'verified' | 'out_for_delivery';
  estimatedDeliveryDate?: string;
}

async function sendEmailViaResend(emailData: EmailNotificationData, orderDetails: OrderDetails, customerEmail: string, customerName: string): Promise<boolean> {
  try {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      console.error('Resend API key not found in environment variables');
      return false;
    }

    const subject = createEmailSubject(emailData.status);
    const htmlContent = createEmailContent(emailData, orderDetails, customerName);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: customerEmail,
        subject: subject,
        html: htmlContent,
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

function createEmailSubject(status: string): string {
  const emoji = status === 'verified' ? '✅' : '🚚';
  const statusText = status === 'verified' ? 'Payment Verified' : 'Out for Delivery';
  return `${emoji} Order ${statusText} - DeliveryEase`;
}

function createEmailContent(emailData: EmailNotificationData, orderDetails: OrderDetails, customerName: string): string {
  const orderDate = new Date(orderDetails.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const itemsHtml = orderDetails.items.map(item => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">
        <div style="display: flex; align-items: center;">
          ${item.product.image_url ? `<img src="${item.product.image_url}" alt="${item.product.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; margin-right: 12px;">` : ''}
          <div>
            <div style="font-weight: 600; color: #333;">${item.product.name}</div>
            <div style="color: #666; font-size: 14px;">Qty: ${item.quantity}</div>
          </div>
        </div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">
        ₱${item.price.toFixed(2)}
      </td>
    </tr>
  `).join('');

  const statusMessage = emailData.status === 'verified' 
    ? `Great news! Your payment has been verified and your order is being prepared for delivery.`
    : `Your order is now out for delivery and will arrive ${emailData.estimatedDeliveryDate ? `on ${emailData.estimatedDeliveryDate}` : 'soon'}!`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${createEmailSubject(emailData.status)}</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          margin: 0; 
          padding: 0; 
          background-color: #f5f5f5;
        }
        .container { 
          max-width: 600px; 
          margin: 0 auto; 
          background-color: white;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header { 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white; 
          padding: 30px 20px; 
          text-align: center; 
        }
        .header h1 { 
          margin: 0; 
          font-size: 28px; 
          font-weight: 700;
        }
        .content { 
          padding: 30px 20px; 
        }
        .status-badge {
          display: inline-block;
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: 600;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 20px;
        }
        .status-verified {
          background-color: #10b981;
          color: white;
        }
        .status-delivery {
          background-color: #3b82f6;
          color: white;
        }
        .order-info {
          background-color: #f8fafc;
          border-radius: 12px;
          padding: 20px;
          margin: 20px 0;
        }
        .order-table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          background-color: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .order-table th {
          background-color: #f1f5f9;
          padding: 16px 12px;
          text-align: left;
          font-weight: 600;
          color: #475569;
          border-bottom: 2px solid #e2e8f0;
        }
        .total-row {
          background-color: #f8fafc;
          font-weight: 700;
          font-size: 18px;
        }
        .footer { 
          text-align: center; 
          padding: 30px 20px; 
          color: #64748b; 
          font-size: 14px;
          background-color: #f8fafc;
          border-top: 1px solid #e2e8f0;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚚 DeliveryEase</h1>
        </div>
        <div class="content">
          <div class="status-badge ${emailData.status === 'verified' ? 'status-verified' : 'status-delivery'}">
            ${emailData.status === 'verified' ? 'Payment Verified' : 'Out for Delivery'}
          </div>
          
          <h2 style="margin: 0 0 10px 0; color: #1e293b;">Hi ${customerName}!</h2>
          <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px;">
            ${statusMessage}
          </p>

          <div class="order-info">
            <h3 style="margin: 0 0 15px 0; color: #1e293b;">Order Details</h3>
            <p style="margin: 0; color: #64748b;">
              <strong>Order ID:</strong> #${orderDetails.id.slice(0, 8).toUpperCase()}<br>
              <strong>Order Date:</strong> ${orderDate}<br>
              <strong>Total Amount:</strong> ₱${orderDetails.total.toFixed(2)}
            </p>
          </div>

          <h3 style="margin: 30px 0 15px 0; color: #1e293b;">Order Items</h3>
          <table class="order-table">
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align: right;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
              <tr class="total-row">
                <td style="padding: 16px 12px; border-top: 2px solid #e2e8f0;">
                  <strong>Total</strong>
                </td>
                <td style="padding: 16px 12px; border-top: 2px solid #e2e8f0; text-align: right;">
                  <strong>₱${orderDetails.total.toFixed(2)}</strong>
                </td>
              </tr>
            </tbody>
          </table>

          <div style="text-align: center; margin: 30px 0;">
            <a href="#" class="cta-button">Track Your Order</a>
          </div>

          <p style="color: #64748b; font-size: 14px; margin: 20px 0 0 0;">
            Thank you for choosing DeliveryEase! We're committed to delivering your order safely and on time.
          </p>
        </div>
        <div class="footer">
          <p>This is an automated message from DeliveryEase. Please do not reply to this email.</p>
          <p>Need help? Contact our support team at support@deliveryease.com</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { orderId, status, estimatedDeliveryDate } = await req.json()

    if (!orderId || !status) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: orderId, status' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (status !== 'verified' && status !== 'out_for_delivery') {
      return new Response(
        JSON.stringify({ error: 'Invalid status. Must be "verified" or "out_for_delivery"' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase environment variables not found');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch order details with items
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        total,
        created_at,
        customer_id,
        items:order_items (
          quantity,
          price,
          product:products (
            name,
            image_url
          )
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !orderData) {
      console.error('Error fetching order:', orderError);
      return new Response(
        JSON.stringify({ error: 'Order not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Fetch customer details using admin API
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(orderData.customer_id);
    
    if (userError || !userData.user) {
      console.error('Error fetching user:', userError);
      return new Response(
        JSON.stringify({ error: 'Customer not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const customerEmail = userData.user.email;
    const customerName = userData.user.user_metadata?.full_name || userData.user.email?.split('@')[0] || 'Customer';

    const emailData: EmailNotificationData = {
      orderId,
      status,
      estimatedDeliveryDate
    };

    const success = await sendEmailViaResend(emailData, orderData, customerEmail, customerName);

    if (success) {
      return new Response(
        JSON.stringify({ message: 'Email sent successfully' }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    } else {
      return new Response(
        JSON.stringify({ error: 'Failed to send email' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
  } catch (error) {
    console.error('Error in send-order-notification function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}) 