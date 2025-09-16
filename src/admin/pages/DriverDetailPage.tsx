import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import { getInitials } from '../../lib/utils';
import { toast } from 'react-hot-toast';
import { 
  ArrowLeft, 
  User, 
  Truck, 
  Package, 
  MapPin, 
  Phone, 
  Calendar, 
  Weight,
  Hash,
  DollarSign,
  Navigation
} from 'lucide-react';

interface DriverInfo {
  id: string;
  name: string | null;
  avatar_url: string | null;
  active_orders: number;
  total_orders: number;
  first_order_date?: string;
}

interface Vehicle {
  id: string;
  plate_number: string;
  vehicle_type: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  capacity_kg: number | null;
  fuel_type: string | null;
  is_active: boolean;
  created_at: string;
}

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  product: {
    id: string;
    name: string;
    image_url: string | null;
    weight: number;
  } | null;
}

interface Order {
  id: string;
  created_at: string;
  total: number;
  total_weight: number;
  delivery_status: string;
  delivery_address: {
    full_name: string;
    phone: string;
    street_address: string;
    barangay: string;
  } | null;
  customer: {
    name: string | null;
  } | null;
  items: OrderItem[];
}

interface OrderBatch {
  id: string;
  status: string;
  total_weight: number;
  max_weight: number;
  barangay: string;
  created_at: string;
  assigned_at: string | null;
  orders: Order[];
}

export default function DriverDetailPage() {
  const { driverId } = useParams<{ driverId: string }>();
  const navigate = useNavigate();
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [orderBatches, setOrderBatches] = useState<OrderBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (driverId) {
      loadDriverData();
    }
  }, [driverId]);

  async function loadDriverData() {
    try {
      setLoading(true);
      
      // Load driver info with statistics
      const { data: driverData, error: driverError } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .eq('id', driverId)
        .eq('role', 'driver')
        .single();

      if (driverError) throw driverError;

      // Calculate driver statistics
      const { data: activeBatches } = await supabase
        .from('order_batches')
        .select('id, status')
        .eq('driver_id', driverId)
        .in('status', ['assigned', 'delivering']);

      let activeOrders = 0;
      if (activeBatches && activeBatches.length > 0) {
        const batchIds = activeBatches.map(batch => batch.id);
        const { count: ordersInBatches } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .in('batch_id', batchIds);
        activeOrders = ordersInBatches || 0;
      }

      const { count: totalOrders } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('driver_id', driverId)
        .eq('delivery_status', 'delivered');

      // Get the first order date for this driver
      const { data: firstOrder } = await supabase
        .from('orders')
        .select('created_at')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      setDriver({
        ...driverData,
        active_orders: activeOrders,
        total_orders: totalOrders || 0,
        first_order_date: firstOrder?.created_at,
      });

      // Load vehicle information
      const { data: vehicleData, error: vehicleError } = await supabase
        .from('vehicles')
        .select('*')
        .eq('driver_id', driverId)
        .single();

      if (vehicleError && vehicleError.code !== 'PGRST116') {
        console.error('Error loading vehicle:', vehicleError);
      } else if (vehicleData) {
        setVehicle(vehicleData);
      }

      // Load order batches with orders and items
      const { data: batchesData, error: batchesError } = await supabase
        .from('order_batches')
        .select(`
          id,
          status,
          total_weight,
          max_weight,
          barangay,
          created_at
        `)
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false });

      if (batchesError) throw batchesError;

      // Load orders for each batch
      const batchesWithOrders = await Promise.all(
        (batchesData || []).map(async (batch) => {
          const { data: ordersData, error: ordersError } = await supabase
            .from('orders')
            .select(`
              id,
              created_at,
              total,
              total_weight,
              delivery_status,
              delivery_address,
              customer:profiles!orders_customer_id_fkey(name),
              items:order_items(
                id,
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
            .eq('batch_id', batch.id)
            .order('created_at', { ascending: false });

          if (ordersError) {
            console.error('Error loading orders for batch:', batch.id, ordersError);
            return { ...batch, orders: [] };
          }

          return {
            ...batch,
            assigned_at: batch.status === 'assigned' || batch.status === 'delivering' ? batch.created_at : null,
            orders: ordersData || [],
          };
        })
      );

      setOrderBatches(batchesWithOrders);

    } catch (error) {
      console.error('Error loading driver data:', error);
      toast.error('Failed to load driver information');
    } finally {
      setLoading(false);
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatBatchName = (batch: OrderBatch) => {
    const date = new Date(batch.created_at);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${batch.barangay} - ${dateStr}`;
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      assigned: 'bg-blue-100 text-blue-800',
      delivering: 'bg-purple-100 text-purple-800',
      delivered: 'bg-green-100 text-green-800',
      completed: 'bg-green-100 text-green-800',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  };

  if (loading) {
    return <Loader label="Loading driver information..." />;
  }

  if (!driver) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Driver not found</p>
        <button
          onClick={() => navigate('/admin/drivers')}
          className="mt-4 text-blue-600 hover:text-blue-800"
        >
          Back to Drivers
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/admin/drivers')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {driver.name || 'Unknown Driver'}
          </h1>
          <p className="text-sm text-gray-500">Driver Details</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Driver Information */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-blue-600" />
                Driver Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-4">
                {driver.avatar_url ? (
                  <img
                    src={driver.avatar_url}
                    alt={driver.name || 'Driver'}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-medium text-xl">
                    {getInitials(driver.name || 'Unknown Driver')}
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    {driver.name || 'Unknown Driver'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    ID: {driver.id.slice(0, 8)}
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {driver.first_order_date 
                      ? `First delivery: ${formatDate(driver.first_order_date)}`
                      : `Driver ID: ${driver.id.slice(0, 12)}...`
                    }
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="text-center">
                  <p className="text-2xl font-semibold text-blue-600">
                    {driver.active_orders}
                  </p>
                  <p className="text-sm text-gray-500">Active Deliveries</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-semibold text-green-600">
                    {driver.total_orders}
                  </p>
                  <p className="text-sm text-gray-500">Total Deliveries</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vehicle Information */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-blue-600" />
                Vehicle Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              {vehicle ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-gray-400" />
                    <span className="font-medium">{vehicle.plate_number}</span>
                    {vehicle.is_active && (
                      <span className="ml-auto px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Type:</span>
                      <span className="capitalize">{vehicle.vehicle_type}</span>
                    </div>
                    {vehicle.brand && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Brand:</span>
                        <span>{vehicle.brand}</span>
                      </div>
                    )}
                    {vehicle.model && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Model:</span>
                        <span>{vehicle.model}</span>
                      </div>
                    )}
                    {vehicle.year && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Year:</span>
                        <span>{vehicle.year}</span>
                      </div>
                    )}
                    {vehicle.capacity_kg && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Capacity:</span>
                        <span className="flex items-center gap-1">
                          <Weight className="h-3 w-3" />
                          {vehicle.capacity_kg} kg
                        </span>
                      </div>
                    )}
                    {vehicle.fuel_type && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Fuel:</span>
                        <span className="capitalize">{vehicle.fuel_type}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <Truck className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No vehicle registered</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Order Batches */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-600" />
                Order Batches ({orderBatches.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {orderBatches.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No order batches assigned</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {orderBatches.map((batch) => (
                    <div key={batch.id} className="border rounded-lg p-4">
                      {/* Batch Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="font-medium text-gray-900">
                            {formatBatchName(batch)}
                          </h3>
                          <p className="text-xs text-gray-400">
                            ID: {batch.id.slice(0, 8)}
                          </p>
                          <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {batch.barangay}
                            </span>
                            <span className="flex items-center gap-1">
                              <Weight className="h-3 w-3" />
                              {batch.total_weight}kg / {batch.max_weight}kg
                            </span>
                            <span className="flex items-center gap-1">
                              <Package className="h-3 w-3" />
                              {batch.orders.length} orders
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          {getStatusBadge(batch.status)}
                          <p className="text-xs text-gray-500 mt-1">
                            {batch.assigned_at ? formatDate(batch.assigned_at) : formatDate(batch.created_at)}
                          </p>
                        </div>
                      </div>

                      {/* Orders in Batch */}
                      <div className="space-y-3">
                        {batch.orders.map((order) => (
                          <div key={order.id} className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <p className="font-medium text-sm">
                                  Order #{order.id.slice(0, 8)}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Customer: {order.customer?.name || 'Unknown'}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatDate(order.created_at)}
                                </p>
                              </div>
                              <div className="text-right">
                                {getStatusBadge(order.delivery_status)}
                                <p className="text-sm font-medium text-gray-900 mt-1">
                                  ₱{order.total.toFixed(2)}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {order.total_weight}kg
                                </p>
                              </div>
                            </div>

                            {/* Delivery Address */}
                            {order.delivery_address && (
                              <div className="bg-white rounded p-2 mb-3">
                                <div className="flex items-start gap-2">
                                  <Navigation className="h-3 w-3 text-gray-400 mt-0.5" />
                                  <div className="text-xs">
                                    <p className="font-medium">{order.delivery_address.full_name}</p>
                                    <p className="text-gray-600">{order.delivery_address.street_address}</p>
                                    <p className="text-gray-600">{order.delivery_address.barangay}</p>
                                    <p className="text-gray-600 flex items-center gap-1">
                                      <Phone className="h-3 w-3" />
                                      {order.delivery_address.phone}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Order Items */}
                            {order.items && order.items.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-gray-700 mb-2">
                                  Items ({order.items.length}):
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {order.items.map((item) => (
                                    <div key={item.id} className="flex items-center gap-2 bg-white rounded p-2">
                                      {item.product?.image_url ? (
                                        <img
                                          src={item.product.image_url}
                                          alt={item.product.name || 'Product'}
                                          className="w-8 h-8 rounded object-cover"
                                        />
                                      ) : (
                                        <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center">
                                          <Package className="w-4 h-4 text-gray-400" />
                                        </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium truncate">
                                          {item.product?.name || 'Unknown Product'}
                                        </p>
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                          <span>Qty: {item.quantity}</span>
                                          <span>₱{item.price.toFixed(2)}</span>
                                          {item.product?.weight && (
                                            <span>{item.product.weight}kg</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
