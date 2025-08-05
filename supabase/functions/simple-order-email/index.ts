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
    console.log('Simple-order-email function called');
    
    const body = await req.json()
    console.log('Simple-order-email received:', body);

    const { orderId, customerName, customerEmail, status } = body;

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

    // Check environment variables
    const apiKey = Deno.env.get('RESEND_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
      console.log('Environment variables missing');
      return new Response(
        JSON.stringify({ error: 'Environment variables not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch order items
    console.log('Fetching order items for:', orderId);
    
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select(`
        quantity,
        price,
        products (
          name
        )
      `)
      .eq('order_id', orderId);

    if (itemsError) {
      console.error('Database query error:', itemsError);
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

    // Create simple email content
    const subject = status === 'verified' ? 'Order Payment Verified - DeliveryEase' : 'Order Out for Delivery - DeliveryEase';
    
    const itemsList = orderItems.map(item => 
      `${item.products.name} - Qty: ${item.quantity} - Price: ₱${item.price.toFixed(2)} - Total: ₱${(item.price * item.quantity).toFixed(2)}`
    ).join('\n');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 20px; 
            background-color: #f5f5f5;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          .header { 
            text-align: center; 
            margin-bottom: 30px;
            color: #2c3e50;
          }
          .order-details {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }
          .items-list {
            margin: 20px 0;
          }
          .item {
            padding: 10px 0;
            border-bottom: 1px solid #eee;
          }
          .total {
            font-size: 18px;
            font-weight: bold;
            color: #27ae60;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 2px solid #eee;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚚 DeliveryEase</h1>
            <h2>${subject}</h2>
          </div>
          
          <p>Hi ${customerName},</p>
          
          <p>${status === 'verified' 
            ? 'Your order payment has been verified and is being prepared for delivery.'
            : 'Your order is now out for delivery.'
          }</p>

          <div class="order-details">
            <h3>Order Details</h3>
            <p><strong>Order ID:</strong> #${orderId.slice(0, 8).toUpperCase()}</p>
            <p><strong>Order Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>

          <div class="items-list">
            <h3>Order Items:</h3>
            ${orderItems.map(item => `
              <div class="item">
                <strong>${item.products.name}</strong><br>
                Quantity: ${item.quantity} | Price: ₱${item.price.toFixed(2)} | Total: ₱${(item.price * item.quantity).toFixed(2)}
              </div>
            `).join('')}
          </div>

          <div class="total">
            Total Amount: ₱${totalAmount.toFixed(2)}
          </div>

          <p>Thank you for choosing DeliveryEase!</p>
        </div>
      </body>
      </html>
    `;

    console.log('Sending email...');

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

    console.log('Email response status:', response.status);

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
    console.error('Error in simple-order-email function:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error: ' + error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}) 