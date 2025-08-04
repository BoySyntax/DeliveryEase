// Test with a different email address
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vpwskrytguoiybqrpebp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwd3Nrcnl0Z3VvaXlicXJwZWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc0NjY3MDMsImV4cCI6MjA2MzA0MjcwM30.-kdF6gL8ffsENAMCRXpr8wtnQoNG1JS5LDcEeHqYrkc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDifferentEmail() {
  console.log('🧪 Testing with a different email address...');
  
  try {
    // Test with a different email
    const customerEmail = 'teroaaron23@gmail.com'; // Different email
    const customerName = 'Test Customer 2';
    const orderId = 'different-email-test';

    console.log('📧 Customer Email:', customerEmail);
    console.log('📦 Order ID:', orderId);
    console.log('🌐 Using domain: fordago.site');

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
      console.log('✅ Email sent successfully to different email!');
      console.log('📧 Check your email at:', customerEmail);
      console.log('📨 Email should be from: noreply@fordago.site');
    } else {
      console.log('❌ Email sending failed');
    }

  } catch (err) {
    console.error('❌ Exception:', err);
  }
}

testDifferentEmail(); 