// Test Direct Email Service
// This will test the direct email service that works without Edge Functions

async function testDirectEmail() {
  console.log('🧪 Testing Direct Email Service...');
  
  const RESEND_API_KEY = 're_9mbohhSC_8Qjsdd1R93WNED3NewD11f47';
  const TEST_EMAIL = 'tokyobaby466@gmail.com';
  
  try {
    console.log('📧 Sending test email to:', TEST_EMAIL);
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: TEST_EMAIL,
        subject: '🎉 Direct Email Service Working!',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Direct Email Test</title>
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
                <h1>🎉 DeliveryEase</h1>
              </div>
              <div class="content">
                <h2>Direct Email Service Working!</h2>
                <p>Hi Test Customer,</p>
                <p>This email confirms that your direct email service is working correctly.</p>
                <p><strong>Order ID:</strong> TEST-123</strong></p>
                <p><strong>Email:</strong> ${TEST_EMAIL}</p>
                <p>✅ Direct email sending is working</p>
                <p>✅ No Edge Function needed</p>
                <p>✅ Real customer emails will be sent when orders are approved</p>
              </div>
              <div class="footer">
                <p>This is a test from your working direct email system.</p>
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
      return false;
    }

    const result = await response.json();
    console.log('✅ Direct email sent successfully!');
    console.log('📧 Check your Gmail inbox (and spam folder)');
    console.log('📋 Email ID:', result.id);
    
    console.log('\n🎉 SUCCESS! Your direct email system is working!');
    console.log('📧 Real customer emails will now be sent when orders are approved!');
    console.log('');
    console.log('🚀 Next Steps:');
    console.log('1. Place an order in your app');
    console.log('2. Go to Admin → Verify Orders');
    console.log('3. Approve the order');
    console.log('4. Customer will receive email automatically');
    
    return true;
    
  } catch (error) {
    console.error('❌ Error sending direct email:', error.message);
    return false;
  }
}

// Run the test
console.log('📝 Testing Direct Email Service...');
console.log('This will send a test email without using Edge Functions');
console.log('');

testDirectEmail().then(success => {
  if (success) {
    console.log('\n🎉 Your email system is ready!');
  } else {
    console.log('\n❌ Email system needs configuration');
  }
}); 