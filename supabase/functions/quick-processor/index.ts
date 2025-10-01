// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// @ts-ignore
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept-profile',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

serve(async (req) => {
  console.log('Quick-processor function called with method:', req.method);
  
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('Processing email request...');
    
    const body = await req.json();
    console.log('Request body received:', JSON.stringify(body, null, 2));

    const { orderId, customerName, customerEmail, status, orderItems, totalAmount } = body;
    
    console.log('=== EMAIL PROCESSING DEBUG ===');
    console.log('Order ID:', orderId);
    console.log('Customer Name:', customerName);
    console.log('Customer Email:', customerEmail);
    console.log('Status:', status);
    console.log('Order Items:', orderItems);
    console.log('Total Amount:', totalAmount);
    
    // Debug order items and image URLs
    if (orderItems && orderItems.length > 0) {
      console.log('Order items received:', orderItems.length);
      orderItems.forEach((item, index) => {
        console.log(`Item ${index + 1}:`, {
          productName: item.productName,
          imageUrl: item.imageUrl,
          hasImageUrl: !!item.imageUrl,
          imageUrlType: typeof item.imageUrl,
          imageUrlLength: item.imageUrl ? item.imageUrl.length : 0,
          isImageUrlEmpty: item.imageUrl === '',
          isImageUrlNull: item.imageUrl === null,
          isImageUrlUndefined: item.imageUrl === undefined,
          imageUrlStartsWith: item.imageUrl ? item.imageUrl.substring(0, 50) : 'N/A'
        });
        
        // Debug and validate image URL
        console.log(`🖼️ Processing image for ${item.productName}:`, {
          imageUrl: item.imageUrl,
          isValid: item.imageUrl && item.imageUrl.startsWith('http')
        });
        
        // Only use placeholder if absolutely no image URL exists
        if (!item.imageUrl || item.imageUrl === '' || item.imageUrl === 'null') {
          console.log(`⚠️ No image URL for ${item.productName}`);
          item.imageUrl = null; // Will show placeholder in email
        }
      });
    }

    if (!orderId || !customerName || !customerEmail || !status) {
      console.log('Missing required fields:', { orderId: !!orderId, customerName: !!customerName, customerEmail: !!customerEmail, status: !!status });
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Use the Resend API key directly
    const apiKey = 're_9mbohhSC_8Qjsdd1R93WNED3NewD11f47';
    console.log('Using Resend API key:', apiKey ? 'Yes' : 'No');

    // Create email content
    const subject = status === 'verified' 
      ? '✅ Order Payment Verified - fordaGO' 
      : status === 'rejected'
      ? '❌ Order Payment Rejected - fordaGO'
      : '🚚 Order Out for Delivery - fordaGO';

    // Get accurate current date
    const now = new Date();
    const orderDate = now.toLocaleDateString('en-US', { 
      timeZone: 'Asia/Manila',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    console.log('Current date info:', {
      utc: now.toISOString(),
      local: now.toString(),
      formatted: orderDate,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <meta name="format-detection" content="telephone=no">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          .header {
            background: #f8f9fa;
            padding: 30px 20px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
          }
          .logo {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
          }
          .logo img {
            height: 80px;
            width: auto;
            object-fit: contain;
            display: block;
            margin: 0 auto;
            position: relative;
            left: 50%;
            transform: translateX(-50%);
          }
          .content {
            padding: 25px 20px;
          }
          .status-badge {
            display: inline-block;
            padding: 10px 16px;
            border-radius: 6px;
            font-weight: 700;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 0 0 20px 0;
            background-color: ${status === 'verified' ? '#10b981' : status === 'rejected' ? '#ef4444' : '#3b82f6'};
            color: white;
          }
          .greeting h2 {
            margin: 0 0 12px 0;
            color: #1a1a1a;
            font-size: 24px;
            font-weight: 700;
          }
          .greeting p {
            margin: 0 0 30px 0;
            color: #666;
            font-size: 15px;
            line-height: 1.6;
          }
          .order-details {
            margin-bottom: 0;
            background: white;
            border-radius: 8px;
            padding: 20px;
            border: 1px solid #e0e0e0;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          .order-details h3 {
            margin: 0 0 15px 0;
            color: #1a1a1a;
            font-size: 18px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .order-details-list {
            padding: 0;
            margin: 0;
            list-style: none;
          }
          .order-details-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid #e0e0e0;
          }
          .order-details-item:last-child {
            border-bottom: none;
          }
          .order-details-label {
            font-size: 14px;
            font-weight: 400;
            color: #666;
          }
          .order-details-value {
            font-size: 14px;
            font-weight: 500;
            color: #1a1a1a;
            text-align: right;
          }
          .order-items h3 {
            margin: 20px 0 15px 0;
            color: #1a1a1a;
            font-size: 18px;
            font-weight: 700;
            padding-bottom: 8px;
            border-bottom: 1px solid #e0e0e0;
          }
          .items-container {
            background: transparent;
            border-radius: 0;
            border: none;
            overflow: hidden;
            margin-top: 0;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }
          .items-header {
            background: #f8f9fa;
            border-bottom: 1px solid #e0e0e0;
          }
          .items-header th {
            padding: 15px 20px;
            font-weight: 600;
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            text-align: left;
          }
          .items-header th:nth-child(1) {
            text-align: left;
            width: 75%;
          }
          .items-header th:nth-child(2) {
            text-align: center;
            width: 12%;
          }
          .items-header th:nth-child(3) {
            text-align: right;
            width: 13%;
          }
          .item-row {
            border-bottom: 1px solid #f1f3f4;
          }
          .item-row:last-child {
            border-bottom: none;
          }
          .item-row td {
            padding: 15px 20px;
            vertical-align: middle;
          }
          .item-row td:nth-child(1) {
            text-align: left;
            width: 75%;
          }
          .item-row td:nth-child(2) {
            text-align: center;
            width: 12%;
          }
          .item-row td:nth-child(3) {
            text-align: right;
            width: 13%;
          }
          .item-name {
            font-weight: 500;
            color: #1a1a1a;
            font-size: 14px;
            margin: 0;
            line-height: 1.3;
          }
          .item-quantity {
            font-size: 14px;
            color: #333;
            font-weight: 500;
          }
          .item-price {
            font-weight: 600;
            color: #1a1a1a;
            font-size: 14px;
          }
          .total-section {
            background: #f8f9fa;
            padding: 15px 20px;
            border-top: 1px solid #e0e0e0;
            display: table;
            width: 100%;
            table-layout: fixed;
          }
          .total-row {
            display: table-row;
          }
          .total-label {
            font-weight: 700;
            color: #1a1a1a;
            font-size: 18px;
            text-align: left;
            width: 60%;
            display: table-cell;
            padding: 0;
            vertical-align: middle;
          }
          .total-spacer {
            width: 20%;
            display: table-cell;
            padding: 0;
          }
          .total-amount {
            font-weight: 800;
            color: #10b981;
            font-size: 24px;
            text-align: right;
            width: 20%;
            display: table-cell;
            padding: 0;
            vertical-align: middle;
          }
          .thank-you-banner {
            background: #fff3cd;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: center;
            border: 1px solid #ffeaa7;
          }
          .thank-you-banner p {
            margin: 0;
            color: #1a1a1a;
            font-size: 14px;
            font-weight: 500;
          }
          .footer {
            text-align: center;
            padding: 10px 20px;
            color: #6c757d;
            font-size: 12px;
            background: #f8f9fa;
            border-top: 1px solid #e0e0e0;
          }
          .footer p {
            margin: 0 0 5px 0;
          }
          .footer a {
            color: #0a2767;
            text-decoration: none;
          }
          @media (max-width: 600px) {
            body {
              padding: 10px;
            }
            .container {
              margin: 0;
              border-radius: 0;
            }
            .header {
              padding: 20px 15px;
            }
            .logo img {
              height: 60px;
            }
            .content {
              padding: 20px 15px;
            }
            .order-details {
              padding: 15px;
            }
            .order-details h3 {
              font-size: 16px;
            }
            .order-details-item {
              padding: 10px 0;
            }
            .order-details-label {
              font-size: 13px;
            }
            .order-details-value {
              font-size: 13px;
            }
            .items-container {
              overflow-x: auto;
            }
            .items-table {
              min-width: 100%;
            }
            .items-header th {
              padding: 12px 8px;
              font-size: 11px;
            }
            .items-header th:nth-child(1) {
              width: 60%;
            }
            .items-header th:nth-child(2) {
              width: 20%;
            }
            .items-header th:nth-child(3) {
              width: 20%;
            }
            .item-row td {
              padding: 12px 8px;
            }
            .item-row td:nth-child(1) {
              width: 60%;
            }
            .item-row td:nth-child(2) {
              width: 20%;
            }
            .item-row td:nth-child(3) {
              width: 20%;
            }
            .item-name {
              font-size: 13px;
            }
            .item-quantity {
              font-size: 13px;
            }
            .item-price {
              font-size: 13px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">
              <img src="https://vpwskrytguoiybqrpebp.supabase.co/storage/v1/object/public/product-image/new1-removebg-preview.png" alt="fordaGO Logo" />
            </div>
          </div>
          <div class="content">
            <div class="status-badge">
              ${status === 'verified' ? '✓ PAYMENT VERIFIED' : status === 'rejected' ? '❌ PAYMENT REJECTED' : '🚚 OUT FOR DELIVERY'}
            </div>

            <div class="greeting">
              <h2>Hi ${customerName}!</h2>
              <p>
                ${status === 'verified'
                  ? 'Your payment has been verified and your order is being prepared for delivery.'
                  : status === 'rejected'
                  ? 'Unfortunately, your payment has been rejected. Please contact our support team for assistance or try placing your order again.'
                  : 'Your order is now out for delivery and will arrive soon!'
                }
              </p>
            </div>

            <div class="order-details">
              <h3>Order Details</h3>
              <ul class="order-details-list">
                <li class="order-details-item">
                  <span class="order-details-label">Order ID:</span>
                  <span class="order-details-value">#${orderId.slice(0, 8).toUpperCase()}</span>
                </li>
                <li class="order-details-item">
                  <span class="order-details-label">Order Date:</span>
                  <span class="order-details-value">${orderDate}</span>
                </li>
                <li class="order-details-item">
                  <span class="order-details-label">Total Amount:</span>
                  <span class="order-details-value">₱${totalAmount ? totalAmount.toFixed(2) : '0.00'}</span>
                </li>
              </ul>
              
              ${orderItems && orderItems.length > 0 ? `
                <div class="order-items">
                  <h3>Order Items</h3>
                  <div class="items-container">
                    <table class="items-table">
                      <thead class="items-header">
                        <tr>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${orderItems.map(item => `
                          <tr class="item-row">
                            <td class="item-name">${item.productName}</td>
                            <td class="item-quantity">${item.quantity}</td>
                            <td class="item-price">₱${item.price.toFixed(2)}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>
              ` : ''}
            </div>

            <div class="thank-you-banner">
              <p>${status === 'rejected' 
                ? 'We apologize for any inconvenience. Please don\'t hesitate to contact our support team if you need assistance with your payment or have any questions.'
                : 'Thank you for choosing fordaGO! We\'re committed to delivering your order safely and on time.'
              }</p>
            </div>

            ${status === 'rejected' ? `
              <div class="reorder-section" style="text-align: center; margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #e0e0e0;">
                <h3 style="margin: 0 0 15px 0; color: #1a1a1a; font-size: 18px; font-weight: 600;">Want to try again?</h3>
                <p style="margin: 0 0 20px 0; color: #666; font-size: 14px;">You can easily reorder the same items with one click.</p>
                <a href="https://www.fordago.site/customer/checkout?reorder=${orderId}" 
                   style="display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; transition: background-color 0.2s; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);">
                  🔄 Reorder This Order
                </a>
                <p style="margin: 15px 0 0 0; color: #999; font-size: 12px;">This will take you to checkout with the same items</p>
              </div>
            ` : ''}
          </div>
          
          <div class="footer">
            <p>This is an automated message from fordaGO. Please do not reply to this email.</p>
            <p>Need help? Contact our support team at <a href="mailto:support@fordago.com">support@fordago.com</a></p>
          </div>
        </div>
      </body>
      </html>
    `;

    console.log('=== SENDING EMAIL ===');
    console.log('Attempting to send email to:', customerEmail);
    console.log('Email subject:', subject);
    console.log('API Key present:', !!apiKey);

    // Send email via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'noreply@fordago.site',
        to: customerEmail,
        subject: subject,
        html: htmlContent,
      }),
    });

    console.log('Resend response status:', response.status);
    console.log('Resend response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to send email:', response.status, errorText);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to send email', 
          details: errorText,
          status: response.status
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const result = await response.json();
    console.log('Email sent successfully:', result);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email sent successfully',
        orderId,
        emailId: result.id
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in quick-processor function:', error);
    console.error('Error stack:', error.stack);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        message: error.message,
        type: error.constructor.name
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
})