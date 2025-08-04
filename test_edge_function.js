// Test script to debug the Edge Function
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vpwskrytguoiybqrpebp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwd3Nrcnl0Z3VvaXlicXJwZWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc0NjY3MDMsImV4cCI6MjA2MzA0MjcwM30.-kdF6gL8ffsENAMCRXpr8wtnQoNG1JS5LDcEeHqYrkc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testEdgeFunction() {
  console.log('🧪 Testing Edge Function...');
  
  try {
    const { data, error } = await supabase.functions.invoke('quick-processor', {
      body: {
        orderId: 'test-123',
        customerName: 'Test User',
        customerEmail: 'test@example.com',
        status: 'verified'
      }
    });

    if (error) {
      console.error('❌ Error:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
    } else {
      console.log('✅ Success:', data);
    }
  } catch (err) {
    console.error('❌ Exception:', err);
  }
}

testEdgeFunction(); 