// Test modern email template with order items and total
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vpwskrytguoiybqrpebp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwd3Nrcnl0Z3VvaXlicXJwZWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc0NjY3MDMsImV4cCI6MjA2MzA0MjcwM30.-kdF6gL8ffsENAMCRXpr8wtnQoNG1JS5LDcEeHqYrkc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testModernEmail() {
  console.log('🧪 Testing modern email template with order details...');
  
  try {
    // Test with order items and total
    const customerEmail = 'tokyobaby466@gmail.com';
    const customerName = 'Test Customer';
    const orderId = 'modern-test-123';
    const orderItems = [
      {
        productName: 'Premium Coffee Beans',
        quantity: 2,
        price: 150.00
      },
      {
        productName: 'Organic Tea Leaves',
        quantity: 1,
        price: 200.00
      },
      {
        productName: 'Chocolate Cookies',
        quantity: 3,
        price: 75.00
      }
    ];
    const totalAmount = 725.00; // 2*150 + 1*200 + 3*75

    console.log('📧 Customer Email:', customerEmail);
    console.log('📦 Order ID:', orderId);
    console.log('🛒 Order Items:', orderItems.length, 'items');
    console.log('💰 Total Amount: ₱', totalAmount.toFixed(2));
    console.log('🌐 Using domain: fordago.site');

    // Test the email service with order details
    const response = await fetch('https://vpwskrytguoiybqrpebp.supabase.co/functions/v1/quick-processor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        orderId: orderId,
        customerName: customerName,
        customerEmail: customerEmail,
        status: 'verified',
        orderItems: orderItems,
        totalAmount: totalAmount
      })
    });

    const responseText = await response.text();
    console.log('📊 Response status:', response.status);
    console.log('📊 Response body:', responseText);

    if (response.ok) {
      console.log('✅ Modern email sent successfully!');
      console.log('📧 Check your email at:', customerEmail);
      console.log('📨 Email should be from: noreply@fordago.site');
      console.log('🎨 Features included:');
      console.log('  - Modern responsive design');
      console.log('  - Order items table');
      console.log('  - Total amount display');
      console.log('  - Status badge');
      console.log('  - Professional branding');
    } else {
      console.log('❌ Email sending failed');
    }

  } catch (err) {
    console.error('❌ Exception:', err);
  }
}

testModernEmail(); 