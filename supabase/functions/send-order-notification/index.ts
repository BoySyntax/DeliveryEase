// @ts-ignore - Deno imports
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore - Deno imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// @ts-ignore - Deno global
declare const Deno: any

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { orderId, status, customerEmail: inputCustomerEmail, customerName, orderTotal, orderItems, deliveryAddress } = await req.json()

    // Validate required fields
    if (!orderId || !status || !inputCustomerEmail) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: orderId, status, customerEmail' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get order details and customer email
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        created_at,
        total,
        customer_id,
        delivery_address,
        items:order_items(
          quantity,
          price,
          product:products(name)
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: 'Order not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get customer email from auth.users using admin API
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(order.customer_id)
    
    if (userError || !userData.user?.email) {
      console.error('Error fetching customer email:', userError)
      return new Response(
        JSON.stringify({ error: 'Customer email not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const actualCustomerEmail = userData.user.email

    // Create email content
    const emailContent = createEmailContent({
      orderId,
      status,
      customerName,
      orderTotal,
      orderItems: orderItems || order.items?.map((item: any) => ({
        name: item.product.name,
        quantity: item.quantity,
        price: item.price
      })),
      deliveryAddress: deliveryAddress || order.delivery_address,
      orderDate: order.created_at
    })

    const emailSubject = createEmailSubject(status, orderId)

    // Send email using Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'Resend API key not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'DeliveryEase <onboarding@resend.dev>',
        to: actualCustomerEmail,
        subject: emailSubject,
        html: emailContent,
      }),
    })

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json()
      console.error('Resend API error:', errorData)
      return new Response(
        JSON.stringify({ error: 'Failed to send email via Resend' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent successfully' }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

function createEmailSubject(status: string, orderId: string): string {
  const shortOrderId = orderId.slice(0, 8)
  
  switch (status) {
    case 'pending':
      return `Order #${shortOrderId} - Pending Verification`
    case 'approved':
      return `Order #${shortOrderId} - Payment Verified! 🎉`
    case 'rejected':
      return `Order #${shortOrderId} - Payment Verification Failed`
    case 'assigned':
      return `Order #${shortOrderId} - Driver Assigned 🚚`
    case 'delivering':
      return `Order #${shortOrderId} - Out for Delivery! 📦`
    case 'delivered':
      return `Order #${shortOrderId} - Delivered Successfully! ✅`
    default:
      return `Order #${shortOrderId} - Status Update`
  }
}

function createEmailContent(data: {
  orderId: string;
  status: string;
  customerName: string;
  orderTotal: number;
  orderItems?: Array<{ name: string; quantity: number; price: number }>;
  deliveryAddress?: any;
  orderDate?: string;
}): string {
  const shortOrderId = data.orderId.slice(0, 8)
  const orderDate = data.orderDate ? new Date(data.orderDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) : 'N/A'
  
  const orderTotal = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP'
  }).format(data.orderTotal)

  const itemsList = data.orderItems?.map(item => 
    `<li>${item.name} - ${item.quantity}x ${new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(item.price)}</li>`
  ).join('') || ''

  const deliveryAddress = data.deliveryAddress ? `
    <p><strong>Delivery Address:</strong></p>
    <p>${data.deliveryAddress.full_name}<br>
    ${data.deliveryAddress.street_address}<br>
    ${data.deliveryAddress.barangay}, ${data.deliveryAddress.city}<br>
    ${data.deliveryAddress.province}</p>
  ` : ''

  let statusMessage = ''
  let statusColor = '#6B7280'
  let statusIcon = '📋'

  switch (data.status) {
    case 'pending':
      statusMessage = 'Your order is pending verification. We are reviewing your payment proof and will update you soon.'
      statusColor = '#F59E0B'
      statusIcon = '⏳'
      break
    case 'approved':
      statusMessage = 'Great news! Your payment has been verified and your order is being processed for delivery.'
      statusColor = '#10B981'
      statusIcon = '✅'
      break
    case 'rejected':
      statusMessage = 'We were unable to verify your payment. Please check your payment proof and try again, or contact our support team.'
      statusColor = '#EF4444'
      statusIcon = '❌'
      break
    case 'assigned':
      statusMessage = 'Your order has been assigned to a driver and will be out for delivery soon!'
      statusColor = '#3B82F6'
      statusIcon = '🚚'
      break
    case 'delivering':
      statusMessage = 'Your order is now out for delivery! You can track its progress in your account.'
      statusColor = '#8B5CF6'
      statusIcon = '📦'
      break
    case 'delivered':
      statusMessage = 'Your order has been successfully delivered! Thank you for choosing DeliveryEase.'
      statusColor = '#10B981'
      statusIcon = '🎉'
      break
    default:
      statusMessage = 'Your order status has been updated.'
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Status Update</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          margin: 0; 
          padding: 0; 
          background-color: #f8fafc;
        }
        .container { 
          max-width: 600px; 
          margin: 0 auto; 
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .header { 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          color: white; 
          padding: 40px 30px; 
          text-align: center; 
        }
        .header h1 { margin: 0; font-size: 28px; font-weight: 700; }
        .header p { margin: 10px 0 0 0; opacity: 0.9; }
        .content { 
          padding: 40px 30px; 
        }
        .status-badge { 
          display: inline-flex; 
          align-items: center;
          gap: 8px;
          padding: 12px 20px; 
          border-radius: 25px; 
          color: white; 
          font-weight: 600; 
          text-transform: uppercase; 
          font-size: 14px; 
          margin: 20px 0;
        }
        .order-details { 
          background: #f8fafc; 
          padding: 25px; 
          border-radius: 12px; 
          margin: 25px 0; 
          border: 1px solid #e2e8f0;
        }
        .items-list { 
          list-style: none; 
          padding: 0; 
          margin: 15px 0;
        }
        .items-list li { 
          padding: 12px 0; 
          border-bottom: 1px solid #e2e8f0; 
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .items-list li:last-child { border-bottom: none; }
        .footer { 
          text-align: center; 
          margin-top: 40px; 
          color: #64748b; 
          font-size: 14px; 
          padding-top: 30px;
          border-top: 1px solid #e2e8f0;
        }
        .button { 
          display: inline-block; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          color: white; 
          padding: 14px 28px; 
          text-decoration: none; 
          border-radius: 8px; 
          margin: 25px 0; 
          font-weight: 600;
          transition: transform 0.2s;
        }
        .button:hover { transform: translateY(-2px); }
        .highlight { background: #fef3c7; padding: 20px; border-radius: 8px; border-left: 4px solid #f59e0b; }
        .order-id { font-family: 'Courier New', monospace; font-weight: 600; color: #667eea; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>DeliveryEase</h1>
          <p>Order Status Update</p>
        </div>
        
        <div class="content">
          <h2>Hello ${data.customerName || 'there'}! 👋</h2>
          
          <div class="highlight">
            <p style="margin: 0; font-weight: 600;">${statusMessage}</p>
          </div>
          
          <div style="text-align: center;">
            <span class="status-badge" style="background-color: ${statusColor};">
              ${statusIcon} ${data.status}
            </span>
          </div>
          
          <div class="order-details">
            <h3 style="margin-top: 0; color: #1e293b;">📋 Order Details</h3>
            <p><strong>Order ID:</strong> <span class="order-id">#${shortOrderId}</span></p>
            <p><strong>Order Date:</strong> ${orderDate}</p>
            <p><strong>Total Amount:</strong> <strong style="color: #059669;">${orderTotal}</strong></p>
            
            ${deliveryAddress}
            
            ${data.orderItems && data.orderItems.length > 0 ? `
              <h4 style="margin: 25px 0 15px 0; color: #1e293b;">🛍️ Items Ordered:</h4>
              <ul class="items-list">
                ${itemsList}
              </ul>
            ` : ''}
          </div>
          
          <div style="text-align: center;">
            <a href="${Deno.env.get('SITE_URL') || 'http://localhost:3008'}/customer/orders/${data.orderId}" class="button">
              📱 View Order Details
            </a>
          </div>
          
          <p style="color: #64748b; font-size: 14px;">
            If you have any questions, please don't hesitate to contact our support team.
          </p>
          
          <div class="footer">
            <p>Thank you for choosing DeliveryEase! 🚀</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `
} 