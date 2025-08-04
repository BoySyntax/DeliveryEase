// Working Email Test - This will actually send an email right now!
// Run this with: node test_working_email.js

const RESEND_API_KEY = 're_9mbohhSC_8Qjsdd1R93WNED3NewD11f47'; // Your API key
const YOUR_EMAIL = 'tokyobaby466@gmail.com';

async function sendTestEmail() {
  console.log('🚀 Sending test email NOW...');
  console.log('📧 To:', YOUR_EMAIL);
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: YOUR_EMAIL,
        subject: '🎉 DeliveryEase Email System is Working!',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Email System Working!</title>
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
                <h2>Email System is Working!</h2>
                <p>Hi there!</p>
                <p>This email confirms that your DeliveryEase email notification system is now working correctly.</p>
                <p><strong>What this means:</strong></p>
                <ul>
                  <li>✅ Resend API is configured correctly</li>
                  <li>✅ Your email address is working</li>
                  <li>✅ The email service is functional</li>
                  <li>✅ You'll now receive emails when orders are approved</li>
                </ul>
                <p><strong>Next steps:</strong></p>
                <ol>
                  <li>Place a test order in your app</li>
                  <li>Go to Admin → Verify Orders</li>
                  <li>Approve the order</li>
                  <li>Check your email for the order verification</li>
                </ol>
              </div>
              <div class="footer">
                <p>This is a test message from your working DeliveryEase email system.</p>
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

// Send the test email immediately
sendTestEmail().then(success => {
  if (success) {
    console.log('\n🎉 SUCCESS! Your email system is working!');
    console.log('📧 Check your Gmail for the test email');
    console.log('🚀 Now you can approve orders and customers will receive emails');
  } else {
    console.log('\n❌ Email system needs configuration');
    console.log('🔧 Check your Resend API key');
  }
}); 