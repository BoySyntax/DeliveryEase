import { useState, useEffect, useRef } from 'react';
import { Package, Clock, CheckCircle, Truck, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import Loader from '../../ui/components/Loader';
import { toast } from 'react-hot-toast';
import React from 'react';

type OrderStatusRow = {
  status_code: string;
  label: string;
  description: string | null;
  color: string | null;
};

type Order = {
  id: string;
  created_at: string;
  order_status_code: string;
  total: number;
  status: OrderStatusRow | null;
  items: {
    product: {
      name: string;
      image_url?: string;
    };
    quantity: number;
    price: number;
  }[];
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const prevOrderStatuses = useRef<{ [id: string]: string } | null>(null);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 5000); // refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!loading && orders.length > 0) {
      if (prevOrderStatuses.current) {
        orders.forEach(order => {
          const prevStatus = prevOrderStatuses.current?.[order.id];
          if (prevStatus && prevStatus !== order.order_status_code) {
            toast.success(`Order #${order.id.slice(0, 8)} status updated: ${order.status?.label || order.order_status_code}`);
          }
        });
      }
      // Update the ref with current statuses
      prevOrderStatuses.current = Object.fromEntries(orders.map(o => [o.id, o.order_status_code]));
    }
  }, [orders, loading]);

  async function loadOrders() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          order_status_code,
          total,
          status:order_status(*),
          items:order_items (
            quantity,
            price,
            product:products (
              name,
              image_url
            )
          )
        `)
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Map to correct type
      const mapped = (data as any[] || []).map(order => ({
        id: order.id,
        created_at: order.created_at,
        order_status_code: order.order_status_code,
        total: order.total,
        status: order.status || null,
        items: order.items,
      })) as Order[];
      // Sort: rejected first, then pending, then by created_at descending
      mapped.sort((a, b) => {
        if (a.status?.status_code === 'rejected' && b.status?.status_code !== 'rejected') return -1;
        if (a.status?.status_code !== 'rejected' && b.status?.status_code === 'rejected') return 1;
        if (a.status?.status_code === 'pending' && b.status?.status_code !== 'pending') return -1;
        if (a.status?.status_code !== 'pending' && b.status?.status_code === 'pending') return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setOrders(mapped);
      console.log('Fetched orders:', mapped);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }

  const statusSteps = [
    { code: 'rejected', icon: <XCircle size={18} />, label: 'Rejected', color: 'bg-red-500 border-red-500 text-white', labelColor: 'text-red-500' },
    { code: 'pending', icon: <Clock size={18} />, label: 'Pending', color: 'bg-yellow-400 border-yellow-400 text-white', labelColor: 'text-yellow-500' },
    { code: 'verified', icon: <CheckCircle size={18} />, label: 'Verified', color: 'bg-blue-500 border-blue-500 text-white', labelColor: 'text-blue-500' },
    { code: 'out_for_delivery', icon: <Truck size={18} />, label: 'Deliver', color: 'bg-green-500 border-green-500 text-white', labelColor: 'text-green-500' },
  ];

  // Filter orders based on statusFilter
  const filteredOrders = statusFilter
    ? orders.filter(order => order.status?.status_code === statusFilter)
    : orders;

  if (loading) {
    return <Loader label="Loading orders..." />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">My Orders</h1>

      {/* Always show the tracker */}
      <div className="w-full flex justify-center mb-6 px-2">
        <div className="flex items-center w-full max-w-2xl gap-2">
          {statusSteps.map((step, idx) => {
            const isActive = statusFilter === step.code;
            // Count orders for this status
            const count = orders.filter(order => order.status?.status_code === step.code).length;
            return (
              <React.Fragment key={String(step.code)}>
                <div className="flex flex-col items-center flex-1 relative">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setStatusFilter(isActive ? '' : step.code)}
                      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-xl font-bold focus:outline-none transition-all
                        ${isActive ? step.color : 'bg-gray-200 border-gray-300 text-gray-400 hover:bg-blue-100 hover:border-blue-400'}`}
                      title={step.label}
                    >
                      {step.icon}
                    </button>
                    {count > 0 && (
                      <span
                        className={`absolute -top-2 -right-2 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full border-2 border-white text-xs font-bold ${step.labelColor} bg-white shadow`}
                        style={{ zIndex: 1 }}
                        title={`${count} order(s)`}
                      >
                        {count}
                      </span>
                    )}
                  </div>
                  <span className={`mt-1 text-xs font-medium ${isActive ? step.labelColor : 'text-gray-500'}`}>{step.label}</span>
                </div>
                {idx < statusSteps.length - 1 && (
                  <div className={`flex-1 h-1 sm:h-2 ${isActive || statusFilter === '' ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Show orders or empty state */}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-block p-4 rounded-full bg-gray-100 mb-4">
            <Package size={32} className="text-gray-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No orders yet</h2>
          <p className="text-gray-600">Your order history will appear here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            return (
              <div
                key={order.id}
                className="bg-white rounded-lg shadow-sm overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm text-gray-500">
                        Order #{order.id.slice(0, 8)}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(order.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: order.status?.color || '#eee', color: '#222' }}
                    >
                      {order.status?.label || order.order_status_code}
                    </span>
                  </div>

                  <div className="divide-y">
                    {order.items.map((item, index) => (
                      <div key={index} className="py-3 flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                          {item.product.image_url && (
                            <img
                              src={item.product.image_url}
                              alt={item.product.name}
                              className="w-20 h-20 rounded object-cover border"
                            />
                          )}
                          <div>
                            <p className="text-sm text-gray-900">{item.product.name}</p>
                            <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                          </div>
                        </div>
                        <p className="text-sm font-medium text-gray-900">
                          {formatCurrency(item.price * item.quantity)}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="border-t mt-4 pt-4 flex justify-between items-center">
                    <span className="text-base font-medium text-gray-900">Total</span>
                    <span className="text-xl font-bold text-primary-600">
                      {formatCurrency(order.total)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}