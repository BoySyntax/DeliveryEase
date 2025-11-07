import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, cleanImageUrl } from '../../lib/utils';
import { Card, CardContent } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import { toast } from 'react-hot-toast';
import Select from '../../ui/components/Select';
import { Package, Users, MapPin, Weight, Truck, RefreshCw, Zap, AlertTriangle, Clock } from 'lucide-react';


interface OrderItem {
  quantity: number;
  price: number;
  product: {
    id: string;
    name: string;
    image_url: string | null;
    weight: number;
  } | null;
}

interface OrderData {
  id: string;
  created_at: string;
  customer_id: string;
  total: number;
  delivery_status: string;
  total_weight: number;
  delivery_address: {
    region: string;
    province: string;
    city: string;
    barangay: string;
    street_address: string;
    latitude?: number;
    longitude?: number;
  };
  customer: {
    id: string;
    name: string | null;
    avatar_url: string | null;
  } | null;
  items: OrderItem[];
}

interface BatchData {
  id: string;
  created_at: string;
  status: 'pending' | 'ready_for_delivery' | 'assigned' | 'delivering' | 'delivered' | 'merged' | 'in_transit' | 'cancelled';
  driver_id: string | null;
  barangay: string;
  batch_number: number;
  total_weight: number;
  max_weight: number;
  delivery_scheduled_date?: string | null;
  driver: {
    id: string;
    name: string | null;
  } | null;
  orders: OrderData[];
}


// Product Image component with error handling
function ProductImage({ imageUrl, productName }: { imageUrl: string | null | undefined, productName: string | null | undefined }) {
  const [imageError, setImageError] = useState(false);
  const cleanedUrl = cleanImageUrl(imageUrl);
  
  const handleImageError = () => {
    console.error('Product image failed to load:', cleanedUrl);
    setImageError(true);
  };

  if (!cleanedUrl || imageError) {
    return (
      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
        <Package className="w-5 h-5 text-gray-400" />
      </div>
    );
  }

  return (
    <img 
      src={cleanedUrl} 
      alt={productName || ''} 
      className="w-12 h-12 object-cover rounded-lg border border-gray-200"
      onError={handleImageError}
    />
  );
}

// Customer Avatar component
function CustomerAvatar({ avatarUrl, customerName }: { avatarUrl: string | null | undefined, customerName: string | null | undefined }) {
  const [imageError, setImageError] = useState(false);
  const cleanedUrl = cleanImageUrl(avatarUrl);
  
  const handleImageError = () => {
    setImageError(true);
  };

  if (!cleanedUrl || imageError) {
    const initials = customerName 
      ? customerName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
      : '?';
    
    return (
      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center border-2 border-gray-200 shadow-sm">
        <span className="text-base font-semibold text-white">{initials}</span>
      </div>
    );
  }

  return (
    <img 
      src={cleanedUrl} 
      alt={customerName || ''} 
      className="w-12 h-12 object-cover rounded-full border-2 border-gray-200 shadow-sm"
      onError={handleImageError}
    />
  );
}

export default function BatchOrdersPage() {
  const [batches, setBatches] = useState<BatchData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBarangay, setSelectedBarangay] = useState<string>('');
  const [merging, setMerging] = useState(false);

  // Helper function to calculate actual total weight from order items
  const calculateBatchWeight = (batch: BatchData): number => {
    return (batch.orders || []).reduce((batchTotal, order) => {
      const orderWeight = (order.items || []).reduce((orderTotal, item) => {
        const itemWeight = (item.product?.weight || 0) * item.quantity;
        return orderTotal + itemWeight;
      }, 0);
      return batchTotal + orderWeight;
    }, 0);
  };

  // Calculate distance between two coordinates
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Get average coordinates for a batch
  const getBatchCoordinates = (orders: any[]): { lat: number; lng: number } | null => {
    console.log('🔍 Checking orders for coordinates:', orders.map(o => ({
      id: o.id,
      hasLat: !!o.delivery_address?.latitude,
      hasLng: !!o.delivery_address?.longitude,
      lat: o.delivery_address?.latitude,
      lng: o.delivery_address?.longitude
    })));
    
    const validOrders = orders.filter(order => 
      order.delivery_address?.latitude && order.delivery_address?.longitude
    );
    
    console.log(`📍 Found ${validOrders.length} orders with valid coordinates out of ${orders.length} total orders`);
    
    if (validOrders.length === 0) return null;
    
    const avgLat = validOrders.reduce((sum, order) => 
      sum + parseFloat(order.delivery_address.latitude), 0) / validOrders.length;
    const avgLng = validOrders.reduce((sum, order) => 
      sum + parseFloat(order.delivery_address.longitude), 0) / validOrders.length;
    
    console.log(`📍 Calculated average coordinates for batch: ${avgLat}, ${avgLng}`);
    
    return { lat: avgLat, lng: avgLng };
  };

  // Check if two batches are close based on their delivery address coordinates
  const areBatchesClose = (batch1: any, batch2: any): { isClose: boolean; distance?: number } => {
    const coords1 = getBatchCoordinates(batch1.orders || []);
    const coords2 = getBatchCoordinates(batch2.orders || []);
    
    if (!coords1 || !coords2) {
      console.log(`❌ Missing coordinates for ${batch1.barangay} or ${batch2.barangay} - cannot merge without coordinates`);
      return { isClose: false };
    }
    
    const distance = calculateDistance(
      coords1.lat, coords1.lng,
      coords2.lat, coords2.lng
    );
    
    console.log(`📍 Distance between ${batch1.barangay} and ${batch2.barangay}: ${distance.toFixed(2)}km`);
    
    // Only merge if within 5km (strict geographic proximity)
    const isClose = distance <= 5.0;
    
    if (isClose) {
      console.log(`✅ ${batch1.barangay} and ${batch2.barangay} are close enough to merge (${distance.toFixed(2)}km)`);
    } else {
      console.log(`❌ ${batch1.barangay} and ${batch2.barangay} are too far apart to merge (${distance.toFixed(2)}km > 5km)`);
    }
    
    return { isClose, distance };
  };


  // Test batch merging functionality based on barangay proximity
  const testBatchMerging = async () => {
    setMerging(true);
    try {
      // Get all pending batches (let's see what we have first)
      const { data: allBatches, error: allBatchesError } = await supabase
        .from('order_batches')
        .select(`
          id,
          barangay,
          total_weight,
          status
        `)
        .order('created_at', { ascending: false });

      console.log('🔍 All batches in database:', allBatches?.map(b => ({
        id: b.id,
        barangay: b.barangay,
        weight: b.total_weight,
        status: b.status
      })));

      // Filter for batches that can be merged (pending or ready_for_delivery, under 5000kg)
      const mergeableBatches = allBatches?.filter(batch => 
        (batch.status === 'pending' || (batch.status as any) === 'ready_for_delivery') && 
        batch.total_weight < 5000 && // Changed from 3500 to 5000
        batch.total_weight > 0 &&
        batch.barangay &&
        !batch.barangay.startsWith('MERGED:') // Don't merge already marked-as-merged batches
      ) || [];
      
      console.log('🔍 Mergeable batches:', mergeableBatches.map(b => ({
        id: b.id,
        barangay: b.barangay,
        weight: b.total_weight,
        status: b.status
      })));

      if (allBatchesError) {
        console.error('Error fetching batches:', allBatchesError);
        toast.error('Failed to fetch batches');
        return;
      }

      if (!mergeableBatches || mergeableBatches.length === 0) {
        console.log('❌ No mergeable batches found');
        console.log('🔍 Available batch statuses:', [...new Set(allBatches?.map(b => b.status) || [])]);
        console.log('🔍 All batches details:', allBatches?.map(b => ({
          barangay: b.barangay,
          weight: b.total_weight,
          status: b.status
        })));
        toast.success('No batches need merging');
        return;
      }

      // Load orders for each batch separately (ONLY APPROVED ORDERS)
      const batchesWithOrders = await Promise.all(
        mergeableBatches.map(async (batch) => {
          const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select(`
              id, 
              delivery_address,
              total_weight,
              approval_status,
              items:order_items(
                quantity,
                product:products(weight)
              )
            `)
            .eq('batch_id', batch.id)
            .eq('approval_status', 'approved'); // ONLY approved orders

          if (ordersError) {
            console.error(`Error loading orders for batch ${batch.id}:`, ordersError);
            return { ...batch, orders: [] };
          }

          // Calculate actual weight from order items
          const actualWeight = (orders || []).reduce((total, order) => {
            const orderWeight = (order.items || []).reduce((sum: number, item: any) => {
              return sum + ((item.product?.weight || 0) * item.quantity);
            }, 0);
            return total + orderWeight;
          }, 0);

          console.log(`📊 Batch ${batch.id.slice(0,8)}: DB says ${batch.total_weight}kg, actual approved orders: ${actualWeight}kg (${orders?.length || 0} orders)`);

          return { ...batch, orders: orders || [], actualWeight };
        })
      );

      console.log(`🔍 Found ${batchesWithOrders.length} mergeable batches for merging:`, batchesWithOrders.map(b => ({
        id: b.id,
        barangay: b.barangay,
        dbWeight: b.total_weight,
        actualWeight: (b as any).actualWeight,
        ordersCount: b.orders.length,
        hasCoordinates: b.orders.some(o => (o.delivery_address as any)?.latitude && (o.delivery_address as any)?.longitude)
      })));

      const processedBatches = new Set<string>();

      // IMPROVED MERGING: Find all batches that should merge together as ONE group
      // Sort batches by weight descending (start with heaviest to build around it)
      const sortedBatches = [...batchesWithOrders].sort((a, b) => {
        const weightA = (a as any).actualWeight || a.total_weight;
        const weightB = (b as any).actualWeight || b.total_weight;
        return weightB - weightA;
      });

      console.log(`\n🔀 Sorted batches by weight (heaviest first):`, sortedBatches.map(b => ({
        barangay: b.barangay,
        weight: (b as any).actualWeight || b.total_weight,
        orders: b.orders.length
      })));

      // Group nearby batches together
      for (const batch of sortedBatches) {
        if (processedBatches.has(batch.id)) {
          console.log(`⏭️ Skipping ${batch.barangay} - already processed`);
          continue;
        }

        // Skip batches with merged barangay names but empty orders (corrupted state)
        if (batch.barangay && batch.barangay.includes('+') && batch.orders.length === 0) {
          console.log(`🗑️ Skipping corrupted batch ${batch.id} (${batch.barangay}) - has merged name but no orders, marking as merged`);
          await supabase
            .from('order_batches')
            .update({ status: 'merged' as any, total_weight: 0 })
            .eq('id', batch.id);
          processedBatches.add(batch.id);
          continue;
        }

        const batchActualWeight = (batch as any).actualWeight || batch.total_weight;
        
        console.log(`\n🔍 === Building merge group starting with batch ${batch.id.slice(0,8)} ===`);
        console.log(`📍 Barangay: ${batch.barangay}`);
        console.log(`⚖️  Actual Weight: ${batchActualWeight}kg`);
        console.log(`📦 Orders: ${batch.orders.length}`);

        // Find ALL nearby batches and add them ALL to this group (greedy approach)
        let totalWeight = batchActualWeight;
        const mergedBarangays = [batch.barangay];

        console.log(`🔍 Finding ALL nearby batches to merge together...`);

        // First pass: find all candidates
        const candidates = [];
        for (const otherBatch of sortedBatches) {
          if (otherBatch.id === batch.id || processedBatches.has(otherBatch.id)) {
            continue;
          }

          // Skip corrupted batches
          if (otherBatch.barangay && otherBatch.barangay.includes('+') && otherBatch.orders.length === 0) {
            continue;
          }

          const otherBatchActualWeight = (otherBatch as any).actualWeight || otherBatch.total_weight;
          const { isClose, distance } = areBatchesClose(batch, otherBatch);
          
          if (isClose && distance && distance <= 5) {
            candidates.push({
              batch: otherBatch,
              distance: distance,
              weight: otherBatchActualWeight
            });
            console.log(`📍 Found nearby: ${otherBatch.barangay} (${distance.toFixed(2)}km, ${otherBatchActualWeight}kg)`);
          }
        }

        // Sort candidates by distance (closest first)
        candidates.sort((a, b) => a.distance - b.distance);

        console.log(`\n📋 Found ${candidates.length} nearby batch(es) to potentially merge`);

        // Second pass: add ALL candidates that fit within capacity
        const nearbyBatches: any[] = [];
        for (const candidate of candidates) {
          const newTotalWeight = totalWeight + candidate.weight;
          
          if (newTotalWeight <= 5000) {
            nearbyBatches.push(candidate);
            totalWeight = newTotalWeight;
            mergedBarangays.push(candidate.batch.barangay);
            console.log(`✅ Adding ${candidate.batch.barangay} (${candidate.weight}kg) - Running total: ${totalWeight}kg`);
          } else {
            console.log(`⏭️  Skipping ${candidate.batch.barangay} (${candidate.weight}kg) - would exceed capacity (${newTotalWeight}kg > 5000kg)`);
          }
        }

        // Proceed with merge if we have at least one nearby batch OR if current batch is under 3500kg
        if (nearbyBatches.length > 0) {
          console.log(`\n✅ Will merge ${nearbyBatches.length + 1} batches together into ONE batch`);
          console.log(`📦 Total: ${nearbyBatches.length + 1} batches → ${batch.orders.length + nearbyBatches.reduce((sum, nb) => sum + nb.batch.orders.length, 0)} orders`);
          console.log(`⚖️  Total weight: ${totalWeight}kg`);
          
          const batchesToMerge = nearbyBatches;

          console.log(`\n🔄 === EXECUTING MERGE ===`);
          console.log(`📍 Main batch: ${batch.id.slice(0,8)} (${batch.barangay})`);
          console.log(`➕ Merging ${batchesToMerge.length} batch(es) into it`);
          console.log(`⚖️  Combined weight: ${totalWeight}kg`);
          console.log(`📦 New barangay name: ${mergedBarangays.join(' + ')}`);

          // Move orders from all merged batches to the main batch FIRST
          let movedOrdersCount = 0;
          const movedOrderIds = [];
          for (const nearbyBatch of batchesToMerge) {
            console.log(`\n🔄 Moving ${nearbyBatch.batch.orders.length} orders from ${nearbyBatch.batch.barangay}...`);
            
            const { data: movedOrders, error: moveError } = await supabase
              .from('orders')
              .update({ batch_id: batch.id })
              .eq('batch_id', nearbyBatch.batch.id)
              .eq('approval_status', 'approved') // Only move approved orders
              .select('id, total_weight');

            if (moveError) {
              console.error(`❌ Error moving orders from ${nearbyBatch.batch.barangay}:`, moveError);
              continue;
            }

            movedOrdersCount += movedOrders?.length || 0;
            movedOrderIds.push(...(movedOrders?.map(o => o.id) || []));
            console.log(`✅ Moved ${movedOrders?.length || 0} approved orders`);

            // Mark the merged batch as merged and processed
            const { error: updateMergedError } = await supabase
              .from('order_batches')
            .update({ 
              status: 'merged' as any,
              total_weight: 0,
              barangay: `MERGED: ${nearbyBatch.batch.barangay} → ${batch.barangay}`
            })
              .eq('id', nearbyBatch.batch.id);

            if (updateMergedError) {
              console.error(`❌ Error updating merged batch ${nearbyBatch.batch.barangay}:`, updateMergedError);
              continue;
            }
            console.log(`✅ Marked source batch as merged`);

            // IMPORTANT: Mark this batch as processed so it won't be considered again
            processedBatches.add(nearbyBatch.batch.id);
          }

          // NOW recalculate the actual combined weight from ALL orders in the main batch
          console.log(`\n📊 Recalculating final batch weight from all orders...`);
          const { data: allBatchOrders, error: recalcError } = await supabase
            .from('orders')
            .select(`
              id,
              total_weight,
              items:order_items(
                quantity,
                product:products(weight)
              )
            `)
            .eq('batch_id', batch.id)
            .eq('approval_status', 'approved');

          if (recalcError) {
            console.error('❌ Error recalculating batch weight:', recalcError);
          }

          const finalActualWeight = (allBatchOrders || []).reduce((total, order) => {
            const orderWeight = (order.items || []).reduce((sum: number, item: any) => {
              return sum + ((item.product?.weight || 0) * item.quantity);
            }, 0);
            return total + orderWeight;
          }, 0);

          console.log(`⚖️  Final recalculated weight: ${finalActualWeight}kg (${allBatchOrders?.length || 0} orders)`);

          // Update the main batch with correct weight
          const { error: updateError } = await supabase
            .from('order_batches')
            .update({ 
              total_weight: finalActualWeight, // Use recalculated weight
              barangay: mergedBarangays.join(' + ')
            })
            .eq('id', batch.id);

          if (updateError) {
            console.error('❌ Error updating main batch:', updateError);
            continue;
          }
          console.log(`✅ Updated main batch with correct weight and barangay name`);

          // IMPORTANT: Mark the main batch as processed
          processedBatches.add(batch.id);
          
          console.log(`\n✅ === MERGE COMPLETE ===`);
          console.log(`📦 Merged ${mergedBarangays.length} barangays into ONE batch ${batch.id.slice(0,8)}`);
          console.log(`📊 Total orders in final batch: ${allBatchOrders?.length || 0}`);
          console.log(`⚖️  Final weight: ${finalActualWeight}kg`);
          
          toast.success(`🎉 Merged ${mergedBarangays.length} barangays into ONE batch - ${allBatchOrders?.length || 0} orders, ${finalActualWeight}kg`);
        } else {
          console.log(`\n❌ No nearby batches found for ${batch.barangay}`);
          console.log(`📍 This batch remains standalone (${batchActualWeight}kg, ${batch.orders.length} orders)`);
          // Mark as processed even if not merged
          processedBatches.add(batch.id);
        }
      }

      // FIX CORRUPTED BATCHES: Recalculate weights for all batches
      console.log(`\n🔧 === FIXING CORRUPTED BATCH WEIGHTS ===`);
      const { data: allActiveBatches } = await supabase
        .from('order_batches')
        .select('id, barangay, total_weight, status')
        .in('status', ['pending', 'ready_for_delivery', 'assigned', 'delivering'] as any);

      if (allActiveBatches) {
        for (const batch of allActiveBatches) {
          // Get approved orders for this batch
          const { data: batchOrders } = await supabase
            .from('orders')
            .select(`
              id,
              items:order_items(
                quantity,
                product:products(weight)
              )
            `)
            .eq('batch_id', batch.id)
            .eq('approval_status', 'approved');

          if (batchOrders) {
            const actualWeight = batchOrders.reduce((total, order) => {
              const orderWeight = (order.items || []).reduce((sum: number, item: any) => {
                return sum + ((item.product?.weight || 0) * item.quantity);
              }, 0);
              return total + orderWeight;
            }, 0);

            if (actualWeight !== batch.total_weight) {
              console.log(`🔧 Fixing batch ${batch.id.slice(0,8)} (${batch.barangay}): DB=${batch.total_weight}kg → Actual=${actualWeight}kg`);
              await supabase
                .from('order_batches')
                .update({ total_weight: actualWeight })
                .eq('id', batch.id);
            }
          }
        }
        console.log(`✅ Batch weight validation complete`);
      }

      // Only mark batches that are 3500kg+ as ready for delivery
      const { data: remainingBatches } = await supabase
        .from('order_batches')
        .select('id, barangay, total_weight')
        .eq('status', 'pending');

      if (remainingBatches) {
        for (const batch of remainingBatches) {
          // Only mark as ready for delivery if weight is 3500kg or more
          if (batch.total_weight >= 3500) {
            const { error: updateError } = await supabase
              .from('order_batches')
              .update({ status: 'ready_for_delivery' as any })
              .eq('id', batch.id);

            if (!updateError) {
              // Auto-assign to driver if batch is ready
              await autoAssignBatchToDriver(batch.id);
              
            }
          } else {
            // Keep small batches as pending
          }
        }
      }

      // Reload batch data after merging
      await refreshData();
      
      toast.success('Batch merging and validation completed!');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to merge batches');
    } finally {
      setMerging(false);
    }
  };

  // Auto-assign batch to available driver (daily assignment system)
  const autoAssignBatchToDriver = async (batchId: string) => {
    try {
      console.log(`🔄 Attempting to auto-assign batch ${batchId}...`);
      
      // First check if batch has weight > 0
      const { data: batchData, error: batchError } = await supabase
        .from('order_batches')
        .select('total_weight, barangay')
        .eq('id', batchId)
        .single();

      if (batchError || !batchData) {
        console.error('Error fetching batch data:', batchError);
        return;
      }

      if (batchData.total_weight <= 0) {
        console.log(`❌ Batch ${batchId} has no weight (${batchData.total_weight}kg) - cannot assign`);
        return;
      }

      if (!batchData.barangay) {
        console.log(`❌ Batch ${batchId} has no barangay - cannot assign`);
        return;
      }
      
      // Check if it's a new day (8 AM reset)
      const now = new Date();
      const today = now.toISOString().split('T')[0]; // YYYY-MM-DD format
      const currentHour = now.getHours();
      
      console.log(`📅 Current date: ${today}, Current hour: ${currentHour}`);
      
      // Find all drivers
      const { data: drivers, error: driversError } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('role', 'driver');

      if (driversError) {
        console.error('Error fetching drivers:', driversError);
        return;
      }

      if (!drivers || drivers.length === 0) {
        console.log('❌ No drivers found for auto-assignment');
        return;
      }

      // Get drivers who already have batches assigned TODAY
      const { data: todayBatches, error: todayError } = await supabase
        .from('order_batches')
        .select('driver_id, created_at')
        .in('status', ['assigned', 'delivering'])
        .not('driver_id', 'is', null)
        .gte('created_at', `${today}T00:00:00`) // From start of today
        .lt('created_at', `${today}T23:59:59`); // Until end of today

      if (todayError) {
        console.error('Error fetching today\'s batches:', todayError);
        return;
      }

      const assignedTodayDriverIds = new Set(todayBatches?.map(batch => batch.driver_id) || []);
      console.log(`👥 Drivers already assigned today: ${Array.from(assignedTodayDriverIds).length}/${drivers.length}`);
      
      // Find first available driver (not assigned today)
      const availableDriver = drivers.find(driver => !assignedTodayDriverIds.has(driver.id));

      if (!availableDriver) {
        console.log('❌ No available drivers for today - all drivers already have batches assigned');
        console.log('📅 Next assignment will be available tomorrow at 8 AM');
        return;
      }

      console.log(`✅ Found available driver for today: ${availableDriver.name}`);

      // Assign batch to driver
      const { error: assignError } = await supabase
        .from('order_batches')
        .update({ 
          driver_id: availableDriver.id,
          status: 'assigned'
        })
        .eq('id', batchId);

      if (assignError) {
        console.error('Error assigning batch:', assignError);
        return;
      }

      console.log(`✅ Batch ${batchId} successfully auto-assigned to ${availableDriver.name} for today`);
      
      // Show success notification
      toast.success(`🚚 Batch assigned to ${availableDriver.name} for today!`, {
        duration: 3000
      });
      
    } catch (error) {
      console.error('Error in auto-assignment:', error);
    }
  };


  // Auto-assign batches that reach their minimum threshold (3500kg)
  const checkAndAutoAssignBatches = async (batches: BatchData[]) => {
    const batchesToAssign = batches.filter(batch => {
      const weight = calculateBatchWeight(batch);
      const minWeight = 3500; // Minimum threshold for auto-assignment
      return weight >= minWeight && (batch.status === 'pending' || batch.status === 'ready_for_delivery') && !batch.driver_id;
    });

    if (batchesToAssign.length === 0) return;

    console.log(`🚚 Found ${batchesToAssign.length} batch(es) ready for auto-assignment`);

    for (const batch of batchesToAssign) {
      await autoAssignBatchToDriver(batch.id);
    }
  };


  useEffect(() => {
    loadData();
  }, [selectedBarangay]);

  // Auto-refresh every 10 seconds to catch auto-assignments
  useEffect(() => {
    const interval = setInterval(() => {
      refreshData();
    }, 10000);

    return () => clearInterval(interval);
  }, [selectedBarangay]);

  // Check for 8 AM daily reset
  useEffect(() => {
    const checkDailyReset = () => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      
      // Check if it's 8:00 AM
      if (currentHour === 8 && currentMinute === 0) {
        console.log('🕗 8:00 AM - Daily driver assignment reset!');
        toast.success('🕗 Daily driver assignment reset at 8:00 AM!', {
          duration: 5000
        });
        // Refresh data to show updated assignments
        refreshData();
      }
    };

    // Check every minute for 8 AM reset
    const resetInterval = setInterval(checkDailyReset, 60000);
    
    return () => clearInterval(resetInterval);
  }, []);

  async function refreshData() {
    try {
      setRefreshing(true);
      await loadDataCore();
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      await loadDataCore();
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }

  async function loadDataCore() {
      // Load all batches including merged ones (exclude only delivered batches)
      const { data: batchData, error: batchError } = await supabase
        .from('order_batches')
        .select(`
          *,
          driver:profiles!order_batches_driver_id_fkey(
            id,
            name
          )
        `)
        .in('status', ['pending', 'assigned', 'delivering', 'ready_for_delivery', 'merged', 'in_transit', 'cancelled'] as any)
        .order('created_at', { ascending: false });

      if (batchError) throw batchError;

      // Load orders with minimal data first - much faster
      const batchIds = (batchData || []).map(batch => batch.id);
      
      // Debug: Log batch IDs to check for malformed IDs
      console.log('🔍 Batch IDs for orders query:', batchIds);
      
      let ordersData: any[] = [];
      if (batchIds.length > 0) {
        // Filter out any invalid batch IDs
        const validBatchIds = batchIds.filter(id => 
          id && typeof id === 'string' && id.length > 0 && !id.includes(':')
        );
        
        console.log(`🔍 Valid batch IDs: ${validBatchIds.length}/${batchIds.length}`);
        
        if (validBatchIds.length > 0) {
          const { data, error: ordersError } = await supabase
            .from('orders')
            .select(`
              id,
              created_at,
              customer_id,
              total,
              delivery_status,
              total_weight,
              delivery_address,
              batch_id,
              customer:profiles!orders_customer_id_fkey(
                id,
                name,
                avatar_url
              ),
              items:order_items(
                quantity,
                price,
                product:products(
                  id,
                  name,
                  image_url,
                  weight
                )
              )
            `)
            .in('batch_id', validBatchIds)
            .not('batch_id', 'is', null)
            .eq('approval_status', 'approved');

          if (ordersError) {
            console.error('❌ Orders query error:', ordersError);
            console.error('❌ Query details:', {
              batchIds: validBatchIds,
              batchIdsLength: validBatchIds.length,
              firstBatchId: validBatchIds[0],
              lastBatchId: validBatchIds[validBatchIds.length - 1]
            });
            throw ordersError;
          }
          ordersData = data || [];
        } else {
          console.warn('⚠️ No valid batch IDs found, skipping orders query');
        }
      }

      // Combine the data and check for completed batches
      const transformedBatches = (batchData || [])
        .map((batch: any, index) => {
          const batchOrders = ordersData.filter(order => order.batch_id === batch.id);
          
          return {
            ...batch,
            batch_number: index + 1,
            barangay: batch.barangay || 'Unknown',
            delivery_scheduled_date: batch.delivery_scheduled_date || null,
            driver: null,
            orders: batchOrders.map((order: any) => ({
              ...order,
              delivery_address: order.delivery_address || {
                region: '',
                province: '',
                city: '',
                barangay: batch.barangay || '',
                street_address: ''
              },
              items: order.items || []
            }))
          } as BatchData;
        })
        // FILTER OUT EMPTY BATCHES (no orders or 0 weight)
        .filter(batch => {
          const hasOrders = batch.orders && batch.orders.length > 0;
          const hasWeight = batch.total_weight > 0;
          return hasOrders && hasWeight;
        });

      // Check for batches where all orders are delivered and update batch status
      const batchesToUpdate = [];
      for (const batch of transformedBatches) {
        if (batch.orders && batch.orders.length > 0) {
          const allOrdersDelivered = batch.orders.every(order => order.delivery_status === 'delivered');
          if (allOrdersDelivered && batch.status !== 'delivered') {
            batchesToUpdate.push(batch.id);
          }
        }
      }

      // Update batch statuses for completed batches
      if (batchesToUpdate.length > 0) {
        console.log(`🔄 Updating ${batchesToUpdate.length} completed batch(es) to delivered status`);
        const { error: updateError } = await supabase
          .from('order_batches')
          .update({ status: 'delivered' })
          .in('id', batchesToUpdate);

        if (updateError) {
          console.error('Error updating batch statuses:', updateError);
        } else {
          console.log(`✅ Updated ${batchesToUpdate.length} batch(es) to delivered status`);
        }
      }

      // Filter batches by barangay if selected and exclude batches where all orders are delivered
      const filteredBatches = transformedBatches.filter(batch => {
        // Filter by barangay if selected
        if (selectedBarangay && batch.barangay !== selectedBarangay) {
          return false;
        }
        
        // Exclude only batches where all orders are delivered (these should not show in admin interface)
        if (batch.orders && batch.orders.length > 0) {
          const allOrdersDelivered = batch.orders.every(order => order.delivery_status === 'delivered');
          if (allOrdersDelivered && batch.status !== 'merged') {
            return false; // Don't show completed batches in admin interface (except merged ones)
          }
        }
        
        // Show all other batches including merged ones
        return true;
      });

      // Debug log to check data
      console.log('Batch data:', filteredBatches);
      setBatches(filteredBatches);

      // Check for auto-assignment opportunities immediately
      await checkAndAutoAssignBatches(filteredBatches);
      
      // Also check for any batches that should be auto-assigned but weren't caught
      const readyBatches = filteredBatches.filter(batch => {
        const weight = calculateBatchWeight(batch);
        return weight >= 3500 && (batch.status === 'pending' || batch.status === 'ready_for_delivery') && !batch.driver_id;
      });
      
      if (readyBatches.length > 0) {
        console.log(`🚨 Found ${readyBatches.length} batch(es) that should be auto-assigned immediately`);
        for (const batch of readyBatches) {
          await autoAssignBatchToDriver(batch.id);
        }
      }
  }


  // Get unique barangays from batches
  const barangays = [...new Set(
    batches.map(batch => batch.barangay)
    .filter((barangay): barangay is string => barangay !== undefined && barangay !== null && barangay !== '')
  )];





  if (loading) {
    return <Loader label="Loading order batches..." />;
  }


  return (
    <div className="space-y-6 relative">
      {refreshing && (
        <div className="absolute top-0 left-0 right-0 z-10 bg-primary-50 border border-primary-200 rounded-lg p-2 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-primary-600" />
          <span className="text-sm text-primary-700 font-medium">Updating batch data...</span>
        </div>
      )}
      







      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Order Batches</h1>
          <p className="text-gray-600 mt-1">Manage delivery batches grouped by location</p>
          <div className="mt-2 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-gray-600">Daily Assignment System</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <span className="text-gray-600">Resets every 8:00 AM</span>
            </div>
          </div>
        </div>
                <div className="flex gap-4">
                <button
                    onClick={testBatchMerging}
                    disabled={merging}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Truck className="w-4 h-4" />
                    {merging ? 'Merging...' : 'Merge Orders'}
                </button>
                <Select
                    options={[
                    { value: '', label: 'All Barangays' },
                    ...barangays.map(barangay => ({
                        value: barangay,
                        label: barangay
                    }))
                    ]}
                    value={selectedBarangay}
                    onChange={(e) => setSelectedBarangay(e.target.value)}
                    className="w-48"
                />
                </div>
      </div>


      <div className="grid gap-6">
        {batches.map((batch) => (
          <Card key={batch.id} className={`overflow-hidden shadow-lg ${batch.status === 'merged' ? 'opacity-75 border-purple-200' : ''}`}>
            <CardContent className="p-0">
              {/* Batch Header */}
              <div className="bg-gradient-to-r from-primary-50 to-primary-100 p-6 border-b border-gray-200">
                <div className="flex justify-between items-start">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary-100 p-2 rounded-lg">
                        <Truck className="w-5 h-5 text-primary-600" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900">
                          Batch {batch.batch_number}
                        </h2>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                            <MapPin className="w-4 h-4 mr-1" />
                            {batch.barangay}
                          </span>
                          {batch.status === 'ready_for_delivery' && calculateBatchWeight(batch) >= 3500 && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                              <Zap className="w-4 h-4 mr-1" />
                              Ready for Assignment
                            </span>
                          )}
                          {batch.status === 'pending' && calculateBatchWeight(batch) < 3500 && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                              <Clock className="w-4 h-4 mr-1" />
                              Waiting for More Orders
                            </span>
                          )}
                          {batch.status === 'assigned' && batch.driver_id && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                              <Users className="w-4 h-4 mr-1" />
                              Assigned to Driver (Today)
                            </span>
                          )}
                          {batch.status === 'assigned' && !batch.driver_id && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
                              <Clock className="w-4 h-4 mr-1" />
                              Ready for Assignment
                            </span>
                          )}
                          {batch.status === 'ready_for_delivery' && !batch.driver_id && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                              <Clock className="w-4 h-4 mr-1" />
                              Waiting for Tomorrow (8 AM)
                            </span>
                          )}
                          {batch.status === 'delivering' && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                              <Truck className="w-4 h-4 mr-1" />
                              Out for Delivery
                            </span>
                          )}
                          {batch.status === 'merged' && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                              <Package className="w-4 h-4 mr-1" />
                              Merged
                            </span>
                          )}
                          {batch.barangay.includes('+') && batch.status !== 'merged' && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
                              <MapPin className="w-4 h-4 mr-1" />
                              Merged Barangays
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Package className="w-4 h-4" />
                        <span>{batch.orders?.length || 0} Orders</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Weight className="w-4 h-4" />
                        <span>{batch.status === 'merged' ? '0 kg (Merged)' : `${calculateBatchWeight(batch).toFixed(2)} kg`}</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-gray-500">
                        Created: {new Date(batch.created_at).toLocaleString()}
                      </p>
                      {batch.delivery_scheduled_date && (
                        <p className="text-xs text-blue-600 font-medium">
                          📅 Delivery: {new Date(batch.delivery_scheduled_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    {/* Weight Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Total Weight</span>
                        <span className="text-sm font-bold text-gray-900">
                          {calculateBatchWeight(batch).toFixed(2)} / {batch.max_weight || 3500} kg
                        </span>
                      </div>
                      
                      {/* Progress Bar like the image */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-gray-200 rounded-full h-6 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-700 ease-out ${
                              calculateBatchWeight(batch) >= (batch.max_weight || 3500)
                                ? 'bg-purple-500 animate-pulse' 
                                : (calculateBatchWeight(batch) / (batch.max_weight || 3500)) > 0.9 
                                  ? 'bg-red-500' 
                                  : (calculateBatchWeight(batch) / (batch.max_weight || 3500)) > 0.7 
                                    ? 'bg-yellow-500' 
                                    : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min((calculateBatchWeight(batch) / (batch.max_weight || 3500)) * 100, 100)}%` }}
                          ></div>
                        </div>
                        <span className={`text-sm font-bold min-w-[3rem] ${
                          calculateBatchWeight(batch) >= (batch.max_weight || 3500)
                            ? 'text-purple-600 animate-pulse' 
                            : (calculateBatchWeight(batch) / (batch.max_weight || 3500)) > 0.9 
                              ? 'text-red-600' 
                              : (calculateBatchWeight(batch) / (batch.max_weight || 3500)) > 0.7 
                                ? 'text-yellow-600' 
                                : 'text-primary-600'
                        }`}>
                          {((calculateBatchWeight(batch) / (batch.max_weight || 3500)) * 100).toFixed(0)}%
                        </span>
                      </div>
                      
                      {/* Capacity Status */}
                      {calculateBatchWeight(batch) >= 3500 && batch.status === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                            <Zap className="w-3 h-3" />
                            READY FOR ASSIGNMENT (3500kg+)
                          </div>
                        </div>
                      ) : calculateBatchWeight(batch) >= 3500 && batch.status !== 'pending' ? (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                            <Truck className="w-3 h-3" />
                            BATCH IN PROGRESS
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="text-xs text-gray-500">
                            {((batch.max_weight || 3500) - calculateBatchWeight(batch)).toFixed(2)} kg remaining capacity
                          </div>
                          {((batch.max_weight || 3500) - calculateBatchWeight(batch)) < 50 && (
                            <div className="flex items-center gap-1 bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">
                              <AlertTriangle className="w-3 h-3" />
                              NEAR CAPACITY - Next order will create new batch
                            </div>
                          )}

                        </div>
                      )}
                    </div>
                  </div>



                  {batch.driver?.name && (
                    <div className="flex items-center gap-2 bg-primary-100 px-3 py-2 rounded-lg">
                      <Users className="w-4 h-4 text-primary-600" />
                      <span className="text-sm font-medium text-primary-800">
                        Driver: {batch.driver.name}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Orders List */}
              <div className="divide-y divide-gray-100">
                {(batch.orders || []).map((order) => (
                  <div key={order.id} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="space-y-4">
                      {/* Order Header */}
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <div className="relative group">
                            <CustomerAvatar 
                              avatarUrl={order.customer?.avatar_url} 
                              customerName={order.customer?.name} 
                            />
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                              {order.customer?.name || 'Unknown Customer'}
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">
                                Order #{order.id.slice(0, 8)}
                              </span>
                              <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                                {order.delivery_status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600">
                              {order.customer?.name}
                            </p>
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <MapPin className="w-3 h-3" />
                              <span>
                                {order.delivery_address.street_address}, {order.delivery_address.barangay}
                              </span>
                            </div>
                          </div>
                        </div>
                                                  <div className="text-right">
                            <p className="text-lg font-semibold text-primary-600">
                              {formatCurrency(order.total)}
                            </p>
                            <div className="flex items-center gap-1 text-sm text-gray-500">
                              <Weight className="w-3 h-3" />
                              <span>{order.total_weight.toFixed(2)} kg</span>
                            </div>
                          </div>
                      </div>

                      {/* Order Items */}
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-gray-700">Order Items:</h4>
                        {order.items && order.items.length > 0 ? (
                          <div className="grid gap-2">
                            {order.items.map((item, index) => (
                              <div key={index} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100">
                                <ProductImage 
                                  imageUrl={item.product?.image_url} 
                                  productName={item.product?.name} 
                                />
                                <div className="flex-1">
                                  <p className="font-medium text-gray-900">
                                    {item.product?.name || 'Unknown Product'}
                                  </p>
                                  <div className="flex items-center gap-4 text-sm text-gray-600">
                                    <span>Qty: {item.quantity}</span>
                                    <span>Price: {formatCurrency(item.price)}</span>
                                    {item.product?.weight && (
                                      <span>Weight: {(item.product.weight * item.quantity).toFixed(2)} kg</span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="font-medium text-gray-900">
                                    {formatCurrency(item.price * item.quantity)}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-yellow-600" />
                              <span className="text-sm text-yellow-800">
                                No order items found. This order may need to be fixed in the database.
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Batch Summary */}
              <div className="bg-gray-50 px-6 py-4 border-t">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">
                        Total Orders: {batch.orders?.length || 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Weight className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">
                        Total Weight: {calculateBatchWeight(batch).toFixed(2)} kg
                      </span>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-primary-600">
                    {formatCurrency((batch.orders || []).reduce((sum, order) => sum + order.total, 0))}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {batches.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <Truck className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No order batches found</h3>
              <p className="text-gray-600">
                {selectedBarangay 
                  ? `No pending batches found for ${selectedBarangay}`
                  : 'No pending order batches available'
                }
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
} 