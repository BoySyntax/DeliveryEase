// Check DMARC record for fordago.site
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vpwskrytguoiybqrpebp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwd3Nrcnl0Z3VvaXlicXJwZWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc0NjY3MDMsImV4cCI6MjA2MzA0MjcwM30.-kdF6gL8ffsENAMCRXpr8wtnQoNG1JS5LDcEeHqYrkc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDMARC() {
  console.log('🔍 Checking DMARC configuration...');
  
  try {
    // Test with a simple text email (less likely to go to spam)
    const customerEmail = 'tokyobaby466@gmail.com';
    const customerName = 'Test Customer';
    const orderId = 'dmarc-test-123';

    console.log('📧 Customer Email:', customerEmail);
    console.log('📦 Order ID:', orderId);
    console.log('🌐 Using domain: fordago.site');

    // Test with simpler email content
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
      console.log('✅ Email sent successfully!');
      console.log('📧 Check your email at:', customerEmail);
      console.log('📨 Email should be from: noreply@fordago.site');
      console.log('\n💡 Tips to reduce spam:');
      console.log('1. Check spam folder first');
      console.log('2. Mark emails as "Not Spam"');
      console.log('3. Add noreply@fordago.site to contacts');
      console.log('4. Wait 24-48 hours for domain reputation to build');
    } else {
      console.log('❌ Email sending failed');
    }

  } catch (err) {
    console.error('❌ Exception:', err);
  }
}

checkDMARC(); 