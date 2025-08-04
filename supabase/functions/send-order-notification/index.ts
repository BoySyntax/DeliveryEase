import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailNotificationData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  status: 'verified' | 'out_for_delivery';
  estimatedDeliveryDate?: string;
}

async function sendEmailViaResend(emailData: EmailNotificationData): Promise<boolean> {
  try {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      console.error('Resend API key not found in environment variables');
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { orderId, customerName, customerEmail, status, estimatedDeliveryDate } = await req.json()

    if (!orderId || !customerName || !customerEmail || !status) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: orderId, customerName, customerEmail, status' }),
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

    const emailData: EmailNotificationData = {
      orderId,
      customerName,
      customerEmail,
      status,
      estimatedDeliveryDate
    };

    const success = await sendEmailViaResend(emailData);

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