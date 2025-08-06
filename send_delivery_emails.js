// Test script to send delivery emails for existing orders
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vpwskrytguoiybqrpebp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwd3Nrcnl0Z3VvaXlicXJwZWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc0NjY3MDMsImV4cCI6MjA2MzA0MjcwM30.-kdF6gL8ffsENAMCRXpr8wtnQoNG1JS5LDcEeHqYrkc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function sendDeliveryEmails() {
  console.log('🚀 Starting delivery email sending process...');
  
  try {
    // Get all orders with delivery status
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        customer_id,
        total,
        delivery_status,
        items:order_items(
          quantity,
          price,
          product:products(
            name
          )
        ),
        customer:profiles!orders_customer_id_fkey(
          name,
          email
        )
      `)
      .in('delivery_status', ['out_for_delivery', 'delivering']);

    if (error) {
      console.error('❌ Error fetching orders:', error);
      return;
    }

    console.log(`📦 Found ${orders?.length || 0} orders with delivery status`);

    if (!orders || orders.length === 0) {
      console.log('❌ No orders found with delivery status');
      return;
    }

    let successCount = 0;
    let failedCount = 0;

    // Send emails for each order
    for (const order of orders) {
      console.log(`📧 Processing order ${order.id.slice(0, 8)} for ${order.customer?.name || 'Unknown'}`);
      
      if (!order.customer?.email) {
        console.log(`❌ No email found for customer ${order.customer?.name || 'Unknown'}`);
        failedCount++;
        continue;
      }

      // Prepare order items
      const orderItems = order.items?.map(item => ({
        productName: item.product?.name || 'Unknown Product',
        quantity: item.quantity,
        price: item.price
      })) || [];

      // Calculate estimated delivery date
      const estimatedDeliveryDate = new Date();
      estimatedDeliveryDate.setDate(estimatedDeliveryDate.getDate() + 1);
      const formattedDate = estimatedDeliveryDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });

      try {
        // Send email via quick-processor
        const response = await fetch('https://vpwskrytguoiybqrpebp.supabase.co/functions/v1/quick-processor', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({
            orderId: order.id,
            customerName: order.customer.name || 'Customer',
            customerEmail: order.customer.email,
            status: 'out_for_delivery',
            estimatedDeliveryDate: formattedDate,
            orderItems,
            totalAmount: order.total
          })
        });

        const responseData = await response.text();
        console.log(`📊 Response for order ${order.id.slice(0, 8)}:`, response.status, responseData);

        if (response.ok) {
          console.log(`✅ Email sent successfully for order ${order.id.slice(0, 8)}`);
          successCount++;
        } else {
          console.log(`❌ Failed to send email for order ${order.id.slice(0, 8)}`);
          failedCount++;
        }

        // Add delay between emails
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (emailError) {
        console.error(`❌ Error sending email for order ${order.id.slice(0, 8)}:`, emailError);
        failedCount++;
      }
    }

    console.log(`\n📊 Final Results:`);
    console.log(`✅ Successfully sent: ${successCount} emails`);
    console.log(`❌ Failed to send: ${failedCount} emails`);
    console.log(`📧 Total processed: ${orders.length} orders`);

  } catch (error) {
    console.error('❌ Error in sendDeliveryEmails:', error);
  }
}

// Run the function
sendDeliveryEmails(); 