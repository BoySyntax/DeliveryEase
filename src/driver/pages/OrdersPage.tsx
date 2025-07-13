import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import Button from '../../ui/components/Button';
import { Card, CardContent } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import { toast } from 'react-hot-toast';
import { useProfile } from '../../lib/auth';
import { 
  Package, 
  MapPin, 
  Clock, 
  Users, 
  Weight, 
  Navigation, 
  CheckCircle,
  Truck,
  Route
} from 'lucide-react';
import OrderLocationMap from '../components/OrderLocationMap';

interface BatchOrder {
  id: string;
  total: number;
  delivery_address: {
    full_name: string;
    phone: string;
    street_address: string;
    barangay?: string;
    latitude?: number;
    longitude?: number;
  } | null;
  customer: {
    name: string | null;
  } | null;
  delivery_status: string;
}

interface Batch {
  id: string;
  created_at: string;
  total_weight: number;
  max_weight: number;
  status: 'pending' | 'assigned' | 'delivering' | 'delivered';
  orders: BatchOrder[];
  estimated_duration?: string;
}

export default function OrdersPage() {
  const { profile } = useProfile();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'batches' | 'locations'>('batches');

  useEffect(() => {
    if (profile?.id) {
      loadBatches();
    }
  }, [profile?.id]);

  async function loadBatches() {
    try {
      if (!profile?.id) return;

      // First, get the batches
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
        .in('status', ['assigned', 'delivering'])
        .order('created_at', { ascending: false });

      if (batchError) throw batchError;

      if (!batchData || batchData.length === 0) {
        setBatches([]);
        return;
      }

      // Then get orders for each batch
      const batchesWithOrders = await Promise.all(
        batchData.map(async (batch) => {
          const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select(`
              id,
              total,
              delivery_status,
              delivery_address,
              customer:profiles!orders_customer_id_fkey(name)
            `)
            .eq('batch_id', batch.id)
            .eq('approval_status', 'approved');

          if (ordersError) {
            console.error('Error loading orders for batch:', batch.id, ordersError);
            return {
              ...batch,
              orders: [],
              estimated_duration: calculateEstimatedDuration(0)
            };
          }

          return {
            ...batch,
            orders: orders || [],
            estimated_duration: calculateEstimatedDuration(orders?.length || 0)
          };
        })
      );

      setBatches(batchesWithOrders);
    } catch (error) {
      console.error('Error loading batches:', error);
      toast.error('Failed to load batches');
    } finally {
      setLoading(false);
    }
  }

  function calculateEstimatedDuration(orderCount: number): string {
    const totalMinutes = orderCount * 20; // 20 minutes per delivery
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  // Transform batch orders to location format
  function transformOrdersForLocationView() {
    const allOrders = batches.flatMap(batch => 
      batch.orders.map(order => ({
        id: order.id,
        customer_name: order.customer?.name || 'Unknown Customer',
        address: order.delivery_address?.street_address || 'No address',
        barangay: order.delivery_address?.barangay || 'Unknown Area',
        latitude: order.delivery_address?.latitude || null,
        longitude: order.delivery_address?.longitude || null,
        phone: order.delivery_address?.phone || '',
        total: order.total,
        delivery_status: order.delivery_status,
        estimated_time: '20m' // Default estimate per order
      }))
    );
    return allOrders;
  }

  const handleStartDelivery = async (batchId: string) => {
    try {
      const { error } = await supabase
        .from('order_batches')
        .update({ status: 'delivering' })
        .eq('id', batchId);

      if (error) throw error;

      setBatches(prev => prev.map(batch => 
        batch.id === batchId ? { ...batch, status: 'delivering' as const } : batch
      ));

      toast.success('🚚 Delivery started! Safe driving!');
    } catch (error) {
      console.error('Error starting delivery:', error);
      toast.error('Failed to start delivery');
    }
  };

  const handleCompleteDelivery = async (batchId: string) => {
    try {
      // Update batch status
      const { error: batchError } = await supabase
        .from('order_batches')
        .update({ status: 'delivered' })
        .eq('id', batchId);

      if (batchError) throw batchError;

      // Update all orders in batch to delivered
      const { error: ordersError } = await supabase
        .from('orders')
        .update({ delivery_status: 'delivered' })
        .eq('batch_id', batchId);

      if (ordersError) throw ordersError;

      setBatches(prev => prev.filter(batch => batch.id !== batchId));
      toast.success('🎉 Batch completed successfully!');
    } catch (error) {
      console.error('Error completing delivery:', error);
      toast.error('Failed to complete delivery');
    }
  };

  const toggleBatchExpansion = (batchId: string) => {
    setExpandedBatch(expandedBatch === batchId ? null : batchId);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'assigned':
        return <Package className="h-5 w-5 text-blue-500" />;
      case 'delivering':
        return <Truck className="h-5 w-5 text-orange-500" />;
      case 'delivered':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      default:
        return <Package className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'assigned':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'delivering':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'delivered':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (loading) {
    return <Loader label="Loading batches..." />;
  }

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {viewMode === 'batches' ? 'My Delivery Batches' : 'Delivery Locations'}
        </h1>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">
            {batches.length} active batch{batches.length !== 1 ? 'es' : ''}
          </div>
          
          {/* View Toggle */}
          <div className="bg-gray-100 rounded-lg p-1 flex">
            <button
              onClick={() => setViewMode('batches')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === 'batches' 
                  ? 'bg-white text-blue-600 shadow' 
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              📦 Batches
            </button>
            <button
              onClick={() => setViewMode('locations')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === 'locations' 
                  ? 'bg-white text-blue-600 shadow' 
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              📍 Locations
            </button>
          </div>
        </div>
      </div>

      {/* Content based on view mode */}
      {viewMode === 'locations' ? (
        <OrderLocationMap 
          orders={transformOrdersForLocationView()}
          onOrderSelect={(orderId) => {
            console.log('Selected order:', orderId);
            // Could implement order detail modal here
          }}
          onRouteOptimize={(orders) => {
            console.log('Optimizing route for:', orders);
            toast.success(`Route optimization started for ${orders.length} orders`);
          }}
        />
      ) : (
        <>
          {/* Batches List */}
          <div className="space-y-4">
            {batches.map(batch => {
          const isExpanded = expandedBatch === batch.id;
          const totalRevenue = batch.orders.reduce((sum, order) => sum + order.total, 0);
          const completedOrders = batch.orders.filter(order => order.delivery_status === 'delivered').length;
          
          return (
            <Card key={batch.id} className={`border-2 ${getStatusColor(batch.status).replace('text-', 'border-').split(' ')[2]}`}>
              <CardContent className="p-0">
                {/* Batch Header */}
                <div 
                  className="p-6 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleBatchExpansion(batch.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      {getStatusIcon(batch.status)}
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">
                          Batch #{batch.id.slice(0, 8)}
                        </h3>
                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(batch.status)}`}>
                          {batch.status === 'assigned' && '📋 Ready to Deliver'}
                          {batch.status === 'delivering' && '🚚 In Progress'}
                          {batch.status === 'delivered' && '✅ Completed'}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <p className="text-2xl font-bold text-green-600">{formatCurrency(totalRevenue)}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(batch.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Batch Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600">Orders</p>
                        <p className="font-semibold">
                          {batch.status === 'delivering' ? `${completedOrders}/${batch.orders.length}` : batch.orders.length}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Weight className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600">Weight</p>
                        <p className="font-semibold">{batch.total_weight.toFixed(1)}kg</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600">Est. Time</p>
                        <p className="font-semibold">{batch.estimated_duration}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Navigation className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600">Progress</p>
                        <p className="font-semibold">
                          {batch.status === 'delivering' 
                            ? `${Math.round((completedOrders / batch.orders.length) * 100)}%`
                            : '0%'
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t bg-gray-50">
                    {/* Action Buttons */}
                    <div className="p-6 border-b">
                      <div className="flex gap-3">
                        {batch.status === 'assigned' && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartDelivery(batch.id);
                            }}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                          >
                            <Truck className="h-4 w-4 mr-2" />
                            Start Delivery
                          </Button>
                        )}
                        {batch.status === 'delivering' && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCompleteDelivery(batch.id);
                            }}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Complete Batch
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          className="flex-1"
                        >
                          <Route className="h-4 w-4 mr-2" />
                          View Route
                        </Button>
                      </div>
                    </div>

                    {/* Orders List */}
                    <div className="p-6">
                      <h4 className="font-semibold mb-4 flex items-center gap-2">
                        <MapPin className="h-5 w-5" />
                        Delivery Stops ({batch.orders.length})
                      </h4>
                      <div className="space-y-3">
                        {batch.orders.map((order, index) => (
                          <div 
                            key={order.id} 
                            className={`flex items-center justify-between p-4 rounded-lg border-2 ${
                              order.delivery_status === 'delivered' 
                                ? 'bg-green-50 border-green-200' 
                                : 'bg-white border-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                order.delivery_status === 'delivered'
                                  ? 'bg-green-500 text-white'
                                  : 'bg-blue-100 text-blue-600'
                              }`}>
                                {order.delivery_status === 'delivered' ? '✓' : index + 1}
                              </div>
                              <div>
                                <p className="font-medium">{order.customer?.name || 'N/A'}</p>
                                <p className="text-sm text-gray-600">
                                  {order.delivery_address?.street_address || 'N/A'}
                                </p>
                                {order.delivery_address?.phone && (
                                  <p className="text-xs text-gray-500">
                                    📞 {order.delivery_address.phone}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">{formatCurrency(order.total)}</p>
                              {order.delivery_status === 'delivered' && (
                                <p className="text-xs text-green-600">✅ Delivered</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {batches.length === 0 && (
          <Card className="border-2 border-gray-200">
            <CardContent className="p-12 text-center">
              <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Active Batches</h3>
              <p className="text-gray-600 mb-4">You don't have any assigned delivery batches at the moment.</p>
              <p className="text-sm text-gray-500">
                New batches will appear here when automatically assigned by the system.
              </p>
            </CardContent>
          </Card>
        )}
          </div>
        </>
      )}
    </div>
  );
}