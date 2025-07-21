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
  TrendingUp
} from 'lucide-react';
import { useProfile } from '../../lib/auth';
import { toast } from 'react-hot-toast';

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
      name: string | null;
    } | null;
  }>;
}

export default function DashboardPage() {
  const { profile } = useProfile();
  const navigate = useNavigate();
  const [stats, setStats] = useState<BatchStats | null>(null);
  const [activeBatch, setActiveBatch] = useState<ActiveBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastNotificationTime, setLastNotificationTime] = useState<number>(0);

  useEffect(() => {
    if (profile?.id) {
      loadDashboardData();
      
      // Set up real-time polling for new batch assignments
      const interval = setInterval(() => {
        checkForNewAssignments();
      }, 10000); // Check every 10 seconds

      return () => clearInterval(interval);
    }
  }, [profile?.id]);

  async function loadDashboardData() {
    try {
      if (!profile?.id) return;

      // Load batch statistics
      await Promise.all([
        loadBatchStats(),
        loadActiveBatch()
      ]);

    } catch (error) {
      console.error('Error loading dashboard:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  async function loadBatchStats() {
    if (!profile?.id) return;

    // Get assigned batches count
    const { count: assignedCount } = await supabase
      .from('order_batches')
      .select('*', { count: 'exact', head: true })
      .eq('driver_id', profile.id)
      .eq('status', 'assigned');

    // Get active batches count (in progress)
    const { count: activeCount } = await supabase
      .from('order_batches')
      .select('*', { count: 'exact', head: true })
      .eq('driver_id', profile.id)
      .eq('status', 'delivering');

    // Get completed batches
    const { data: completedBatches } = await supabase
      .from('order_batches')
      .select(`
        id,
        orders:orders!batch_id(total)
      `)
      .eq('driver_id', profile.id)
      .eq('status', 'delivered');

    const completedCount = completedBatches?.length || 0;
    const totalEarnings = completedBatches?.reduce((sum, batch) => {
      const batchTotal = batch.orders.reduce((orderSum, order) => orderSum + order.total, 0);
      return sum + batchTotal;
    }, 0) || 0;

    setStats({
      assignedBatches: assignedCount || 0,
      activeBatches: activeCount || 0,
      completedBatches: completedCount,
      totalEarnings
    });
  }

  async function loadActiveBatch() {
    if (!profile?.id) return;

    try {
      // First, get the active batch
      const { data: batch, error: batchError } = await supabase
        .from('order_batches')
        .select(`
          id,
          created_at,
          total_weight,
          max_weight,
          status
        `)
        .eq('driver_id', profile.id)
        .in('status', ['assigned', 'delivering'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (batchError && batchError.code !== 'PGRST116') {
        console.error('Error loading active batch:', batchError);
        return;
      }

      if (batch) {
        // Then get the orders for this batch separately
        const { data: orders, error: ordersError } = await supabase
          .from('orders')
          .select(`
            id,
            total,
            delivery_address,
            customer:profiles!orders_customer_id_fkey(name)
          `)
          .eq('batch_id', batch.id)
          .eq('approval_status', 'approved');

        if (ordersError) {
          console.error('Error loading batch orders:', ordersError);
          return;
        }

        const estimatedDuration = calculateEstimatedDuration(orders?.length || 0);
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

  async function checkForNewAssignments() {
    try {
      if (!profile?.id) return;

      // First, get the new batch
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
        .limit(1)
        .single();

      if (batchError && batchError.code !== 'PGRST116') {
        console.error('Error checking for new assignments:', batchError);
        return;
      }

      if (newBatch) {
        const batchCreatedAt = new Date(newBatch.created_at).getTime();
        
        // Check if this is a new assignment (created after last notification)
        if (batchCreatedAt > lastNotificationTime) {
          // Get orders for this batch
          const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select(`
              id,
              total,
              delivery_address,
              customer:profiles!orders_customer_id_fkey(name)
            `)
            .eq('batch_id', newBatch.id)
            .eq('approval_status', 'approved');

          if (ordersError) {
            console.error('Error loading new batch orders:', ordersError);
            return;
          }

          const estimatedDuration = calculateEstimatedDuration(orders?.length || 0);
          const capacityPercentage = ((newBatch.total_weight / (newBatch.max_weight || 3500)) * 100).toFixed(1);
          
          setActiveBatch({
            ...newBatch,
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
    } catch (error) {
      console.error('Error checking for new assignments:', error);
    }
  }

  const handleStartDelivery = async () => {
    if (!activeBatch) return;

    try {
      const { error } = await supabase
        .from('order_batches')
        .update({ status: 'delivering' })
        .eq('id', activeBatch.id);

      if (error) throw error;

      setActiveBatch({ ...activeBatch, status: 'delivering' });
      toast.success('🚚 Delivery started! Safe driving!');
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
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 -mx-6 -mt-6 px-6 pt-6 pb-8 text-white">
        <h1 className="text-2xl font-bold mb-2">Driver Dashboard</h1>
        <p className="text-blue-100">Welcome back, {profile?.name}!</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <Card key={index} className={`border-2 ${stat.color}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stat.value}
                  </p>
                </div>
                {stat.icon}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Active Batch Section */}
      {activeBatch ? (
        <Card className="border-2 border-green-200 bg-green-50">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Active Batch</h2>
                <p className="text-sm text-gray-600">Batch #{activeBatch.id.slice(0, 8)}</p>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                activeBatch.status === 'assigned' 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-orange-100 text-orange-800'
              }`}>
                {activeBatch.status === 'assigned' ? '📋 Ready' : '🚚 Delivering'}
              </div>
            </div>

            {/* Batch Details */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Orders</p>
                  <p className="font-semibold">{activeBatch.orders.length}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Weight className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Weight</p>
                  <p className="font-semibold">{activeBatch.total_weight.toFixed(1)}kg</p>
                  <p className="text-xs text-gray-500">
                    {((activeBatch.total_weight / (activeBatch.max_weight || 3500)) * 100).toFixed(1)}% capacity
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Est. Time</p>
                  <p className="font-semibold">{activeBatch.estimated_duration}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Revenue</p>
                  <p className="font-semibold">
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
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ 
                    width: `${Math.min(100, (activeBatch.total_weight / (activeBatch.max_weight || 3500)) * 100)}%` 
                  }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Auto-assigned at 100% capacity threshold (3500kg)
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              {activeBatch.status === 'assigned' && (
                <button
                  onClick={handleStartDelivery}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Truck className="h-5 w-5" />
                  Start Delivery
                </button>
              )}
              <button 
                onClick={handleViewRoute}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <Route className="h-5 w-5" />
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
                  <div key={order.id} className="flex items-center justify-between bg-white rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{order.customer?.name || 'N/A'}</p>
                        <p className="text-xs text-gray-500">{order.delivery_address?.street_address || 'N/A'}</p>
                      </div>
                    </div>
                    <p className="text-sm font-medium">{formatCurrency(order.total)}</p>
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
    </div>
  );
}