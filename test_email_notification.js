// Test script for email notifications
// Run this with: node test_email_notification.js

const { createClient } = require('@supabase/supabase-js');

// Replace with your actual Supabase URL and anon key
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testEmailNotification() {
  console.log('Testing email notification system...');
  
  try {
    // Test the edge function directly
    const { data, error } = await supabase.functions.invoke('send-order-notification', {
      body: {
        orderId: 'test-order-123',
        customerName: 'Test Customer',
        customerEmail: 'test@example.com', // Replace with your email for testing
        status: 'verified'
      }
    });

    if (error) {
      console.error('Error calling edge function:', error);
      return;
    }

    console.log('Email notification test successful:', data);
    console.log('Check your email inbox for the test notification.');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

async function testOutForDeliveryEmail() {
  console.log('Testing out for delivery email...');
  
  try {
    const { data, error } = await supabase.functions.invoke('send-order-notification', {
      body: {
        orderId: 'test-order-456',
        customerName: 'Test Customer',
        customerEmail: 'test@example.com', // Replace with your email for testing
        status: 'out_for_delivery',
        estimatedDeliveryDate: '2025-01-31'
      }
    });

    if (error) {
      console.error('Error calling edge function:', error);
      return;
    }

    console.log('Out for delivery email test successful:', data);
    console.log('Check your email inbox for the delivery notification.');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run tests
async function runTests() {
  console.log('=== Email Notification System Test ===\n');
  
  await testEmailNotification();
  console.log('\n---\n');
  await testOutForDeliveryEmail();
  
  console.log('\n=== Test Complete ===');
  console.log('Make sure to:');
  console.log('1. Set up your Resend API key in Supabase Edge Functions');
  console.log('2. Deploy the edge function: supabase functions deploy send-order-notification');
  console.log('3. Run the database migration: supabase db push');
  console.log('4. Replace test@example.com with your actual email for testing');
}

runTests().catch(console.error); 