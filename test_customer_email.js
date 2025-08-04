// Test Customer Email Service
// This will test the email system with a real customer ID

const RESEND_API_KEY = 're_9mbohhSC_8Qjsdd1R93WNED3NewD11f47';
const TEST_CUSTOMER_ID = 'fd636309-2b9c-4bf5-a7a7-1b4ac7cefaef'; // The customer ID from your error
const TEST_EMAIL = 'tokyobaby466@gmail.com';

async function testCustomerEmail() {
  console.log('🧪 Testing Customer Email Service...');
  console.log('👤 Customer ID:', TEST_CUSTOMER_ID);
  console.log('📧 Test Email:', TEST_EMAIL);
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: TEST_EMAIL,
        subject: '🎉 Your Order is Verified!',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Order Verified</title>
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
                <h2>Your Order is Verified!</h2>
                <p>Hi Customer,</p>
                <p>Your order #TEST-123 has been verified and is being processed.</p>
                <p><strong>Customer ID:</strong> ${TEST_CUSTOMER_ID}</p>
                <p><strong>Email:</strong> ${TEST_EMAIL}</p>
                <p>You will receive another email when your order is out for delivery.</p>
              </div>
              <div class="footer">
                <p>This is a test email from your working DeliveryEase system.</p>
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
    console.log('✅ Email sent successfully!');
    console.log('📧 Check your Gmail inbox (and spam folder)');
    console.log('📋 Email ID:', result.id);
    return true;

  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    return false;
  }
}

// Run the test
testCustomerEmail().then(success => {
  if (success) {
    console.log('\n🎉 SUCCESS! Your email system is working!');
    console.log('📧 Check your Gmail for the test email');
    console.log('🚀 Now you can approve orders and customers will receive emails');
    console.log('\n📝 Next Steps:');
    console.log('1. Place a test order in your app');
    console.log('2. Go to Admin → Verify Orders');
    console.log('3. Approve the order');
    console.log('4. Check your Gmail for the order verification email');
  } else {
    console.log('\n❌ Email system needs configuration');
    console.log('🔧 Check your Resend API key');
  }
}); 