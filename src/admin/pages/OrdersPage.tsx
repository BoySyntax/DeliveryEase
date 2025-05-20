import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import Select from '../../ui/components/Select';
import { Card, CardContent } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import { toast } from 'react-hot-toast';
import { Eye } from 'lucide-react';
import Button from '../../ui/components/Button';

// Types for the joined order and status
export type OrderStatusRow = {
  status_code: string;
  label: string;
  description: string | null;
  color: string | null;
};

export type PaymentStatus = 'pending' | 'verified' | 'rejected';

export type Order = {
  id: string;
  created_at: string | null;
  order_status_code: string;
  total: number;
  customer: {
    name: string | null;
  };
  driver: {
    name: string | null;
  } | null;
  items: {
    quantity: number;
    price: number;
    product: {
      name: string;
    };
  }[];
  payment_proof: {
    file_url: string;
    uploaded_at: string | null;
  } | null;
  status: OrderStatusRow | null;
};

type Driver = {
  id: string;
  name: string | null;
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | ''>('');
  const [selectedProof, setSelectedProof] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<OrderStatusRow[]>([]);

  useEffect(() => {
    loadStatuses();
    loadData();
  }, [statusFilter]);

  useEffect(() => {
    if (selectedProof) {
      console.log(selectedProof);
    }
  }, [selectedProof]);

  async function loadStatuses() {
    const { data, error } = await supabase.from('order_status' as any).select('*');
    if (!error && data) {
      // Filter out any objects that do not have status_code, label, description, color
      const validStatuses = (data as any[]).filter(
        (s) => s && typeof s.status_code === 'string' && typeof s.label === 'string'
      ) as OrderStatusRow[];
      setStatuses(validStatuses);
    }
  }

  async function loadData() {
    try {
      // Load drivers
      const { data: driversData } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('role', 'driver');
      if (driversData) {
        setDrivers(driversData as Driver[]);
      }
      // Build orders query with join to order_status
      let query = supabase
        .from('orders')
        .select(`
          id,
          created_at,
          order_status_code,
          total,
          customer:profiles!orders_customer_id_fkey(name),
          driver:profiles!orders_driver_id_fkey(name),
          items:order_items(
            quantity,
            price,
            product:products(name)
          ),
          payment_proof:payment_proofs(
            file_url,
            uploaded_at
          ),
          status:order_status(*)
        `)
        .order('created_at', { ascending: false });
      if (statusFilter) {
        query = query.eq('order_status_code', statusFilter);
      }
      const { data: ordersData, error } = await query;
      if (error) throw error;
      // Transform the data to match our Order type
      const transformedOrders = (ordersData as any[] || []).map(order => ({
        id: order.id,
        created_at: order.created_at,
        order_status_code: order.order_status_code,
        total: order.total,
        customer: order.customer,
        driver: order.driver,
        items: order.items,
        payment_proof: order.payment_proof?.[0] || null,
        status: order.status || null,
      })) as Order[];
      // Always generate a public URL for the payment proof image
      const ordersWithPublicUrls = await Promise.all(transformedOrders.map(async (order) => {
        if (order.payment_proof && order.payment_proof.file_url) {
          let fileUrl = order.payment_proof.file_url;
          if (!fileUrl.startsWith('http')) {
            const { data } = supabase
              .storage
              .from('payment-proof')
              .getPublicUrl(fileUrl);
            fileUrl = data.publicUrl;
          }
          return {
            ...order,
            payment_proof: {
              ...order.payment_proof,
              file_url: fileUrl
            }
          };
        }
        return order;
      }));
      setOrders(ordersWithPublicUrls);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }

  const handleAssignDriver = async (orderId: string, driverId: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          driver_id: driverId
        })
        .eq('id', orderId);
      if (error) throw error;
      setOrders(orders.map(order =>
        order.id === orderId
          ? {
              ...order,
              driver: drivers.find(d => d.id === driverId) || null
            }
          : order
      ));
      toast.success('Driver assigned successfully');
    } catch (error) {
      console.error('Error assigning driver:', error);
      toast.error('Failed to assign driver');
    }
  };

  // Delivery status update handlers
  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ order_status_code: newStatus })
        .eq('id', orderId);
      if (error) throw error;
      await loadData(); // Reload from database to ensure UI matches backend
      toast.success(`Order status updated to ${newStatus}`);
    } catch (error) {
      toast.error('Failed to update order status');
    }
  };

  // Reject order handler
  const handleRejectOrder = async (orderId: string) => {
    await handleUpdateOrderStatus(orderId, 'rejected');
  };

  if (loading) {
    return <Loader label="Loading orders..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900">Orders</h1>
        <Select
          options={[
            { value: '', label: 'All Status' },
            ...statuses.map(s => ({ value: s.status_code, label: s.label }))
          ]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-48"
        />
      </div>

      {/* Payment Proof Modal */}
      {selectedProof && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg max-w-2xl w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Payment Proof</h3>
              <Button
                variant="ghost"
                onClick={() => setSelectedProof(null)}
              >
                Close
              </Button>
            </div>
            <img
              src={selectedProof || ''}
              alt="Payment Proof"
              className="mx-auto max-w-xs max-h-80 rounded-lg"
              onError={(e) => { e.currentTarget.src = '/placeholder.png'; }}
            />
          </div>
        </div>
      )}

      <div className="space-y-4">
        {orders.map((order) => (
          <Card key={order.id}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-gray-500">
                    Order #{order.id.slice(0, 8)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A'}
                  </p>
                  <p className="text-sm font-medium mt-1">
                    Customer: {order.customer.name || 'N/A'}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium`}
                    style={{ backgroundColor: order.status?.color || '#eee', color: '#222' }}
                  >
                    {order.status?.label || order.order_status_code}
                  </span>
                  <div className="mt-2">
                    {/* Payment status removed, only show proof if exists */}
                    {order.payment_proof && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Payment Proof Uploaded
                      </span>
                    )}
                  </div>
                  <p className="text-xl font-bold text-primary-600 mt-2">
                    {formatCurrency(order.total)}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">
                  Order Items
                </h4>
                <div className="space-y-2">
                  {order.items.map((item, index) => (
                    <div
                      key={index}
                      className="flex justify-between text-sm"
                    >
                      <span className="text-gray-600">
                        {item.quantity}x {item.product.name}
                      </span>
                      <span className="font-medium">
                        {formatCurrency(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Proof Section */}
              {order.payment_proof && (
                <div className="border-t mt-4 pt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">
                    Payment Proof
                  </h4>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedProof(order.payment_proof?.file_url || null)}
                      icon={<Eye size={16} />}
                    >
                      View Proof
                    </Button>
                    <span className="text-sm text-gray-500">
                      Uploaded: {order.payment_proof.uploaded_at ? new Date(order.payment_proof.uploaded_at).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>
              )}

              {/* Assign Driver */}
              {order.status?.status_code === 'verified' && (
                <div className="border-t mt-4 pt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">
                    Assign Driver
                  </h4>
                  <Select
                    options={[
                      { value: '', label: 'Select Driver' },
                      ...drivers.map(driver => ({
                        value: driver.id,
                        label: driver.name || driver.id
                      }))
                    ]}
                    onChange={(e) => handleAssignDriver(order.id, e.target.value)}
                  />
                </div>
              )}

              {order.driver && (
                <div className="border-t mt-4 pt-4">
                  <h4 className="text-sm font-medium text-gray-900">
                    Assigned Driver
                  </h4>
                  <p className="text-sm text-gray-600">
                    {order.driver.name || 'N/A'}
                  </p>
                </div>
              )}

              {/* Order Status Actions */}
              {order.status?.status_code === 'pending' && order.payment_proof && (
                <div className="flex space-x-2 mt-4">
                  <Button variant="primary" size="sm" onClick={() => handleUpdateOrderStatus(order.id, 'verified')}>
                    Verify Order
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleRejectOrder(order.id)}>
                    Reject Order
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {orders.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No orders found</p>
          </div>
        )}
      </div>
    </div>
  );
}