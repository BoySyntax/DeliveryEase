// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// @ts-ignore
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      status: 200,
      headers: corsHeaders 
    })
  }

  try {
    console.log('Email-sender function called');
    
    const body = await req.json()
    console.log('Email-sender received:', body);

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

    // Get Resend API key from environment
    const apiKey = Deno.env.get('RESEND_API_KEY');
    console.log('RESEND_API_KEY exists:', apiKey ? 'Yes' : 'No');

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

    // Create email content
    const subject = status === 'verified' 
      ? '✅ Order Payment Verified - fordaGO' 
      : '🚚 Order Out for Delivery - fordaGO';

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
            background: linear-gradient(135deg, #0a2767 0%, #09235d 100%);
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
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚚 fordaGO</h1>
          </div>
          <div class="content">
            <div class="status-badge">
              ${status === 'verified' ? 'Payment Verified' : 'Out for Delivery'}
            </div>
            
            <h2 style="margin: 0 0 10px 0; color: #1e293b;">Hi ${customerName}!</h2>
            <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px;">
              ${status === 'verified' 
                ? 'Great news! Your payment has been verified and your order is being prepared for delivery.'
                : 'Your order is now out for delivery and will arrive soon!'
              }
            </p>

            <div class="order-info">
              <h3 style="margin: 0 0 15px 0; color: #1e293b;">Order Details</h3>
              <p style="margin: 0; color: #64748b;">
                <strong>Order ID:</strong> #${orderId.slice(0, 8).toUpperCase()}<br>
                <strong>Order Date:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>

            <p style="color: #64748b; font-size: 14px; margin: 20px 0 0 0;">
              Thank you for choosing fordaGO! We're committed to delivering your order safely and on time.
            </p>
          </div>
          <div class="footer">
            <p>This is an automated message from fordaGO. Please do not reply to this email.</p>
            <p>Need help? Contact our support team at support@fordago.com</p>
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
        orderId
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in email-sender function:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error: ' + error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})











