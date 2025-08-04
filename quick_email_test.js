// Quick email test - Replace with your email and run
// Run this with: node quick_email_test.js

const { createClient } = require('@supabase/supabase-js');

// ⚠️ IMPORTANT: Replace this with your actual email address
const YOUR_EMAIL = 'tokyobaby466@gmail.com'; // CHANGE THIS!

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function quickTest() {
  if (YOUR_EMAIL === 'your-email@example.com') {
    console.log('❌ ERROR: Please update YOUR_EMAIL in this file with your actual email address!');
    console.log('   Edit line 6 in quick_email_test.js');
    return;
  }

  console.log('🚀 Testing email notification system...');
  console.log('📧 Sending test email to:', YOUR_EMAIL);
  
  try {
    // Test 1: Verified order email
    console.log('\n1. Testing "Order Verified" email...');
    const { data: verifiedData, error: verifiedError } = await supabase.functions.invoke('send-order-notification', {
      body: {
        orderId: 'TEST-ORDER-123',
        customerName: 'Test Customer',
        customerEmail: YOUR_EMAIL,
        status: 'verified'
      }
    });

    if (verifiedError) {
      console.log('   ❌ Error:', verifiedError.message);
    } else {
      console.log('   ✅ Email sent successfully!');
      console.log('   📧 Check your inbox for "Your Order is Verified"');
    }

    // Wait 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 2: Out for delivery email
    console.log('\n2. Testing "Out for Delivery" email...');
    const { data: deliveryData, error: deliveryError } = await supabase.functions.invoke('send-order-notification', {
      body: {
        orderId: 'TEST-ORDER-456',
        customerName: 'Test Customer',
        customerEmail: YOUR_EMAIL,
        status: 'out_for_delivery',
        estimatedDeliveryDate: '2025-01-31'
      }
    });

    if (deliveryError) {
      console.log('   ❌ Error:', deliveryError.message);
    } else {
      console.log('   ✅ Email sent successfully!');
      console.log('   📧 Check your inbox for "Your Order is Out for Delivery"');
    }

    console.log('\n🎉 Test complete!');
    console.log('📧 Check your email inbox (and spam folder) for the test emails.');
    
    if (verifiedError || deliveryError) {
      console.log('\n🔧 If you got errors, you need to:');
      console.log('   1. Deploy the edge function: supabase functions deploy send-order-notification');
      console.log('   2. Set up Resend API key in Supabase dashboard');
      console.log('   3. Make sure your Supabase URL and key are correct');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n🔧 Common issues:');
    console.log('   - Edge function not deployed');
    console.log('   - Resend API key not configured');
    console.log('   - Wrong Supabase URL/key');
  }
}

quickTest(); 