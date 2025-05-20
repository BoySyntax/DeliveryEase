import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import Loader from '../../ui/components/Loader';
import { Link } from 'react-router-dom';

// Types
interface Order {
  id: string;
  created_at: string | null;
  order_status_code: string | null;
  status: {
    label: string;
    color: string | null;
  } | null;
}

export default function NotificationsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setLoading(false);

      const { data, error } = await supabase
        .from('orders')
        .select('id, created_at, order_status_code, status:order_status(label, color)')
        .eq('customer_id', user.id)
        .eq('notification_dismissed', false)
        .order('created_at', { ascending: false });
      if (!error && data) {
        setOrders(data);
      }
      setLoading(false);
    }
    fetchOrders();
  }, []);

  // Delete notification from UI and persist in DB
  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ notification_dismissed: true })
      .eq('id', id);
    if (!error) {
      setOrders(orders => orders.filter(order => order.id !== id));
    } else {
      alert('Failed to delete notification: ' + error.message);
    }
  };

  if (loading) return <Loader label="Loading notifications..." />;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-semibold mb-6">Order Notifications</h1>
      {orders.length === 0 ? (
        <div className="text-center text-gray-500">No notifications.</div>
      ) : (
        <ul className="space-y-4">
          {orders.map(order => {
            let statusMsg = '';
            if (order.status?.label) {
              statusMsg = `Your order #${order.id.slice(0, 8)} has been ${order.status.label.toLowerCase()}.`;
            } else {
              statusMsg = `Your order #${order.id.slice(0, 8)} status: ${order.order_status_code ?? ''}`;
            }
            return (
              <li key={order.id} className="relative group">
                <Link
                  to={`/customer/orders/${order.id}`}
                  className="block bg-white rounded-lg shadow p-4 hover:bg-blue-50 transition cursor-pointer"
                  title="View order details"
                >
                  <div className="text-sm text-gray-900 mb-1">{statusMsg}</div>
                  <div className="flex items-center">
                    <span
                      className="inline-block px-2 py-1 rounded-full text-xs font-semibold mr-2"
                      style={{ backgroundColor: order.status?.color || '#eee', color: '#222' }}
                    >
                      {order.status?.label || (order.order_status_code ?? '')}
                    </span>
                    <span className="text-xs text-gray-400">
                      {order.created_at ? new Date(order.created_at).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </Link>
                <button
                  onClick={() => handleDelete(order.id)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-red-500 bg-white rounded-full p-1 shadow group-hover:visible invisible"
                  title="Delete notification"
                >
                  &times;
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
} 