// Test Email Script
// Run this with: node test-email.js

const SUPABASE_URL = 'https://your-project-ref.supabase.co'; // Replace with your Supabase URL
const SUPABASE_ANON_KEY = 'your-anon-key'; // Replace with your Supabase anon key

async function testEmail() {
  const email = 'your-gmail@gmail.com'; // Replace with your Gmail address
  
  try {
    console.log('Sending test email to:', email);
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/test-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        to: email
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Test email sent successfully!');
      console.log('Email ID:', result.emailId);
      console.log('Check your Gmail inbox (and spam folder)');
    } else {
      console.log('❌ Failed to send test email:');
      console.log(result.error);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

// Instructions
console.log('📧 Email Test Script');
console.log('==================');
console.log('');
console.log('Before running this script:');
console.log('1. Sign up at https://resend.com (free)');
console.log('2. Get your API key from Resend dashboard');
console.log('3. Set the RESEND_API_KEY in Supabase Edge Function environment');
console.log('4. Deploy the test-email function: supabase functions deploy test-email');
console.log('5. Update SUPABASE_URL and SUPABASE_ANON_KEY in this script');
console.log('6. Update the email address in this script');
console.log('');
console.log('Then run: node test-email.js');
console.log('');

// Uncomment the line below to run the test
// testEmail(); 