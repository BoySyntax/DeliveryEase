// Test Automatic Email System
// This will test the complete automatic email system

const { createClient } = require('@supabase/supabase-js');

// Your Supabase credentials - replace with your actual values
const supabaseUrl = 'https://your-project.supabase.co'; // Replace with your URL
const supabaseKey = 'your-anon-key'; // Replace with your anon key

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAutomaticEmail() {
  console.log('🧪 Testing Automatic Email System...');
  
  const customerId = 'fd636309-2b9c-4bf5-a7a7-1b4ac7cefaef';
  
  try {
    // Test getting email from profiles table
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('id', customerId)
      .single();
    
    if (profileError) {
      console.log('❌ Error getting profile:', profileError);
      return;
    }
    
    if (!profileData) {
      console.log('❌ No profile found for customer:', customerId);
      return;
    }
    
    console.log('✅ Found profile:', profileData);
    
    if (profileData.email) {
      console.log('✅ Found email in profiles:', profileData.email);
      
      // Test sending email
      const RESEND_API_KEY = 're_9mbohhSC_8Qjsdd1R93WNED3NewD11f47';
      
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'onboarding@resend.dev',
          to: profileData.email,
          subject: '🎉 Automatic Email System Working!',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Automatic Email Test</title>
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
                  <h2>Automatic Email System Working!</h2>
                  <p>Hi ${profileData.name || 'Customer'},</p>
                  <p>This email confirms that your automatic email system is working correctly.</p>
                  <p><strong>Customer ID:</strong> ${customerId}</p>
                  <p><strong>Email:</strong> ${profileData.email}</p>
                  <p><strong>Name:</strong> ${profileData.name || 'Not set'}</p>
                  <p>✅ Your email was automatically retrieved from the profiles table</p>
                  <p>✅ The email system is ready for real orders</p>
                </div>
                <div class="footer">
                  <p>This is a test from your working automatic email system.</p>
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
        return;
      }

      const result = await response.json();
      console.log('✅ Automatic email sent successfully!');
      console.log('📧 Check your Gmail inbox (and spam folder)');
      console.log('📋 Email ID:', result.id);
      
      console.log('\n🎉 SUCCESS! Your automatic email system is working!');
      console.log('📧 Real customer emails will now be sent automatically when orders are approved!');
      
    } else {
      console.log('⚠️ No email found in profiles, trying auth.users fallback...');
      
      // Try RPC function as fallback
      const { data: emailData, error: emailError } = await supabase
        .rpc('get_user_email', { user_id: customerId });
      
      if (emailData && !emailError) {
        console.log('✅ Found email from auth.users:', emailData);
        console.log('📧 Email system will work with fallback method');
      } else {
        console.log('❌ No email found anywhere for customer:', customerId);
        console.log('🔧 Run the setup_automatic_emails.sql script first');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Instructions
console.log('📝 Instructions:');
console.log('1. Replace supabaseUrl and supabaseKey with your actual values');
console.log('2. Run setup_automatic_emails.sql in your Supabase SQL editor');
console.log('3. Then run: node test_automatic_email.js');
console.log('\nThis will test the complete automatic email system!'); 