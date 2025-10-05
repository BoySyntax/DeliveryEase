import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import { formatCurrency } from '../../lib/utils';
import { 
  Package, 
  CheckCircle, 
  Clock, 
  MapPin, 
  Truck, 
  Route,
  Users,
  Weight,
  TrendingUp,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { useProfile } from '../../lib/auth';
import { toast } from 'react-hot-toast';
import { directEmailService } from '../../lib/directEmailService';

interface BatchStats {
  assignedBatches: number;
  activeBatches: number;
  completedBatches: number;
  totalEarnings: number;
  currentBatch?: {
    id: string;
    total_weight: number;
    order_count: number;
    estimated_duration: string;
    status: string;
  };
}

interface ActiveBatch {
  id: string;
  created_at: string;
  total_weight: number;
  max_weight: number;
  status: string;
  estimated_duration: string;
  orders: Array<{
    id: string;
    total: number;
    delivery_address: {
      full_name: string;
      phone: string;
      street_address: string;
    } | null;
    customer: {
      id: string;
      name: string | null;
    } | null;
    items?: Array<{
      quantity: number;
      price: number;
      product: {
        name: string;
        image_url?: string;
        weight: number;
      } | null;
    }>;
  }>;
}

interface CompletedBatch {
  id: string;
  created_at: string;
  completed_at?: string;
  total_weight: number;
  max_weight: number;
  status: string;
  orders: Array<{
    id: string;
    total: number;
    delivery_status: string;
    delivery_address: {
      full_name: string;
      phone: string;
      street_address: string;
    } | null;
    customer: {
      id: string;
      name: string | null;
    } | null;
    items?: Array<{
      quantity: number;
      price: number;
      product: {
        name: string;
        image_url?: string;
        weight: number;
      } | null;
    }>;
  }>;
}

export default function DashboardPage() {
  const { profile } = useProfile();
  const navigate = useNavigate();
  const [stats, setStats] = useState<BatchStats | null>(null);
  const [activeBatch, setActiveBatch] = useState<ActiveBatch | null>(null);
  const [recentCompletedBatch, setRecentCompletedBatch] = useState<CompletedBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastNotificationTime, setLastNotificationTime] = useState<number>(0);
  const [isSendingRescue, setIsSendingRescue] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      loadDashboardData();
      
      // Smart polling - only when needed
      const interval = setInterval(() => {
        checkForNewAssignments();
        checkForBatchCompletion();
        // Only refresh if there's an active batch
        if (activeBatch) {
          loadDashboardData();
        }
      }, 60000); // Check every 60 seconds - much less frequent

      return () => clearInterval(interval);
    }
  }, [profile?.id]);

  async function loadDashboardData() {
    try {
      if (!profile?.id) return;

      // Auto-fix any stuck batch statuses first
      await autoFixStuckBatches();

      // Load batch statistics
      await Promise.all([
        loadBatchStats(),
        loadActiveBatch(),
        loadRecentCompletedBatch()
      ]);

    } catch (error) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  async function autoFixStuckBatches() {
    if (!profile?.id) return;

    try {
      console.log('🔧 Auto-fixing stuck batch statuses...');
      
      // Find batches that are still "delivering" but have all orders delivered
      const { data: stuckBatches, error: batchError } = await supabase
        .from('order_batches')
        .select('id')
        .eq('driver_id', profile.id)
        .eq('status', 'delivering');

      if (batchError) {
        console.error('Error finding stuck batches:', batchError);
        return;
      }

      if (!stuckBatches || stuckBatches.length === 0) {
        console.log('✅ No stuck batches found');
        return;
      }

      let fixedCount = 0;
      for (const batch of stuckBatches) {
        // Check if all orders in this batch are delivered
        const { data: orders, error: ordersError } = await supabase
          .from('orders')
          .select('delivery_status')
          .eq('batch_id', batch.id)
          .eq('approval_status', 'approved');

        if (ordersError) continue;

        const allDelivered = orders?.every(order => order.delivery_status === 'delivered');
        
        if (allDelivered && orders.length > 0) {
          // Update batch status to delivered
          const { error: updateError } = await supabase
            .from('order_batches')
            .update({ status: 'delivered' })
            .eq('id', batch.id);

          if (!updateError) {
            fixedCount++;
            console.log(`✅ Fixed batch ${batch.id.slice(0, 8)}`);
          }
        }
      }

      if (fixedCount > 0) {
        console.log(`🎉 Auto-fixed ${fixedCount} stuck batch(es)`);
      }
    } catch (error) {
      console.error('Error auto-fixing stuck batches:', error);
    }
  }

  async function loadBatchStats() {
    if (!profile?.id) return;

    try {
      console.log('📊 Loading batch statistics...');

      // Get assigned batches count
      const { count: assignedCount, error: assignedError } = await supabase
        .from('order_batches')
        .select('*', { count: 'exact', head: true })
        .eq('driver_id', profile.id)
        .eq('status', 'assigned');

      if (assignedError) {
        console.error('Error loading assigned batches:', assignedError);
      }

      // Get active batches count (in progress)
      const { count: activeCount, error: activeError } = await supabase
        .from('order_batches')
        .select('*', { count: 'exact', head: true })
        .eq('driver_id', profile.id)
        .eq('status', 'delivering');

      if (activeError) {
        console.error('Error loading active batches:', activeError);
      }

      // Get completed batches
      const { data: completedBatches, error: completedError } = await supabase
        .from('order_batches')
        .select('id')
        .eq('driver_id', profile.id)
        .eq('status', 'delivered');

      if (completedError) {
        console.error('Error loading completed batches:', completedError);
      }

      const completedCount = completedBatches?.length || 0;
      
      // Calculate total earnings from completed batches
      let totalEarnings = 0;
      if (completedBatches && completedBatches.length > 0) {
        const batchIds = completedBatches.map(batch => batch.id);
        const { data: completedOrders, error: ordersError } = await supabase
          .from('orders')
          .select('total')
          .in('batch_id', batchIds)
          .eq('approval_status', 'approved');

        if (ordersError) {
          console.error('Error loading completed orders:', ordersError);
        } else {
          totalEarnings = completedOrders?.reduce((sum, order) => sum + order.total, 0) || 0;
        }
      }

      const newStats = {
        assignedBatches: assignedCount || 0,
        activeBatches: activeCount || 0,
        completedBatches: completedCount,
        totalEarnings
      };

      console.log('📈 Updated batch statistics:', newStats);
      setStats(newStats);
    } catch (error) {
      console.error('Error in loadBatchStats:', error);
      // Set default values if there's an error
      setStats({
        assignedBatches: 0,
        activeBatches: 0,
        completedBatches: 0,
        totalEarnings: 0
      });
    }
  }

  async function loadActiveBatch() {
    if (!profile?.id) return;

    try {
      // First, get the active batch (including delivered status to check if it was just completed)
      const { data: batchData, error: batchError } = await supabase
        .from('order_batches')
        .select(`
          id,
          created_at,
          total_weight,
          max_weight,
          status
        `)
        .eq('driver_id', profile.id)
        .in('status', ['assigned', 'delivering', 'delivered'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (batchError && batchError.code !== 'PGRST116') {
        return;
      }

      const batch = batchData?.[0];

      if (batch) {
        // Then get the orders for this batch separately
        const { data: orders, error: ordersError } = await supabase
          .from('orders')
          .select(`
            id,
            total,
            delivery_status,
            delivery_address,
            customer:profiles!orders_customer_id_fkey(id, name),
            items:order_items(
              quantity,
              price,
              product:products(
                name,
                image_url,
                weight
              )
            )
          `)
          .eq('batch_id', batch.id)
          .eq('approval_status', 'approved');

        if (ordersError) {
          return;
        }

        const estimatedDuration = calculateEstimatedDuration(orders?.length || 0);
        
        // Check if this batch is completed (all orders delivered)
        const allOrdersDelivered = orders?.every(order => order.delivery_status === 'delivered');
        
        if (batch.status === 'delivered' || allOrdersDelivered) {
          // This batch is completed, don't show as active
          console.log('Batch is completed, loading as recent completed batch');
          setActiveBatch(null);
          return;
        }

        setActiveBatch({
          ...batch,
          orders: orders || [],
          estimated_duration: estimatedDuration
        });
      }
    } catch (error) {
      console.error('Error loading active batch:', error);
    }
  }

  function calculateEstimatedDuration(orderCount: number): string {
    // Estimate 15 minutes per delivery + 5 minutes travel time
    const totalMinutes = orderCount * 20;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  async function loadRecentCompletedBatch() {
    if (!profile?.id) return;

    try {
      // Get the most recently completed batch
      const { data: batchData, error: batchError } = await supabase
        .from('order_batches')
        .select(`
          id,
          created_at,
          total_weight,
          max_weight,
          status
        `)
        .eq('driver_id', profile.id)
        .eq('status', 'delivered')
        .order('created_at', { ascending: false })
        .limit(1);

      if (batchError) {
        if (batchError.code === 'PGRST116') {
          // No completed batches found, which is fine
          setRecentCompletedBatch(null);
          return;
        }
        throw batchError;
      }

      const batch = batchData?.[0];

      if (batch) {
        // Get the orders for this completed batch
        const { data: orders, error: ordersError } = await supabase
          .from('orders')
          .select(`
            id,
            total,
            delivery_status,
            delivery_address,
            customer:profiles!orders_customer_id_fkey(id, name),
            items:order_items(
              quantity,
              price,
              product:products(
                name,
                image_url,
                weight
              )
            )
          `)
          .eq('batch_id', batch.id)
          .eq('approval_status', 'approved');

        if (ordersError) {
          console.error('Error loading orders for completed batch:', ordersError);
          return;
        }

        setRecentCompletedBatch({
          ...batch,
          orders: orders || []
        });
      }
    } catch (error) {
      console.error('Error loading recent completed batch:', error);
    }
  }

  async function checkForNewAssignments() {
    try {
      if (!profile?.id) return;

      // Check for new assignments
      const { data: newBatch, error: batchError } = await supabase
        .from('order_batches')
        .select(`
          id,
          created_at,
          total_weight,
          max_weight,
          status
        `)
        .eq('driver_id', profile.id)
        .eq('status', 'assigned')
        .order('created_at', { ascending: false })
        .limit(1);

      if (batchError && batchError.code !== 'PGRST116') {
        return;
      }

      if (newBatch && newBatch.length > 0) {
        const batch = newBatch[0];
        const batchCreatedAt = new Date(batch.created_at).getTime();
        
        // Check if this is a new assignment (created after last notification)
        if (batchCreatedAt > lastNotificationTime) {
          // Get orders for this batch
          const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select(`
              id,
              total,
              delivery_address,
              customer:profiles!orders_customer_id_fkey(id, name)
            `)
            .eq('batch_id', batch.id)
            .eq('approval_status', 'approved');

          if (ordersError) {
            return;
          }

          const estimatedDuration = calculateEstimatedDuration(orders?.length || 0);
          const capacityPercentage = ((batch.total_weight / (batch.max_weight || 3500)) * 100).toFixed(1);
          
          setActiveBatch({
            ...batch,
            orders: orders || [],
            estimated_duration: estimatedDuration
          });

          // Show notification for new auto-assignment
          toast.success(`🚚 New batch assigned! ${orders?.length || 0} orders (${capacityPercentage}% capacity)`, {
            duration: 8000,
            icon: '🚚'
          });

          setLastNotificationTime(batchCreatedAt);
          
          // Refresh stats
          loadBatchStats();
        }
      }

      // Check for batch completion
      await checkForBatchCompletion();
    } catch (error) {
      console.error('Error checking for new assignments:', error);
    }
  }

  async function checkForBatchCompletion() {
    try {
      if (!profile?.id || !activeBatch) return;

      console.log('🔍 Checking for batch completion...', { batchId: activeBatch.id, currentStatus: activeBatch.status });

      // Check if the current active batch has been completed
      const { data: updatedBatch, error } = await supabase
        .from('order_batches')
        .select('status')
        .eq('id', activeBatch.id)
        .single();

      if (error) {
        console.error('Error checking batch status:', error);
        return;
      }

      console.log('📊 Batch status check:', { 
        batchId: activeBatch.id, 
        oldStatus: activeBatch.status, 
        newStatus: updatedBatch.status 
      });

      // Also check if all orders in the batch are delivered
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('delivery_status')
        .eq('batch_id', activeBatch.id)
        .eq('approval_status', 'approved');

      if (ordersError) {
        console.error('Error checking order delivery status:', ordersError);
        return;
      }

      const allOrdersDelivered = orders?.every(order => order.delivery_status === 'delivered');
      const deliveredCount = orders?.filter(order => order.delivery_status === 'delivered').length || 0;
      const totalOrders = orders?.length || 0;

      console.log('📦 Order delivery status:', { 
        deliveredCount, 
        totalOrders, 
        allOrdersDelivered 
      });

      // If batch is now completed, update the dashboard
      if ((updatedBatch.status === 'delivered' && activeBatch.status !== 'delivered') || allOrdersDelivered) {
        console.log('🎉 Batch completed! Updating dashboard...');
        
        // If all orders are delivered but batch status isn't updated, fix it automatically
        if (allOrdersDelivered && updatedBatch.status !== 'delivered') {
          console.log('🔧 Auto-fixing batch status to delivered...');
          const { error: updateError } = await supabase
            .from('order_batches')
            .update({ status: 'delivered' })
            .eq('id', activeBatch.id);

          if (updateError) {
            console.error('Error auto-fixing batch status:', updateError);
          } else {
            console.log('✅ Batch status auto-fixed to delivered');
          }
        }
        
        // Show completion notification
        const totalRevenue = activeBatch.orders.reduce((sum, order) => sum + order.total, 0);
        toast.success(`🎉 Batch completed! Earned ${formatCurrency(totalRevenue)}`, {
          duration: 10000,
          icon: '🎉'
        });

        // Clear active batch and refresh data
        setActiveBatch(null);
        await Promise.all([
          loadBatchStats(),
          loadRecentCompletedBatch()
        ]);

        console.log('✅ Dashboard updated successfully');
      }
    } catch (error) {
      console.error('Error checking for batch completion:', error);
    }
  }

  const handleStartDelivery = async () => {
    if (!activeBatch) return;

    try {
      // Update batch status to delivering
      const { error: batchError } = await supabase
        .from('order_batches')
        .update({ status: 'delivering' })
        .eq('id', activeBatch.id);

      if (batchError) throw batchError;

      // Update all orders in the batch to delivering status
      const orderIds = activeBatch.orders.map(order => order.id);
      const { error: ordersError } = await supabase
        .from('orders')
        .update({ delivery_status: 'delivering' })
        .in('id', orderIds);

      if (ordersError) throw ordersError;

      // Send out_for_delivery emails to all customers
      let emailSuccessCount = 0;
      const totalEmails = activeBatch.orders.length;

      for (const order of activeBatch.orders) {
        try {
          // Get customer email
          const { data: customerData, error: customerError } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', order.customer?.id || '')
            .single();

          if (customerError || !customerData?.email) {
            console.error('❌ No customer email found for order:', order.id);
            continue;
          }

          // Calculate estimated delivery date (1-2 hours from now)
          const estimatedDeliveryDate = new Date();
          estimatedDeliveryDate.setHours(estimatedDeliveryDate.getHours() + 2);
          const formattedDate = estimatedDeliveryDate.toLocaleDateString('en-US', { 
            weekday: 'long',
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          // Send out_for_delivery email
          const emailSent = await directEmailService.sendOrderOutForDeliveryEmail(
            order.id,
            customerData.email,
            order.customer?.name || 'Customer',
            formattedDate,
            order.items?.map(item => ({
              productName: item.product?.name || 'Unknown Product',
              quantity: item.quantity,
              price: item.price
            })) || [],
            order.total
          );

          if (emailSent) {
            emailSuccessCount++;
            console.log('✅ Out for delivery email sent to:', customerData.email);
          } else {
            console.error('❌ Failed to send out for delivery email to:', customerData.email);
          }

          // Add a small delay between emails
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (emailError) {
          console.error('❌ Error sending email for order:', order.id, emailError);
        }
      }

      console.log(`📧 Out for delivery emails sent: ${emailSuccessCount}/${totalEmails} successful`);

      setActiveBatch({ ...activeBatch, status: 'delivering' });
      toast.success(`🚚 Delivery started! ${emailSuccessCount} customers notified. Safe driving!`);
    } catch (error) {
      console.error('Error starting delivery:', error);
      toast.error('Failed to start delivery');
    }
  };

  const handleViewRoute = () => {
    if (!activeBatch) {
      toast.error('No active batch to view route for');
      return;
    }
    navigate('/driver/route');
  };

  const handleRefreshDashboard = async () => {
    setLoading(true);
    try {
      await loadDashboardData();
      toast.success('Dashboard refreshed!');
    } catch (error) {
      toast.error('Failed to refresh dashboard');
    } finally {
      setLoading(false);
    }
  };

  const getCurrentLocation = (): Promise<{lat: number, lng: number, address: string}> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          
          // For now, just use coordinates as address
          // TODO: Add proper reverse geocoding service if needed
          resolve({
            lat: latitude,
            lng: longitude,
            address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    });
  };

  const handleRescueRequest = async () => {
    if (!profile?.id) {
      toast.error('Driver profile not found');
      return;
    }

    try {
      setIsSendingRescue(true);
      
      // Get current location
      const location = await getCurrentLocation();
      
      // For now, just send the email notification
      // TODO: Add database storage once migration is run
      console.log('Rescue request data:', {
        driver_id: profile.id,
        driver_name: profile.name,
        latitude: location.lat,
        longitude: location.lng,
        address: location.address,
        status: 'pending',
        requested_at: new Date().toISOString()
      });

      // Send notification to admins
      console.log('🚨 Calling notifyAdminsOfRescueRequest...');
      await notifyAdminsOfRescueRequest(profile.name || 'Driver', location);
      console.log('✅ notifyAdminsOfRescueRequest completed');

      toast.success('🚨 Rescue request sent! Admin has been notified of your location.', {
        duration: 8000,
        icon: '🚨'
      });
      
      // Show location details in console for debugging
      console.log('📍 Driver Location Details:', {
        driver: profile.name,
        coordinates: `${location.lat}, ${location.lng}`,
        address: location.address,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error sending rescue request:', error);
      if (error instanceof Error && error.message?.includes('FunctionsHttpError')) {
        toast.error('Server error. Please try again or contact support directly.');
      } else if (error instanceof Error && error.message?.includes('Geolocation')) {
        toast.error('Location access denied. Please enable location services and try again.');
      } else {
        toast.error('Failed to send rescue request. Please try again or contact support directly.');
      }
    } finally {
      setIsSendingRescue(false);
    }
  };


  const notifyAdminsOfRescueRequest = async (driverName: string, location: {lat: number, lng: number, address: string}) => {
    try {
      console.log('🔍 Looking for admins to notify...');
      
      // First, create a database notification for the emergency request
      console.log('📝 Creating emergency notification in database...');
      
      // Get admin user ID for the notification
      const { data: adminData, error: adminError } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .limit(1)
        .single();

      if (adminError || !adminData) {
        console.error('❌ No admin found for notification:', adminError);
        // Continue without notification if no admin found
      } else {
        const { data: notificationData, error: notificationError } = await supabase
          .from('notifications')
          .insert({
            user_id: adminData.id,
            type: 'info',
            title: `🚨 Rescue Request from ${driverName}`,
            message: `Driver ${driverName} has requested emergency assistance at ${location.address}`,
            read: false,
            data: {
              driver_name: driverName,
              driver_id: profile?.id || '',
              driver_avatar_url: profile?.avatar_url || undefined,
              address: location.address,
              latitude: location.lat,
              longitude: location.lng,
              requested_at: new Date().toISOString()
            }
          })
          .select()
          .single();

        if (notificationError) {
          console.error('❌ Error creating emergency notification:', notificationError);
        } else {
          console.log('✅ Emergency notification created:', notificationData);
        }
      }

      // Get all admin emails
      const { data: admins, error: adminsError } = await supabase
        .from('profiles')
        .select('email, name')
        .eq('role', 'admin');

      if (adminsError || !admins || admins.length === 0) {
        console.error('❌ No admins found to notify:', adminsError);
        return;
      }

      console.log('👥 Found admins:', admins);

      // Send email to each admin
      for (const admin of admins) {
        if (admin.email) {
          try {
            console.log(`📧 Sending rescue email to admin: ${admin.email}`);
            await directEmailService.sendRescueRequestEmail({
              adminEmail: admin.email,
              adminName: admin.name || 'Admin',
              driverName: driverName,
              driverId: profile?.id || '',
              driverAvatarUrl: profile?.avatar_url || undefined,
              address: location.address,
              latitude: location.lat,
              longitude: location.lng
            });
            console.log(`✅ Rescue email sent successfully to: ${admin.email}`);
          } catch (emailError) {
            console.error('❌ Error sending rescue email to admin:', admin.email, emailError);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error notifying admins:', error);
    }
  };



  if (loading) {
    return <Loader label="Loading dashboard..." />;
  }

  if (!stats) {
    return <div className="text-center text-gray-500">Failed to load dashboard statistics.</div>;
  }

  const statCards = [
    {
      title: 'Assigned Batches',
      value: stats.assignedBatches,
      icon: <Package className="h-6 w-6 text-blue-500" />,
      color: 'bg-blue-50 border-blue-200'
    },
    {
      title: 'Active Deliveries',
      value: stats.activeBatches,
      icon: <Truck className="h-6 w-6 text-orange-500" />,
      color: 'bg-orange-50 border-orange-200'
    },
    {
      title: 'Completed Batches',
      value: stats.completedBatches,
      icon: <CheckCircle className="h-6 w-6 text-green-500" />,
      color: 'bg-green-50 border-green-200'
    },
    {
      title: 'Total Earnings',
      value: formatCurrency(stats.totalEarnings),
      icon: <TrendingUp className="h-6 w-6 text-purple-500" />,
      color: 'bg-purple-50 border-purple-200'
    },
  ];

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-800 -mx-3 sm:-mx-4 md:-mx-6 lg:-mx-8 -mt-3 sm:-mt-4 md:-mt-6 px-3 sm:px-4 md:px-6 lg:px-8 pt-3 sm:pt-4 md:pt-6 pb-6 sm:pb-8 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <p className="text-white text-xl sm:text-2xl font-bold">Welcome back, {profile?.name}!</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleRescueRequest}
              disabled={isSendingRescue}
              className="bg-red-500 hover:bg-red-600 text-white px-3 sm:px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-sm sm:text-base w-full sm:w-auto"
            >
              <AlertTriangle className={`h-4 w-4 ${isSendingRescue ? 'animate-pulse' : ''}`} />
              {isSendingRescue ? 'Sending...' : 'Rescue'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((stat, index) => (
          <Card key={index} className={`border-2 ${stat.color}`}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1 truncate">{stat.title}</p>
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 break-words">
                    {stat.value}
                  </p>
                </div>
                <div className="flex-shrink-0 ml-2">
                  {stat.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Active Batch Section */}
      {activeBatch ? (
        <Card className="border-2 border-blue-200 bg-blue-50">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Active Batch</h2>
                <p className="text-sm text-gray-600">Batch #{activeBatch.id.slice(0, 8)}</p>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                activeBatch.status === 'assigned' 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-blue-200 text-blue-900'
              }`}>
                {activeBatch.status === 'assigned' ? '📋 Ready' : '🚚 Delivering'}
              </div>
            </div>

            {/* Batch Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              <div className="flex items-center gap-2 p-3 bg-white rounded-lg">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-600">Orders</p>
                  <p className="font-semibold text-sm sm:text-base">{activeBatch.orders.length}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-white rounded-lg">
                <Weight className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-600">Weight</p>
                  <p className="font-semibold text-sm sm:text-base">{activeBatch.total_weight.toFixed(1)}kg</p>
                  <p className="text-xs text-gray-500">
                    {((activeBatch.total_weight / (activeBatch.max_weight || 3500)) * 100).toFixed(1)}% capacity
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-white rounded-lg">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-600">Est. Time</p>
                  <p className="font-semibold text-sm sm:text-base">{activeBatch.estimated_duration}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-white rounded-lg">
                <Package className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-600">Revenue</p>
                  <p className="font-semibold text-sm sm:text-base break-words">
                    {formatCurrency(activeBatch.orders.reduce((sum, order) => sum + order.total, 0))}
                  </p>
                </div>
              </div>
            </div>

            {/* Capacity Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Batch Capacity</span>
                <span className="text-sm text-gray-500">
                  {activeBatch.total_weight.toFixed(1)}kg / {activeBatch.max_weight || 3500}kg
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-blue-400 to-blue-500 h-2 rounded-full transition-all duration-500"
                  style={{ 
                    width: `${Math.min(100, (activeBatch.total_weight / (activeBatch.max_weight || 3500)) * 100)}%` 
                  }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Auto-assigned at 100% capacity threshold
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              {activeBatch.status === 'assigned' && (
                <button
                  onClick={handleStartDelivery}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm sm:text-base"
                >
                  <Truck className="h-4 w-4 sm:h-5 sm:w-5" />
                  Start Delivery
                </button>
              )}
              <button 
                onClick={handleViewRoute}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm sm:text-base"
              >
                <Route className="h-4 w-4 sm:h-5 sm:w-5" />
                View Route
              </button>
            </div>

            {/* Orders Preview */}
            <div className="mt-6 border-t pt-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Delivery Stops ({activeBatch.orders.length})
              </h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {activeBatch.orders.slice(0, 3).map((order, index) => (
                  <div key={order.id} className="bg-white rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-blue-200 text-blue-800 rounded-full flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{order.customer?.name || 'N/A'}</p>
                          <p className="text-xs text-gray-500">{order.delivery_address?.street_address || 'N/A'}</p>
                        </div>
                      </div>
                      <p className="text-sm font-medium">{formatCurrency(order.total)}</p>
                    </div>
                    
                    {/* Order Items */}
                    {order.items && order.items.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs font-semibold text-gray-700 mb-2">Items:</p>
                        <div className="space-y-2 max-h-24 overflow-y-auto">
                          {order.items.slice(0, 3).map((item, itemIndex) => (
                            <div key={itemIndex} className="flex items-center gap-2 bg-gray-50 rounded p-2">
                              {item.product?.image_url ? (
                                <img
                                  src={item.product.image_url}
                                  alt={item.product.name}
                                  className="w-8 h-8 rounded object-cover border"
                                />
                              ) : (
                                <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center">
                                  <Package className="w-4 h-4 text-gray-400" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-900 truncate">
                                  {item.product?.name || 'Unknown'}
                                </p>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded">
                                    x{item.quantity}
                                  </span>
                                  {item.product?.weight && (
                                    <span className="text-xs text-gray-500">
                                      {item.product.weight.toFixed(1)}kg
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                          {order.items.length > 3 && (
                            <div className="text-xs text-gray-500 text-center py-1">
                              +{order.items.length - 3} more items
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {activeBatch.orders.length > 3 && (
                  <p className="text-center text-sm text-gray-500 py-2">
                    +{activeBatch.orders.length - 3} more stops
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-2 border-gray-200">
          <CardContent className="p-6 text-center">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Active Batches</h3>
            <p className="text-gray-600">You don't have any assigned batches at the moment.</p>
            <p className="text-sm text-gray-500 mt-2">New batches will appear here when assigned automatically.</p>
          </CardContent>
        </Card>
      )}

      {/* Recently Completed Batch Section */}
      {recentCompletedBatch && !activeBatch && (
        <Card className="border-2 border-blue-200 bg-blue-50">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Recently Completed</h2>
                <p className="text-sm text-gray-600">Batch #{recentCompletedBatch.id.slice(0, 8)}</p>
              </div>
              <div className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                ✅ Completed
              </div>
            </div>

            {/* Batch Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Orders Delivered</p>
                  <p className="font-semibold">{recentCompletedBatch.orders.length}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Weight className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Total Weight</p>
                  <p className="font-semibold">{recentCompletedBatch.total_weight.toFixed(1)}kg</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Completed</p>
                  <p className="font-semibold">
                    {new Date(recentCompletedBatch.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Revenue Earned</p>
                  <p className="font-semibold text-blue-600">
                    {formatCurrency(recentCompletedBatch.orders.reduce((sum, order) => sum + order.total, 0))}
                  </p>
                </div>
              </div>
            </div>

            {/* Delivery Summary */}
            <div className="bg-white rounded-lg p-4 mb-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-blue-600" />
                Delivery Summary
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">
                    {recentCompletedBatch.orders.filter(order => order.delivery_status === 'delivered').length}
                  </p>
                  <p className="text-sm text-gray-600">Successfully Delivered</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-600">
                    {recentCompletedBatch.orders.length}
                  </p>
                  <p className="text-sm text-gray-600">Total Orders</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">
                    {Math.round((recentCompletedBatch.orders.filter(order => order.delivery_status === 'delivered').length / recentCompletedBatch.orders.length) * 100)}%
                  </p>
                  <p className="text-sm text-gray-600">Success Rate</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
                <button
                onClick={handleRefreshDashboard}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw className="h-5 w-5" />
                Refresh Dashboard
              </button>
              <button
                onClick={() => navigate('/driver/route')}
                className="flex-1 bg-blue-400 hover:bg-blue-500 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <MapPin className="h-5 w-5" />
                View Route History
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Active Batches - Enhanced Message */}
      {!activeBatch && !recentCompletedBatch && (
        <Card className="border-2 border-gray-200">
          <CardContent className="p-6 text-center">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Active Batches</h3>
            <p className="text-gray-600">You don't have any assigned batches at the moment.</p>
            <p className="text-sm text-gray-500 mt-2">New batches will appear here when assigned automatically.</p>
            <div className="mt-4">
              <button
                onClick={handleRefreshDashboard}
                className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 mx-auto transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Check for New Assignments
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}