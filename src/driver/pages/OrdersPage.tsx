import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '../../lib/utils';
import Button from '../../ui/components/Button';
import { Card, CardContent } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import { toast } from 'react-hot-toast';

type Order = {
  id: string;
  created_at: string;
  status: 'assigned' | 'delivering' | 'delivered';
  total: number;
  customer: {
    name: string;
  };
  items: {
    quantity: number;
    price: number;
    product: {
      name: string;
    };
  }[];
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, []);

  async function loadOrders() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:profiles!orders_customer_id_fkey(name),
          items:order_items(
            quantity,
            price,
            product:products(name)
          )
        `)
        .eq('driver_id', user.id)
        .in('status', ['assigned', 'delivering'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }

  const handleUpdateStatus = async (orderId: string, newStatus: 'delivering' | 'delivered') => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;

      setOrders(orders.filter(order => order.id !== orderId));
      toast.success(`Order marked as ${newStatus}`);
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error('Failed to update order');
    }
  };

  if (loading) {
    return <Loader label="Loading orders..." />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Active Orders</h1>

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
                    {new Date(order.created_at).toLocaleDateString()}
                  </p>
                  <p className="text-sm font-medium mt-1">
                    Customer: {order.customer.name}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      ORDER_STATUS_COLORS[order.status]
                    }`}
                  >
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
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

              <div className="border-t mt-4 pt-4">
                <div className="flex justify-end space-x-2">
                  {order.status === 'assigned' && (
                    <Button
                      onClick={() => handleUpdateStatus(order.id, 'delivering')}
                    >
                      Start Delivery
                    </Button>
                  )}
                  {order.status === 'delivering' && (
                    <Button
                      onClick={() => handleUpdateStatus(order.id, 'delivered')}
                    >
                      Mark as Delivered
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {orders.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No active orders</p>
          </div>
        )}
      </div>
    </div>
  );
}