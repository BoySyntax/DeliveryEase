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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Debug-email function called');
    
    const body = await req.json()
    console.log('Debug-email received:', body);

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

    // Test 1: Check environment variables
    console.log('Testing environment variables...');
    const apiKey = Deno.env.get('RESEND_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    console.log('RESEND_API_KEY exists:', apiKey ? 'Yes' : 'No');
    console.log('SUPABASE_URL exists:', supabaseUrl ? 'Yes' : 'No');
    console.log('SUPABASE_SERVICE_ROLE_KEY exists:', supabaseServiceKey ? 'Yes' : 'No');

    // Test 2: Try to import Supabase client
    console.log('Testing Supabase import...');
    let supabase;
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      supabase = createClient(supabaseUrl, supabaseServiceKey);
      console.log('Supabase client created successfully');
    } catch (importError) {
      console.error('Failed to import Supabase:', importError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Supabase import failed',
          details: importError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Test 3: Try database query
    console.log('Testing database query...');
    try {
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
        console.error('Database query error:', itemsError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Database query failed',
            details: itemsError.message 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      console.log('Database query successful, items found:', orderItems?.length || 0);

      // Test 4: Calculate total
      const totalAmount = orderItems.reduce((sum, item) => {
        return sum + (item.price * item.quantity);
      }, 0);

      console.log('Total calculated:', totalAmount);

      // Test 5: Send email
      console.log('Testing email sending...');
      const subject = '🔍 Debug Test - DeliveryEase';
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${subject}</title>
        </head>
        <body>
          <h1>Debug Test Email</h1>
          <p>Hi ${customerName}!</p>
          <p>This is a debug test email for order #${orderId.slice(0, 8).toUpperCase()}</p>
          <p>Order items found: ${orderItems.length}</p>
          <p>Total amount: ₱${totalAmount.toFixed(2)}</p>
          <p>Status: ${status}</p>
        </body>
        </html>
      `;

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
        console.error('Email sending failed:', response.status, errorText);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Email sending failed',
            details: errorText 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      console.log('All tests passed!');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Debug test completed successfully',
          orderId,
          itemCount: orderItems.length,
          totalAmount: totalAmount.toFixed(2)
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )

    } catch (dbError) {
      console.error('Database operation failed:', dbError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Database operation failed',
          details: dbError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

  } catch (error) {
    console.error('Error in debug-email function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Function execution failed',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}) 