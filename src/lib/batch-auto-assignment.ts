import { supabase } from './supabase';
import { toast } from 'react-hot-toast';
import { GeneticRouteOptimizer, DeliveryLocation, optimizeAndAssignBatch } from './genetic-route-optimizer';

interface BatchData {
  id: string;
  total_weight: number;
  max_weight: number;
  status: string;
  driver_id: string | null;
  orders: any[];
}

// Check if a batch should be auto-assigned after order approval
export async function checkBatchAutoAssignment(orderId: string) {
  try {
    console.log(`Checking auto-assignment for order: ${orderId}`);
    
    // Get the order details including batch_id
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        batch_id,
        total_weight,
        delivery_address
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order || !order.batch_id) {
      console.log('Order not found or not assigned to batch yet');
      return;
    }

    console.log(`Order ${orderId} assigned to batch: ${order.batch_id}`);

    // Get the batch with all its orders
    const { data: batch, error: batchError } = await supabase
      .from('order_batches')
      .select(`
        id,
        total_weight,
        max_weight,
        status,
        driver_id
      `)
      .eq('id', order.batch_id)
      .single();

    if (batchError || !batch) {
      console.error('Batch not found:', batchError);
      return;
    }

    // Get all orders in this batch to calculate actual weight
    const { data: batchOrders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        total_weight,
        items:order_items(
          quantity,
          product:products(
            weight
          )
        )
      `)
      .eq('batch_id', batch.id)
      .eq('approval_status', 'approved');

    if (ordersError) {
      console.error('Error fetching batch orders:', ordersError);
      return;
    }

    // Calculate actual total weight from order items
    const actualWeight = calculateBatchWeight(batchOrders || []);
    console.log(`Batch ${batch.id} weight: ${actualWeight}kg / ${batch.max_weight || 3500}kg`);

    // Check if batch has reached 100% capacity threshold for auto-assignment
    const maxWeight = batch.max_weight || 3500;
    const capacityThreshold = maxWeight; // 100% capacity threshold (3500kg)
    const capacityPercentage = (actualWeight / maxWeight) * 100;
    
    if (actualWeight >= capacityThreshold && batch.status === 'pending' && !batch.driver_id) {
      console.log(`🚚 Batch ${batch.id} ready for auto-assignment at ${capacityPercentage.toFixed(1)}% capacity!`);
      await autoAssignBatch(batch.id, batchOrders || []);
    } else {
      console.log(`Batch not ready: Weight ${actualWeight}kg (${capacityPercentage.toFixed(1)}%) / ${maxWeight}kg (100% threshold: ${capacityThreshold}kg), Status: ${batch.status}`);
    }

  } catch (error) {
    console.error('Error in batch auto-assignment check:', error);
  }
}

// Calculate actual weight from order items
function calculateBatchWeight(orders: any[]): number {
  return orders.reduce((batchTotal, order) => {
    const orderWeight = (order.items || []).reduce((orderTotal: number, item: any) => {
      const itemWeight = (item.product?.weight || 0) * item.quantity;
      return orderTotal + itemWeight;
    }, 0);
    return batchTotal + orderWeight;
  }, 0);
}

// Auto-assign batch to available driver
async function autoAssignBatch(batchId: string, orders: any[]) {
  try {
    // Find available driver (not assigned to any active batch)
    const { data: drivers, error: driversError } = await supabase
      .from('profiles')
      .select(`
        id, 
        name,
        assigned_batches:order_batches!driver_id(
          id,
          status
        )
      `)
      .eq('role', 'driver');

    if (driversError) {
      console.error('Error finding drivers:', driversError);
      return;
    }

    if (!drivers || drivers.length === 0) {
      console.log('❌ No drivers found');
      toast.error('No drivers found in system');
      return;
    }

    // Filter for available drivers (not assigned to active batches)
    const availableDrivers = drivers.filter(driver => {
      const activeBatches = (driver.assigned_batches || []).filter((batch: any) => 
        batch.status === 'assigned' || batch.status === 'delivering'
      );
      return activeBatches.length === 0;
    });

    if (availableDrivers.length === 0) {
      console.log('❌ No available drivers for auto-assignment');
      toast.error('Batch ready but no drivers available');
      return;
    }

    const driver = availableDrivers[0];

    // Assign batch to driver
    const { error: assignError } = await supabase
      .from('order_batches')
      .update({ 
        driver_id: driver.id,
        status: 'assigned'
      })
      .eq('id', batchId);

    if (assignError) {
      console.error('Error assigning batch:', assignError);
      return;
    }

    // Update driver status (if you have this field)
    // await supabase
    //   .from('profiles')
    //   .update({ current_batch_id: batchId })
    //   .eq('id', driver.id);

    console.log(`✅ Batch ${batchId} auto-assigned to ${driver.name}`);
    
    // Show success message
    toast.success(`🚚 Batch auto-assigned to driver ${driver.name} at 100% capacity!`, {
      duration: 5000,
      icon: '🚚'
    });

    // Generate optimized route using genetic algorithm
    try {
      const deliveryLocations: DeliveryLocation[] = orders.map((order, index) => ({
        id: order.id,
        order_id: order.id,
        customer_name: 'Customer', // Would need to fetch from database
        address: order.delivery_address?.street_address || 'Unknown',
        barangay: order.delivery_address?.barangay || 'Unknown',
        latitude: order.delivery_address?.latitude || null,
        longitude: order.delivery_address?.longitude || null,
        phone: order.delivery_address?.phone,
        total: order.total || 0,
        delivery_status: 'pending',
        priority: 3 // Default priority
      }));

      // Run genetic algorithm optimization in background
      optimizeAndAssignBatch(batchId, deliveryLocations).catch(error => {
        console.error('Background route optimization failed:', error);
      });
      
    } catch (error) {
      console.error('Route optimization setup failed:', error);
    }
    
    console.log(`📍 ${orders.length} orders ready for delivery by ${driver.name} with genetic algorithm optimization`);
    
  } catch (error) {
    console.error('Error in auto-assignment:', error);
    toast.error('Failed to auto-assign batch');
  }
}

// Future: Route optimization placeholder
export async function generateOptimizedRoute(batchId: string) {
  // This is where you'd implement the genetic algorithm
  console.log(`🧬 Generating optimized route for batch ${batchId}...`);
  // Implementation would go here
}

// Future: Send route to driver mobile app
export async function notifyDriver(driverId: string, batchId: string) {
  // This would send push notification or websocket message to driver
  console.log(`📱 Notifying driver ${driverId} about batch ${batchId}`);
  // Implementation would go here
} 