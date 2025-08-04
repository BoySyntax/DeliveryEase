// Direct email test - Tests Resend API directly
// Run this with: node test_email_direct.js

const YOUR_EMAIL = 'tokyobaby466@gmail.com'; // Your Gmail address
const RESEND_API_KEY = 'your_resend_api_key_here'; // Replace with your actual Resend API key

async function testDirectEmail() {
  console.log('🚀 Testing Direct Email via Resend API...\n');
  
  if (RESEND_API_KEY === 'your_resend_api_key_here') {
    console.log('❌ ERROR: You need to set up Resend API key first!');
    console.log('\n📋 Setup Steps:');
    console.log('   1. Go to https://resend.com and create a free account');
    console.log('   2. Verify your email address');
    console.log('   3. Go to "API Keys" in your dashboard');
    console.log('   4. Create a new API key (starts with "re_")');
    console.log('   5. Replace "your_resend_api_key_here" in this file with your actual API key');
    console.log('   6. Run this test again');
    return;
  }

  console.log('📧 Sending test email to:', YOUR_EMAIL);
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'noreply@deliveryease.com',
        to: YOUR_EMAIL,
        subject: 'Test Email from DeliveryEase',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Test Email</title>
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
                <h2>Test Email Success! 🎉</h2>
                <p>Hi there!</p>
                <p>This is a test email to verify that your email notification system is working correctly.</p>
                <p>If you received this email, it means:</p>
                <ul>
                  <li>✅ Resend API is configured correctly</li>
                  <li>✅ Your email address is working</li>
                  <li>✅ The email service is functional</li>
                </ul>
                <p>Now you can deploy the full system and receive order notifications!</p>
              </div>
              <div class="footer">
                <p>This is a test message from DeliveryEase email system.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Failed to send email:', response.status, errorText);
      
      if (response.status === 401) {
        console.log('\n🔧 Issue: Invalid API key');
        console.log('   Make sure your Resend API key is correct');
      } else if (response.status === 403) {
        console.log('\n🔧 Issue: Domain not verified');
        console.log('   For now, you can use a verified domain or test with Resend\'s sandbox');
      }
    } else {
      const result = await response.json();
      console.log('✅ Email sent successfully!');
      console.log('📧 Check your inbox (and spam folder) for the test email');
      console.log('📋 Email ID:', result.id);
    }

  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    console.log('\n🔧 Common issues:');
    console.log('   - No internet connection');
    console.log('   - Invalid API key');
    console.log('   - Resend service down');
  }
}

testDirectEmail(); 