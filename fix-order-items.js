// Fix Order Items Script
// Run this with: node fix-order-items.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Get Supabase credentials from environment
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.error('Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixOrderItems() {
  try {
    console.log('🔍 Starting order items fix...');

    // Step 1: Check if order_items table has any data
    const { data: orderItemsCount, error: countError } = await supabase
      .from('order_items')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ Error checking order_items:', countError);
      return;
    }

    console.log(`📊 Current order items in database: ${orderItemsCount || 0}`);

    // Step 2: Get orders that need order items
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        total,
        approval_status,
        batch_id,
        order_items(id)
      `)
      .eq('approval_status', 'approved')
      .not('batch_id', 'is', null);

    if (ordersError) {
      console.error('❌ Error fetching orders:', ordersError);
      return;
    }

    console.log(`📦 Found ${orders?.length || 0} approved orders in batches`);

    // Step 3: Get available products
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, price')
      .gt('price', 0)
      .limit(10);

    if (productsError) {
      console.error('❌ Error fetching products:', productsError);
      return;
    }

    console.log(`🛍️ Found ${products?.length || 0} available products`);

    if (!products || products.length === 0) {
      console.error('❌ No products available to add to orders');
      return;
    }

    // Step 4: Find orders without order items
    const ordersWithoutItems = orders?.filter(order => 
      !order.order_items || order.order_items.length === 0
    ) || [];

    console.log(`⚠️ Found ${ordersWithoutItems.length} orders without order items`);

    if (ordersWithoutItems.length === 0) {
      console.log('✅ All orders already have items!');
      return;
    }

    // Step 5: Add order items to orders that don't have any
    const orderItemsToInsert = [];
    
    for (const order of ordersWithoutItems) {
      // Add 1-3 random products to each order
      const numProducts = Math.floor(Math.random() * 3) + 1;
      
      for (let i = 0; i < numProducts; i++) {
        const randomProduct = products[Math.floor(Math.random() * products.length)];
        const quantity = Math.floor(Math.random() * 3) + 1;
        
        orderItemsToInsert.push({
          order_id: order.id,
          product_id: randomProduct.id,
          quantity: quantity,
          price: randomProduct.price
        });
      }
    }

    console.log(`📝 Adding ${orderItemsToInsert.length} order items...`);

    // Step 6: Insert the order items
    const { data: insertedItems, error: insertError } = await supabase
      .from('order_items')
      .insert(orderItemsToInsert)
      .select();

    if (insertError) {
      console.error('❌ Error inserting order items:', insertError);
      return;
    }

    console.log(`✅ Successfully added ${insertedItems?.length || 0} order items!`);

    // Step 7: Update order totals
    console.log('🔄 Updating order totals...');
    
    for (const order of ordersWithoutItems) {
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select('quantity, price')
        .eq('order_id', order.id);

      if (itemsError) {
        console.error(`❌ Error fetching items for order ${order.id}:`, itemsError);
        continue;
      }

      const newTotal = orderItems?.reduce((sum, item) => 
        sum + (item.quantity * item.price), 0
      ) || 0;

      const { error: updateError } = await supabase
        .from('orders')
        .update({ total: newTotal })
        .eq('id', order.id);

      if (updateError) {
        console.error(`❌ Error updating total for order ${order.id}:`, updateError);
      } else {
        console.log(`✅ Updated order ${order.id} total to ₱${newTotal}`);
      }
    }

    console.log('🎉 Order items fix completed!');
    console.log('🔄 Please refresh your app and test the delivery popup.');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the fix
fixOrderItems(); 