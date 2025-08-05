// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// @ts-ignore
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept-profile',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Send-order-email function called');
    
    const body = await req.json()
    console.log('Send-order-email received:', body);

    const { orderId, customerName, customerEmail, status, estimatedDeliveryDate } = body;

    if (!orderId || !customerName || !customerEmail || !status) {
      console.log('Missing required fields');
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check if Resend API key exists
    const apiKey = Deno.env.get('RESEND_API_KEY');
    console.log('Resend API key found:', apiKey ? 'Yes' : 'No');

    if (!apiKey) {
      console.log('No Resend API key found');
      return new Response(
        JSON.stringify({ error: 'Resend API key not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.log('Supabase environment variables not found');
      return new Response(
        JSON.stringify({ error: 'Supabase configuration missing' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch order details with items
    console.log('Fetching order details for:', orderId);
    
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select(`
        quantity,
        price,
        products (
          name,
          description
        )
      `)
      .eq('order_id', orderId);

    if (itemsError) {
      console.error('Error fetching order items:', itemsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch order details' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Order items fetched:', orderItems);

    // Calculate total
    const totalAmount = orderItems.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0);

    // Create email content with order items
    const subject = status === 'verified' ? '✅ Order Payment Verified - DeliveryEase' : '🚚 Order Out for Delivery - DeliveryEase';
    
    const itemsHtml = orderItems.map(item => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.products.name}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">₱${item.price.toFixed(2)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">₱${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
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
            background-color: ${status === 'verified' ? '#10b981' : '#3b82f6'};
            color: white;
          }
          .order-info {
            background-color: #f8fafc;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            background-color: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }
          .items-table th {
            background-color: #f1f5f9;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            color: #374151;
            border-bottom: 1px solid #e5e7eb;
          }
          .total-row {
            background-color: #f8fafc;
            font-weight: 600;
          }
          .total-row td {
            padding: 12px;
            border-top: 2px solid #e5e7eb;
          }
          .total-amount {
            font-size: 18px;
            color: #059669;
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
            <div class="status-badge">
              ${status === 'verified' ? 'Payment Verified' : 'Out for Delivery'}
            </div>
            
            <h2 style="margin: 0 0 10px 0; color: #1e293b;">Hi ${customerName}!</h2>
            <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px;">
              ${status === 'verified' 
                ? 'Great news! Your payment has been verified and your order is being prepared for delivery.'
                : `Your order is now out for delivery and will arrive ${estimatedDeliveryDate ? `on ${estimatedDeliveryDate}` : 'soon'}!`
              }
            </p>

            <div class="order-info">
              <h3 style="margin: 0 0 15px 0; color: #1e293b;">Order Details</h3>
              <p style="margin: 0; color: #64748b;">
                <strong>Order ID:</strong> #${orderId.slice(0, 8).toUpperCase()}<br>
                <strong>Order Date:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>

            <h3 style="margin: 30px 0 15px 0; color: #1e293b;">Order Items</h3>
            <table class="items-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th style="text-align: center;">Qty</th>
                  <th style="text-align: right;">Price</th>
                  <th style="text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
                <tr class="total-row">
                  <td colspan="3" style="text-align: right;"><strong>Total Amount:</strong></td>
                  <td class="total-amount" style="text-align: right;"><strong>₱${totalAmount.toFixed(2)}</strong></td>
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

    console.log('Attempting to send email...');

    // Send email via Resend
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

    console.log('Resend response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to send email:', response.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to send email' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Email sent successfully');
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email sent successfully',
        orderId,
        totalAmount: totalAmount.toFixed(2),
        itemCount: orderItems.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in send-order-email function:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error: ' + error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}) 