// Deploy Email Edge Function
// This script will deploy the send-email Edge Function

const { execSync } = require('child_process');

console.log('🚀 Deploying Email Edge Function...');

try {
  // Deploy the Edge Function
  console.log('📦 Deploying send-email Edge Function...');
  execSync('supabase functions deploy send-email', { stdio: 'inherit' });
  
  console.log('✅ Edge Function deployed successfully!');
  console.log('');
  console.log('📝 Next Steps:');
  console.log('1. Go to your Supabase Dashboard → Settings → API');
  console.log('2. Copy your project URL and anon key');
  console.log('3. Go to Supabase Dashboard → Settings → Edge Functions');
  console.log('4. Set the RESEND_API_KEY environment variable:');
  console.log('   - Key: RESEND_API_KEY');
  console.log('   - Value: re_9mbohhSC_8Qjsdd1R93WNED3NewD11f47');
  console.log('5. Test the system with a real order');
  console.log('');
  console.log('🎉 Your email system is now ready!');
  
} catch (error) {
  console.error('❌ Error deploying Edge Function:', error.message);
  console.log('');
  console.log('🔧 Manual Steps:');
  console.log('1. Run: supabase functions deploy send-email');
  console.log('2. Set RESEND_API_KEY in Supabase Dashboard');
  console.log('3. Test with a real order');
} 