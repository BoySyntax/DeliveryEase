// Deployment script for email notification system
// Run this with: node deploy_email_system.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Deploying Email Notification System...\n');

async function deploySystem() {
  try {
    // Step 1: Check if we're in the right directory
    console.log('1. Checking project structure...');
    if (!fs.existsSync('supabase/functions/send-order-notification/index.ts')) {
      console.log('   ❌ Edge function not found!');
      console.log('   💡 Make sure you\'re in the CAPSTONE directory');
      return;
    }
    console.log('   ✅ Edge function found');

    // Step 2: Deploy the edge function
    console.log('\n2. Deploying edge function...');
    try {
      execSync('supabase functions deploy send-order-notification', { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
      console.log('   ✅ Edge function deployed successfully');
    } catch (error) {
      console.log('   ❌ Failed to deploy edge function');
      console.log('   💡 Make sure you\'re logged into Supabase CLI');
      console.log('   💡 Run: supabase login');
      return;
    }

    // Step 3: Apply database migrations
    console.log('\n3. Applying database migrations...');
    try {
      execSync('supabase db push', { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
      console.log('   ✅ Database migrations applied');
    } catch (error) {
      console.log('   ❌ Failed to apply migrations');
      console.log('   💡 Check your database connection');
      return;
    }

    // Step 4: Check environment variables
    console.log('\n4. Checking environment variables...');
    console.log('   ⚠️  IMPORTANT: You need to set up Resend API key manually');
    console.log('   📝 Go to Supabase Dashboard → Settings → Edge Functions');
    console.log('   📝 Add environment variable: RESEND_API_KEY = your_resend_api_key');
    console.log('   📝 Get your API key from: https://resend.com');

    console.log('\n🎉 Deployment complete!');
    console.log('\n📋 Next steps:');
    console.log('   1. Set up Resend API key in Supabase dashboard');
    console.log('   2. Run: node quick_email_test.js');
    console.log('   3. Check your email (and spam folder)');

  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
  }
}

deploySystem(); 