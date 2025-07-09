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
  order_status_code: string;
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
  status: {
    label: string;
    color: string | null;
  } | null;
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
          ),
          status:order_status(*)
        `)
        .eq('driver_id', user.id)
        .in('order_status_code', ['assigned', 'delivering'])
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

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ order_status_code: newStatus })
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
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">My Orders</h1>
      <div className="grid gap-6">
        {orders.map(order => (
          <Card key={order.id}>
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-lg font-semibold mb-2">
                    Order #{order.id.slice(0, 8)}
                  </h2>
                  <p className="text-gray-600 mb-2">
                    Customer: {order.customer.name}
                  </p>
                  <div className="inline-block px-3 py-1 rounded-full text-sm mb-4"
                    style={{
                      backgroundColor: order.status?.color || '#eee',
                      color: '#1a1a1a'
                    }}>
                    {order.status?.label || order.order_status_code}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">
                    {formatCurrency(order.total)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {new Date(order.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-2">Items:</h3>
                <ul className="space-y-2">
                  {order.items.map((item, index) => (
                    <li key={index} className="flex justify-between">
                      <span>{item.product.name} × {item.quantity}</span>
                      <span>{formatCurrency(item.price * item.quantity)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 flex justify-end space-x-4">
                {order.order_status_code === 'assigned' && (
                  <Button onClick={() => handleUpdateStatus(order.id, 'delivering')}>
                    Start Delivery
                  </Button>
                )}
                {order.order_status_code === 'delivering' && (
                  <Button onClick={() => handleUpdateStatus(order.id, 'delivered')}>
                    Mark as Delivered
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {orders.length === 0 && (
          <p className="text-center text-gray-500">No active orders found.</p>
        )}
      </div>
    </div>
  );
}