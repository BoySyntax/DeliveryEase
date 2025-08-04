// Test with real email address
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vpwskrytguoiybqrpebp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwd3Nrcnl0Z3VvaXlicXJwZWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc0NjY3MDMsImV4cCI6MjA2MzA0MjcwM30.-kdF6gL8ffsENAMCRXpr8wtnQoNG1JS5LDcEeHqYrkc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRealEmail() {
  console.log('🧪 Testing with real email...');
  
  try {
    const response = await fetch('https://vpwskrytguoiybqrpebp.supabase.co/functions/v1/quick-processor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        orderId: 'test-123',
        customerName: 'Test User',
        customerEmail: 'tokyobaby466@gmail.com',
        status: 'verified'
      })
    });

    const responseText = await response.text();
    console.log('📊 Response status:', response.status);
    console.log('📊 Response body:', responseText);

    if (response.ok) {
      console.log('✅ Email sent successfully!');
    } else {
      console.log('❌ Email sending failed');
    }
  } catch (err) {
    console.error('❌ Exception:', err);
  }
}

testRealEmail(); 