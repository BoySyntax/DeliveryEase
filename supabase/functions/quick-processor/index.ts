// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// @ts-ignore
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept-profile',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Quick-processor function called');
    
    const body = await req.json()
    console.log('Quick-processor received:', body);

    const { orderId, customerName, customerEmail, status, estimatedDeliveryDate, orderItems, totalAmount, batchId, batchNumber, driverName, barangay, orderCount, totalWeight } = body;

    // Handle batch assignment emails
    if (status === 'batch_assigned') {
      if (!batchId || !batchNumber || !driverName || !barangay || !customerEmail || !customerName) {
        console.log('Missing required fields for batch assignment email');
        return new Response(
          JSON.stringify({ error: 'Missing required fields for batch assignment' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
    } else {
      // Handle regular order emails
      if (!orderId || !customerName || !customerEmail || !status) {
        console.log('Missing required fields for order email');
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
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

    // Create email content based on status
    let subject, htmlContent;
    
    if (status === 'batch_assigned') {
      subject = '🚚 Your Order is Out for Delivery - DeliveryEase';
      htmlContent = `
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
              background-color: #3b82f6;
              color: white;
            }
            .order-info {
              background-color: #f8fafc;
              border-radius: 12px;
              padding: 20px;
              margin: 20px 0;
            }
            .order-items {
              margin: 15px 0;
            }
            .order-item {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 10px 0;
              border-bottom: 1px solid #e2e8f0;
            }
            .order-item:last-child {
              border-bottom: none;
            }
            .item-details {
              flex: 1;
            }
            .item-name {
              font-weight: 600;
              color: #1e293b;
            }
            .item-quantity {
              color: #64748b;
              font-size: 14px;
            }
            .item-price {
              font-weight: 600;
              color: #059669;
            }
            .total-section {
              border-top: 2px solid #e2e8f0;
              padding-top: 15px;
              margin-top: 15px;
            }
            .total-amount {
              font-size: 18px;
              font-weight: 700;
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
                Out for Delivery
              </div>
              
              <h2 style="margin: 0 0 10px 0; color: #1e293b;">Hi ${customerName}!</h2>
              <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px;">
                Great news! Your order has been assigned to driver <strong>${driverName}</strong> and is now out for delivery. 
                Estimated delivery date: <strong>${estimatedDeliveryDate}</strong>
              </p>

              <div class="order-info">
                <h3 style="margin: 0 0 15px 0; color: #1e293b;">Batch Details</h3>
                <p style="margin: 0 0 10px 0; color: #64748b;">
                  <strong>Batch Number:</strong> #${batchNumber}<br>
                  <strong>Delivery Area:</strong> ${barangay}<br>
                  <strong>Total Orders:</strong> ${orderCount}<br>
                  <strong>Total Weight:</strong> ${totalWeight} kg
                </p>
              </div>

              ${orderItems && orderItems.length > 0 ? `
                <div class="order-info">
                  <h3 style="margin: 0 0 15px 0; color: #1e293b;">Your Order Items</h3>
                  <div class="order-items">
                    ${orderItems.map(item => `
                      <div class="order-item">
                        <div class="item-details">
                          <div class="item-name">${item.productName}</div>
                          <div class="item-quantity">Quantity: ${item.quantity}</div>
                        </div>
                        <div class="item-price">₱${item.price.toFixed(2)}</div>
                      </div>
                    `).join('')}
                  </div>
                  ${totalAmount ? `
                    <div class="total-section">
                      <div class="order-item">
                        <div class="item-details">
                          <div class="item-name">Total Amount</div>
                        </div>
                        <div class="total-amount">₱${totalAmount.toFixed(2)}</div>
                      </div>
                    </div>
                  ` : ''}
                </div>
              ` : ''}

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
    } else {
      // Regular order emails (verified, out_for_delivery)
      subject = status === 'verified' ? '✅ Order Payment Verified - DeliveryEase' : '🚚 Order Out for Delivery - DeliveryEase';
      htmlContent = `
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

    console.log('Attempting to send email...');

    // Send email via Resend
    const emailData: any = {
      from: 'onboarding@resend.dev',
      to: customerEmail,
      subject: subject,
      html: htmlContent,
    };

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData),
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
      JSON.stringify({ success: true, message: 'Email sent successfully' }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in quick-processor function:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error: ' + error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}) 