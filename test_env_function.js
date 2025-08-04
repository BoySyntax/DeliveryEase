// Test to check environment variable
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vpwskrytguoiybqrpebp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwd3Nrcnl0Z3VvaXlicXJwZWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc0NjY3MDMsImV4cCI6MjA2MzA0MjcwM30.-kdF6gL8ffsENAMCRXpr8wtnQoNG1JS5LDcEeHqYrkc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testEnvironmentVariable() {
  console.log('🧪 Testing environment variable...');
  
  try {
    // Let's test with a simple request to see if we can get more details
    const response = await fetch('https://vpwskrytguoiybqrpebp.supabase.co/functions/v1/quick-processor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        orderId: 'test-123',
        customerName: 'Test User',
        customerEmail: 'test@example.com',
        status: 'verified'
      })
    });

    const responseText = await response.text();
    console.log('📊 Full response:', responseText);

    // Try to parse the response
    try {
      const responseData = JSON.parse(responseText);
      console.log('📊 Parsed response:', responseData);
      
      if (responseData.error === 'Failed to send email') {
        console.log('🔍 The function is running but email sending is failing');
        console.log('🔍 This could be due to:');
        console.log('   1. RESEND_API_KEY not being read correctly');
        console.log('   2. Network issue with Resend API');
        console.log('   3. Invalid email address');
        console.log('   4. Resend API quota exceeded');
      }
    } catch (parseError) {
      console.log('📊 Response is not JSON:', responseText);
    }

  } catch (err) {
    console.error('❌ Exception:', err);
  }
}

testEnvironmentVariable(); 