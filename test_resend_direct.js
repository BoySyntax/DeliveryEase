// Direct test of Resend API
async function testResendDirect() {
  console.log('🧪 Testing Resend API directly...');
  
  try {
    const RESEND_API_KEY = 're_9mbohhSC_8Qjsdd1R93WNED3NewD11f47';
    
    console.log('🔑 API Key length:', RESEND_API_KEY.length);
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: 'tokyobaby466@gmail.com',
        subject: 'Test Email from Resend',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Test Email</title>
          </head>
          <body>
            <h1>Test Email</h1>
            <p>This is a test email sent directly from Resend API.</p>
          </body>
          </html>
        `,
      }),
    });

    console.log('📊 Resend API response status:', response.status);
    console.log('📊 Resend API response headers:', Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log('📊 Resend API response body:', responseText);

    if (response.ok) {
      console.log('✅ Resend API is working!');
    } else {
      console.log('❌ Resend API returned error');
    }
  } catch (err) {
    console.error('❌ Exception:', err);
  }
}

testResendDirect(); 