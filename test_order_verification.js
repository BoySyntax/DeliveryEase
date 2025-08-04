// Test order verification email for a specific customer
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vpwskrytguoiybqrpebp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwd3Nrcnl0Z3VvaXlicXJwZWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc0NjY3MDMsImV4cCI6MjA2MzA0MjcwM30.-kdF6gL8ffsENAMCRXpr8wtnQoNG1JS5LDcEeHqYrkc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testOrderVerification() {
  console.log('🧪 Testing order verification email...');
  
  try {
    // Test with the customer who has tokyobaby466@gmail.com
    const customerId = 'fd636309-2b9c-4bf5-a7a7-1b4ac7cefaef';
    const customerEmail = 'tokyobaby466@gmail.com';
    const customerName = 'Aaron Tero1';
    const orderId = 'test-order-verification';

    console.log('👤 Customer ID:', customerId);
    console.log('📧 Customer Email:', customerEmail);
    console.log('📦 Order ID:', orderId);

    // Test the email service directly
    const response = await fetch('https://vpwskrytguoiybqrpebp.supabase.co/functions/v1/quick-processor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        orderId: orderId,
        customerName: customerName,
        customerEmail: customerEmail,
        status: 'verified'
      })
    });

    const responseText = await response.text();
    console.log('📊 Response status:', response.status);
    console.log('📊 Response body:', responseText);

    if (response.ok) {
      console.log('✅ Order verification email sent successfully!');
      console.log('📧 Check your email at:', customerEmail);
    } else {
      console.log('❌ Order verification email failed');
    }

  } catch (err) {
    console.error('❌ Exception:', err);
  }
}

testOrderVerification(); 