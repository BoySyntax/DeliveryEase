// Test to check customer email in profiles table
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vpwskrytguoiybqrpebp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwd3Nrcnl0Z3VvaXlicXJwZWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc0NjY3MDMsImV4cCI6MjA2MzA0MjcwM30.-kdF6gL8ffsENAMCRXpr8wtnQoNG1JS5LDcEeHqYrkc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testCustomerEmail() {
  console.log('🔍 Checking customer profiles for emails...');
  
  try {
    // Get all profiles with emails
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, name, email')
      .not('email', 'is', null);

    if (error) {
      console.error('❌ Error fetching profiles:', error);
      return;
    }

    console.log('📊 Found profiles with emails:', profiles?.length || 0);
    
    if (profiles && profiles.length > 0) {
      console.log('👥 Profiles with emails:');
      profiles.forEach(profile => {
        console.log(`- ID: ${profile.id}, Name: ${profile.name}, Email: ${profile.email}`);
      });
    } else {
      console.log('❌ No profiles found with email addresses');
    }

    // Also check recent orders
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, customer_id, approval_status')
      .order('created_at', { ascending: false })
      .limit(5);

    if (ordersError) {
      console.error('❌ Error fetching orders:', ordersError);
      return;
    }

    console.log('📦 Recent orders:');
    orders?.forEach(order => {
      console.log(`- Order ID: ${order.id}, Customer ID: ${order.customer_id}, Status: ${order.approval_status}`);
    });

  } catch (err) {
    console.error('❌ Exception:', err);
  }
}

testCustomerEmail(); 