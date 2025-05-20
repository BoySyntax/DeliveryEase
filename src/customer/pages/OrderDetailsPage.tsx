import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import Loader from '../../ui/components/Loader';
import { formatCurrency } from '../../lib/utils';

export default function OrderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrder() {
      setLoading(true);
      if (!id) {
        setOrder(null);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          order_status_code,
          total,
          status:order_status(label, color),
          items:order_items(
            quantity,
            price,
            product:products(name, image_url)
          )
        `)
        .eq('id', id)
        .single();
      if (!error && data) {
        setOrder(data);
      } else {
        setOrder(null);
      }
      setLoading(false);
    }
    fetchOrder();
  }, [id]);

  if (loading) return <Loader label="Loading order details..." />;
  if (!order) return <div className="text-center text-gray-500 py-12">Order not found.</div>;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <button
        className="mb-4 text-primary-600 hover:underline"
        onClick={() => navigate(-1)}
      >
        &larr; Back
      </button>
      <h1 className="text-2xl font-semibold mb-2">Order #{order.id.slice(0, 8)}</h1>
      <div className="mb-4 flex items-center space-x-2">
        <span
          className="inline-block px-2 py-1 rounded-full text-xs font-semibold"
          style={{ backgroundColor: order.status?.color || '#eee', color: '#222' }}
        >
          {order.status?.label || order.order_status_code}
        </span>
        <span className="text-xs text-gray-400">
          {order.created_at ? new Date(order.created_at).toLocaleString() : 'N/A'}
        </span>
      </div>
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h2 className="text-lg font-medium mb-2">Order Items</h2>
        <ul className="divide-y">
          {order.items.map((item: any, idx: number) => (
            <li key={idx} className="py-3 flex items-center space-x-4">
              {item.product.image_url && (
                <img
                  src={item.product.image_url}
                  alt={item.product.name}
                  className="w-16 h-16 rounded object-cover border"
                />
              )}
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">{item.product.name}</div>
                <div className="text-xs text-gray-500">Qty: {item.quantity}</div>
              </div>
              <div className="text-sm font-semibold text-gray-900">
                {formatCurrency(item.price * item.quantity)}
              </div>
            </li>
          ))}
        </ul>
        <div className="border-t mt-4 pt-4 flex justify-between items-center">
          <span className="text-base font-medium text-gray-900">Total</span>
          <span className="text-xl font-bold text-primary-600">
            {formatCurrency(order.total)}
          </span>
        </div>
      </div>
    </div>
  );
} 