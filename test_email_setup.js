// Test script to check email notification setup
// Run this with: node test_email_setup.js

const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

console.log('=== Email Notification System Setup Check ===\n');

console.log('1. Checking Supabase connection...');
console.log('   Supabase URL:', supabaseUrl);
console.log('   Anon Key:', supabaseAnonKey.substring(0, 20) + '...');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSetup() {
  try {
    // Test 1: Check if edge function exists
    console.log('\n2. Testing edge function...');
    try {
      const { data, error } = await supabase.functions.invoke('send-order-notification', {
        body: {
          orderId: 'test-order-123',
          customerName: 'Test Customer',
          customerEmail: 'test@example.com',
          status: 'verified'
        }
      });

      if (error) {
        console.log('   ❌ Edge function error:', error.message);
        console.log('   💡 The edge function might not be deployed or configured');
      } else {
        console.log('   ✅ Edge function responded:', data);
      }
    } catch (funcError) {
      console.log('   ❌ Edge function not found or not accessible');
      console.log('   💡 You need to deploy the edge function first');
    }

    // Test 2: Check database trigger
    console.log('\n3. Checking database trigger...');
    const { data: triggerData, error: triggerError } = await supabase
      .from('information_schema.triggers')
      .select('trigger_name')
      .eq('trigger_name', 'order_status_email_trigger');

    if (triggerError) {
      console.log('   ❌ Cannot check trigger:', triggerError.message);
    } else if (triggerData && triggerData.length > 0) {
      console.log('   ✅ Database trigger exists');
    } else {
      console.log('   ❌ Database trigger not found');
      console.log('   💡 You need to run: supabase db push');
    }

    // Test 3: Check if you have any orders
    console.log('\n4. Checking for existing orders...');
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, customer_id, approval_status, delivery_status')
      .limit(5);

    if (ordersError) {
      console.log('   ❌ Cannot fetch orders:', ordersError.message);
    } else {
      console.log(`   ✅ Found ${orders.length} orders`);
      if (orders.length > 0) {
        console.log('   Sample orders:');
        orders.forEach((order, index) => {
          console.log(`     ${index + 1}. Order ${order.id.slice(0, 8)} - Approval: ${order.approval_status}, Delivery: ${order.delivery_status}`);
        });
      }
    }

    // Test 4: Check if you have any customers with emails
    console.log('\n5. Checking customer emails...');
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers();

    if (usersError) {
      console.log('   ❌ Cannot fetch users:', usersError.message);
    } else {
      const usersWithEmails = users.users.filter(user => user.email);
      console.log(`   ✅ Found ${usersWithEmails.length} users with emails`);
      if (usersWithEmails.length > 0) {
        console.log('   Sample emails:');
        usersWithEmails.slice(0, 3).forEach((user, index) => {
          console.log(`     ${index + 1}. ${user.email}`);
        });
      }
    }

  } catch (error) {
    console.error('Error during setup check:', error);
  }
}

async function provideSolutions() {
  console.log('\n=== Solutions ===');
  console.log('\nIf you\'re not receiving emails, here\'s what to do:');
  
  console.log('\n1. Deploy the edge function:');
  console.log('   supabase functions deploy send-order-notification');
  
  console.log('\n2. Apply database migrations:');
  console.log('   supabase db push');
  
  console.log('\n3. Set up Resend API key in Supabase:');
  console.log('   - Go to Supabase Dashboard > Settings > Edge Functions');
  console.log('   - Add environment variable: RESEND_API_KEY = your_resend_api_key');
  
  console.log('\n4. Test the system:');
  console.log('   - Place a test order');
  console.log('   - Go to Admin > Verify Orders');
  console.log('   - Approve the order');
  console.log('   - Check your email');
  
  console.log('\n5. For immediate testing:');
  console.log('   - Update test_email_notification.js with your email');
  console.log('   - Run: node test_email_notification.js');
}

checkSetup().then(() => {
  provideSolutions();
}).catch(console.error); 