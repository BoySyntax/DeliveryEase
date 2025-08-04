// Simple email test - Tests if Resend API key is working
// Run this with: node simple_email_test.js

const YOUR_EMAIL = 'tokyobaby466@gmail.com';

console.log('🚀 Testing Email System...\n');
console.log('📧 Target email:', YOUR_EMAIL);

// This will test if the edge function exists and can be called
async function testEdgeFunction() {
  try {
    console.log('\n1. Testing edge function availability...');
    
    // We'll use a simple fetch to test if the function exists
    const response = await fetch('https://your-project.supabase.co/functions/v1/send-order-notification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderId: 'TEST-123',
        customerName: 'Test User',
        customerEmail: YOUR_EMAIL,
        status: 'verified'
      })
    });

    if (response.status === 404) {
      console.log('   ❌ Edge function not found (404)');
      console.log('   💡 The function needs to be deployed');
      return false;
    } else if (response.status === 401) {
      console.log('   ❌ Unauthorized (401)');
      console.log('   💡 Check your Supabase API keys');
      return false;
    } else {
      console.log('   ✅ Edge function responded with status:', response.status);
      const result = await response.text();
      console.log('   📄 Response:', result);
      return true;
    }
  } catch (error) {
    console.log('   ❌ Error calling edge function:', error.message);
    console.log('   💡 The function might not be deployed or URL is wrong');
    return false;
  }
}

// This will test if we can send emails directly via Resend
async function testDirectEmail() {
  console.log('\n2. Testing direct email (this requires your Resend API key)...');
  console.log('   ⚠️  You need to add your Resend API key to this file');
  console.log('   📝 Edit this file and replace "YOUR_API_KEY" with your actual key');
  
  const RESEND_API_KEY = 'YOUR_API_KEY'; // Replace this with your actual key
  
  if (RESEND_API_KEY === 'YOUR_API_KEY') {
    console.log('   ❌ No API key provided');
    console.log('   💡 Get your key from: https://resend.com/api-keys');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev', // Use Resend's default sender for testing
        to: YOUR_EMAIL,
        subject: 'Test Email from DeliveryEase',
        html: '<h1>Test Email</h1><p>If you see this, the email system is working!</p>'
      })
    });

    if (response.ok) {
      console.log('   ✅ Direct email sent successfully!');
      console.log('   📧 Check your Gmail inbox and spam folder');
      return true;
    } else {
      const error = await response.text();
      console.log('   ❌ Failed to send direct email:', response.status, error);
      return false;
    }
  } catch (error) {
    console.log('   ❌ Error sending direct email:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('=== Email System Diagnostic ===\n');
  
  const edgeFunctionWorks = await testEdgeFunction();
  const directEmailWorks = await testDirectEmail();
  
  console.log('\n=== Results ===');
  console.log('Edge Function:', edgeFunctionWorks ? '✅ Working' : '❌ Not Working');
  console.log('Direct Email:', directEmailWorks ? '✅ Working' : '❌ Not Working');
  
  if (!edgeFunctionWorks && !directEmailWorks) {
    console.log('\n🔧 Issues to fix:');
    console.log('   1. Deploy the edge function: supabase functions deploy send-order-notification');
    console.log('   2. Set up Resend API key in Supabase dashboard');
    console.log('   3. Check your Supabase project URL and keys');
  } else if (!edgeFunctionWorks) {
    console.log('\n🔧 Edge function needs to be deployed');
    console.log('   Run: supabase functions deploy send-order-notification');
  } else if (!directEmailWorks) {
    console.log('\n🔧 Resend API key issue');
    console.log('   Check your API key in Supabase dashboard');
  } else {
    console.log('\n🎉 Everything is working!');
    console.log('   You should receive emails when orders are approved');
  }
}

runTests(); 