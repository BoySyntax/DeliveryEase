import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, cleanImageUrl } from '../../lib/utils';
import Button from '../../ui/components/Button';
import { Card, CardContent } from '../../ui/components/Card';
import { Database } from '../../lib/database.types';
import Loader from '../../ui/components/Loader';
import { toast } from 'react-hot-toast';
import Select from '../../ui/components/Select';
import { Package, Users, MapPin, Weight, Truck, RefreshCw } from 'lucide-react';

type OrderStatus = Database['public']['Enums']['order_status'];

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
  status: 'pending' | 'assigned' | 'delivering' | 'delivered';
  driver_id: string | null;
  barangay: string;
  batch_number: number;
  total_weight: number;
  max_weight: number;
  driver: {
    id: string;
    name: string | null;
  } | null;
  orders: OrderData[];
}

type Driver = {
  id: string;
  name: string | null;
};

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
      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
        <span className="text-xs font-medium text-white">{initials}</span>
      </div>
    );
  }

  return (
    <img 
      src={cleanedUrl} 
      alt={customerName || ''} 
      className="w-8 h-8 object-cover rounded-full border border-gray-200"
      onError={handleImageError}
    />
  );
}

export default function BatchOrdersPage() {
  const [batches, setBatches] = useState<BatchData[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBarangay, setSelectedBarangay] = useState<string>('');

  useEffect(() => {
    loadData();
  }, [selectedBarangay]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refreshData();
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedBarangay]);

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
    // Load drivers first
      const { data: driversData } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('role', 'driver');

      if (driversData) {
        setDrivers(driversData);
      }

      // Load pending batches
      const { data: batchData, error: batchError } = await supabase
        .from('order_batches')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (batchError) throw batchError;

      // Load orders with detailed product information
      const batchIds = (batchData || []).map(batch => batch.id);
      
      let ordersData: any[] = [];
      if (batchIds.length > 0) {
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
          .in('batch_id', batchIds)
          .not('batch_id', 'is', null)
          .eq('approval_status', 'approved');

        if (ordersError) throw ordersError;
        ordersData = data || [];
      }

      // Combine the data
      const transformedBatches = (batchData || []).map((batch: any, index) => {
        const batchOrders = ordersData.filter(order => order.batch_id === batch.id);
        
        return {
          ...batch,
          batch_number: index + 1,
          barangay: batch.barangay || 'Unknown',
          driver: null,
          orders: batchOrders.map((order: any) => ({
            ...order,
            delivery_address: order.delivery_address || {
              region: '',
              province: '',
              city: '',
              barangay: batch.barangay || '',
              street_address: ''
            }
          }))
        } as BatchData;
      });

      // Filter batches by barangay if selected
      const filteredBatches = transformedBatches.filter(batch => {
        if (!selectedBarangay) return true;
        return batch.barangay === selectedBarangay;
      });

      // Debug log to check data
      console.log('Batch data:', filteredBatches);
      setBatches(filteredBatches);
  }

  const assignDriver = async (batchId: string, driverId: string) => {
    try {
      const { error } = await supabase
        .from('order_batches')
        .update({ 
          driver_id: driverId,
          status: 'assigned'
        })
        .eq('id', batchId);

      if (error) throw error;

      toast.success('Driver assigned successfully');
      loadData();
    } catch (error) {
      console.error('Error assigning driver:', error);
      toast.error('Failed to assign driver');
    }
  };

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
        <div className="absolute top-0 left-0 right-0 z-10 bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
          <span className="text-sm text-blue-700 font-medium">Updating batch data...</span>
        </div>
      )}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Order Batches</h1>
          <p className="text-gray-600 mt-1">Manage delivery batches grouped by location</p>
        </div>
        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={refreshData}
            disabled={refreshing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
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
          <Card key={batch.id} className="overflow-hidden shadow-lg">
            <CardContent className="p-0">
              {/* Batch Header */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 border-b border-gray-200">
                <div className="flex justify-between items-start">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-100 p-2 rounded-lg">
                        <Truck className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900">
                          Batch {batch.batch_number}
                        </h2>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <MapPin className="w-4 h-4" />
                          <span>{batch.barangay}</span>
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
                        <span>{batch.total_weight.toFixed(2)} kg</span>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500">
                      Created: {new Date(batch.created_at).toLocaleString()}
                    </p>

                    {/* Weight Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Total Weight</span>
                        <span className="text-sm font-bold text-gray-900">
                          {(batch.total_weight || 0).toFixed(2)} / {batch.max_weight || 3500} kg
                        </span>
                      </div>
                      
                      {/* Progress Bar like the image */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-gray-200 rounded-full h-6 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-700 ease-out ${
                              (batch.total_weight / batch.max_weight) > 0.9 
                                ? 'bg-red-500' 
                                : (batch.total_weight / batch.max_weight) > 0.7 
                                  ? 'bg-yellow-500' 
                                  : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(((batch.total_weight || 0) / (batch.max_weight || 3500)) * 100, 100)}%` }}
                          ></div>
                        </div>
                        <span className={`text-sm font-bold min-w-[3rem] ${
                          ((batch.total_weight || 0) / (batch.max_weight || 3500)) > 0.9 
                            ? 'text-red-600' 
                            : ((batch.total_weight || 0) / (batch.max_weight || 3500)) > 0.7 
                              ? 'text-yellow-600' 
                              : 'text-green-600'
                        }`}>
                          {(((batch.total_weight || 0) / (batch.max_weight || 3500)) * 100).toFixed(0)}%
                        </span>
                      </div>
                      
                      {/* Capacity Status */}
                      <div className="text-xs text-gray-500">
                        {((batch.max_weight || 3500) - (batch.total_weight || 0)).toFixed(2)} kg remaining capacity
                      </div>
                    </div>
                  </div>

                  {/* Driver Assignment */}
                  {batch.status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <Select
                        options={[
                          { value: '', label: 'Select Driver' },
                          ...drivers.map(driver => ({
                            value: driver.id,
                            label: driver.name || driver.id
                          }))
                        ]}
                        value=""
                        onChange={(e) => assignDriver(batch.id, e.target.value)}
                        className="w-48"
                      />
                    </div>
                  )}

                  {batch.driver?.name && (
                    <div className="flex items-center gap-2 bg-green-100 px-3 py-2 rounded-lg">
                      <Users className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-800">
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
                          <CustomerAvatar 
                            avatarUrl={order.customer?.avatar_url} 
                            customerName={order.customer?.name} 
                          />
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
                            <p className="text-lg font-semibold text-green-600">
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
                        Total Weight: {batch.total_weight.toFixed(2)} kg
                      </span>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-green-600">
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