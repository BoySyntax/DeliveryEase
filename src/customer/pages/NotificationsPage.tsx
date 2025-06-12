import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import Loader from '../../ui/components/Loader';
import { Link, useNavigate } from 'react-router-dom';

// Types
interface Order {
  id: string;
  created_at: string | null;
  order_status_code: string | null;
  status: {
    label: string;
    color: string | null;
  } | null;
  notification_read?: boolean;
}

export default function NotificationsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const allSelected = orders.length > 0 && selected.length === orders.length;

  useEffect(() => {
    async function fetchOrders() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setLoading(false);

      const { data, error } = await supabase
        .from('orders')
        .select('id, created_at, order_status_code, notification_read, status:order_status(label, color)')
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

  // Handle notification click: mark as read and navigate
  const handleNotificationClick = async (id: string) => {
    await supabase
      .from('orders')
      .update({ notification_read: true })
      .eq('id', id);
    setOrders(orders =>
      orders.map(order =>
        order.id === id ? { ...order, notification_read: true } : order
      )
    );
    navigate(`/customer/orders/${id}`);
  };

  // Handle select all
  const handleSelectAll = () => {
    if (allSelected) {
      setSelected([]);
    } else {
      setSelected(orders.map(order => order.id));
    }
  };

  // Handle select one
  const handleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]);
  };

  // Bulk delete selected
  const handleDeleteSelected = async () => {
    if (selected.length === 0) return;
    const { error } = await supabase
      .from('orders')
      .update({ notification_dismissed: true })
      .in('id', selected);
    if (!error) {
      setOrders(orders => orders.filter(order => !selected.includes(order.id)));
      setSelected([]);
    } else {
      alert('Failed to delete selected notifications: ' + error.message);
    }
  };

  if (loading) return <Loader label="Loading notifications..." />;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-semibold mb-6">Order Notifications</h1>
      {orders.length > 0 && (
        <div className="flex items-center mb-4 gap-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={handleSelectAll}
              className="form-checkbox h-4 w-4 text-primary-600 border-gray-300 rounded"
            />
            <span className="text-sm">Select All</span>
          </label>
          <button
            onClick={handleDeleteSelected}
            disabled={selected.length === 0}
            className={`ml-2 px-3 py-1 rounded bg-red-500 text-white text-sm font-medium shadow hover:bg-red-600 transition disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Delete Selected
          </button>
        </div>
      )}
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
                <input
                  type="checkbox"
                  checked={selected.includes(order.id)}
                  onChange={() => handleSelect(order.id)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-600 border-gray-300 rounded"
                  style={{ zIndex: 2 }}
                />
                <div
                  onClick={() => handleNotificationClick(order.id)}
                  className={`block rounded-lg shadow p-4 transition cursor-pointer ${
                    !order.notification_read
                      ? 'bg-blue-50 border-l-4 border-blue-500 font-semibold'
                      : 'bg-white'
                  } hover:bg-blue-100 pl-8`}
                  title="View order details"
                  role="button"
                  tabIndex={0}
                  onKeyPress={e => { if (e.key === 'Enter') handleNotificationClick(order.id); }}
                >
                  {/* Dot indicator for unread */}
                  {!order.notification_read && (
                    <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-2 align-middle"></span>
                  )}
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
                </div>
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