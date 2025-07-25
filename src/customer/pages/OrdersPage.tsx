import { useState, useEffect, useRef } from 'react';
import { Package, Clock, CheckCircle, Truck, XCircle, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, cleanImageUrl } from '../../lib/utils';
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
  approval_status: 'pending' | 'approved' | 'rejected';
  delivery_status: string | null;
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
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const prevOrderStatuses = useRef<{ [id: string]: string } | null>(null);

  // Helper function to calculate estimated delivery date range
  function getEstimatedDeliveryDate(orderCreatedAt: string): string {
    const createdDate = new Date(orderCreatedAt);
    const now = new Date();
    
    // If order was created today, estimate delivery starting tomorrow
    // Otherwise, estimate delivery starting from today
    const startDate = new Date();
    if (createdDate.toDateString() === now.toDateString()) {
      startDate.setDate(startDate.getDate() + 1);
    }
    
    // Delivery window is 1-3 days from start date
    const minDeliveryDate = new Date(startDate);
    const maxDeliveryDate = new Date(startDate);
    maxDeliveryDate.setDate(maxDeliveryDate.getDate() + 2); // 3 days max
    
    const formatDate = (date: Date) => {
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const day = date.getDate();
      return `${month} ${day}`;
    };
    
    // If same day delivery window, show single date
    if (minDeliveryDate.toDateString() === maxDeliveryDate.toDateString()) {
      return formatDate(minDeliveryDate);
    }
    
    // If consecutive days in same month, show "July 17-19"
    if (minDeliveryDate.getMonth() === maxDeliveryDate.getMonth()) {
      const month = minDeliveryDate.toLocaleDateString('en-US', { month: 'long' });
      return `${month} ${minDeliveryDate.getDate()}-${maxDeliveryDate.getDate()}`;
    }
    
    // If different months, show "July 30-Aug 1"
    return `${formatDate(minDeliveryDate)}-${formatDate(maxDeliveryDate)}`;
  }

  // Helper function to check if order is assigned to driver (should show estimated delivery)
  function isOrderAssignedToDriver(order: Order): boolean {
    return order.delivery_status === 'assigned' || order.delivery_status === 'delivering';
  }

  // Helper function to determine the display status based on approval and delivery status
  function getDisplayStatus(order: Order): string {
    // Debug: Log the status calculation for this order
    console.log(`🔍 Status calculation for Order ${order.id.slice(0, 8)}:`, {
      approval_status: order.approval_status,
      delivery_status: order.delivery_status,
      order_status_code: order.order_status_code
    });
    
    // If rejected, show rejected
    if (order.approval_status === 'rejected') {
      console.log(`   → Returning 'rejected'`);
      return 'rejected';
    }
    
    // If still pending approval, show pending
    if (order.approval_status === 'pending') {
      console.log(`   → Returning 'pending'`);
      return 'pending';
    }
    
    // If approved, check delivery status
    if (order.approval_status === 'approved') {
      if (order.delivery_status === 'delivered') {
        console.log(`   → Returning 'delivered'`);
        return 'delivered';
      } else if (order.delivery_status === 'assigned' || order.delivery_status === 'delivering') {
        console.log(`   → Returning 'out_for_delivery'`);
        return 'out_for_delivery';
      } else {
        console.log(`   → Returning 'verified' (pending delivery status)`);
        return 'verified'; // For pending delivery status
      }
    }
    
    // Fallback to original status code
    console.log(`   → Returning fallback: '${order.order_status_code || 'pending'}'`);
    return order.order_status_code || 'pending';
  }

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 5000); // refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (orders.length > 0) {
      if (prevOrderStatuses.current) {
        orders.forEach(order => {
          const currentDisplayStatus = getDisplayStatus(order);
          const prevStatus = prevOrderStatuses.current?.[order.id];
          if (prevStatus && prevStatus !== currentDisplayStatus) {
            const statusLabels: { [key: string]: string } = {
              'pending': 'Pending Verification',
              'rejected': 'Rejected',
              'verified': 'Verified',
              'out_for_delivery': 'Out for Delivery',
              'delivered': 'Delivered'
            };
            toast.success(`Order #${order.id.slice(0, 8)} status updated: ${statusLabels[currentDisplayStatus] || currentDisplayStatus}`);
          }
        });
      }
      // Update the ref with current display statuses
      prevOrderStatuses.current = Object.fromEntries(orders.map(o => [o.id, getDisplayStatus(o)]));
    }
  }, [orders]);

  async function loadOrders() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('❌ No authenticated user found');
        return;
      }

      console.log('🛒 Loading orders for user:', user.id);
      
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          order_status_code,
          approval_status,
          delivery_status,
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

      if (error) {
        console.error('❌ Error loading orders:', error);
        throw error;
      }
      
      // Debug: Log the raw data to see what's in the database
      console.log('🛒 Customer Orders - Raw data from database:', data);
      
      // Map to correct type
      const mapped = (data as any[] || []).map(order => ({
        id: order.id,
        created_at: order.created_at,
        order_status_code: order.order_status_code,
        approval_status: order.approval_status,
        delivery_status: order.delivery_status,
        total: order.total,
        status: order.status || null,
        items: order.items,
      })) as Order[];
      
      // Debug: Log the mapped orders and their display status
      mapped.forEach(order => {
        console.log(`📦 Order ${order.id.slice(0, 8)}:`, {
          approval_status: order.approval_status,
          delivery_status: order.delivery_status,
          display_status: getDisplayStatus(order)
        });
      });
      // Sort: rejected first, then pending, then by created_at descending
      mapped.sort((a, b) => {
        const statusA = getDisplayStatus(a);
        const statusB = getDisplayStatus(b);
        
        if (statusA === 'rejected' && statusB !== 'rejected') return -1;
        if (statusA !== 'rejected' && statusB === 'rejected') return 1;
        if (statusA === 'pending' && statusB !== 'pending') return -1;
        if (statusA !== 'pending' && statusB === 'pending') return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setOrders(mapped);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast.error('Failed to load orders');
    }
  }

  const statusSteps = [
    { code: 'rejected', icon: <XCircle size={18} />, label: 'Rejected', color: 'bg-red-500 border-red-500 text-white', labelColor: 'text-red-500' },
    { code: 'pending', icon: <Clock size={18} />, label: 'Pending', color: 'bg-yellow-400 border-yellow-400 text-white', labelColor: 'text-yellow-500' },
    { code: 'verified', icon: <CheckCircle size={18} />, label: 'Verified', color: 'bg-blue-500 border-blue-500 text-white', labelColor: 'text-blue-500' },
    { code: 'out_for_delivery', icon: <Truck size={18} />, label: 'Delivery', color: 'bg-green-500 border-green-500 text-white', labelColor: 'text-green-500' },
    { code: 'delivered', icon: <CheckCircle size={18} />, label: 'Delivered', color: 'bg-green-600 border-green-600 text-white', labelColor: 'text-green-600' },
  ];

  // Filter orders based on statusFilter
  const filteredOrders = statusFilter
    ? orders.filter(order => getDisplayStatus(order) === statusFilter)
    : []; // Show no orders when no filter is active

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-gray-50 w-full">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between -mt-5 py-3">
            <h1 className="text-2xl font-semibold">My Orders</h1>
          </div>
        </div>
      </div>
      <div className="px-4 space-y-4">
        {/* Status tracker - Always visible */}
        <div className="w-full flex justify-center">
          <div className="flex items-center w-full max-w-2xl gap-2">
            {statusSteps.map((step, idx) => {
              const isActive = statusFilter === step.code;
              const count = orders.filter(order => getDisplayStatus(order) === step.code).length;
              return (
                <React.Fragment key={String(step.code)}>
                  <div className="flex flex-col items-center flex-1 relative">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setStatusFilter(isActive ? '' : step.code)}
                        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-lg font-bold focus:outline-none transition-all
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
                    <div className={`flex-1 h-1 ${isActive || statusFilter === '' ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Orders list or No orders message */}
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Package className="w-16 h-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              No Orders
            </h3>
            <p className="text-sm text-gray-500">
              When you place orders, they will appear here
            </p>
          </div>
        ) : (
          filteredOrders.length > 0 ? (
            <div className="space-y-3">
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-white rounded-lg shadow-sm overflow-hidden"
                >
                  <div className="p-4">
                                        <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm text-gray-500">
                          Order #{order.id.slice(0, 8)}
                        </p>
                        <p className="text-sm text-gray-500">
                          {new Date(order.created_at).toLocaleDateString()}
                        </p>
                        {isOrderAssignedToDriver(order) && (
                          <div className="flex items-center gap-1 mt-1">
                            <Calendar size={12} className="text-green-600" />
                            <span className="text-xs font-medium text-green-600">
                              Estimated delivery: {getEstimatedDeliveryDate(order.created_at)}
                            </span>
                          </div>
                        )}
                      </div>
                      {!['out_for_delivery', 'delivered'].includes(getDisplayStatus(order)) && (
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                          style={{ 
                            backgroundColor: (() => {
                              const displayStatus = getDisplayStatus(order);
                              const statusColors: { [key: string]: string } = {
                                'pending': '#FEF3C7',
                                'rejected': '#FEE2E2', 
                                'verified': '#DBEAFE',
                                'out_for_delivery': '#D1FAE5',
                                'delivered': '#D1FAE5'
                              };
                              return statusColors[displayStatus] || '#eee';
                            })(), 
                            color: (() => {
                              const displayStatus = getDisplayStatus(order);
                              const textColors: { [key: string]: string } = {
                                'pending': '#D97706',
                                'rejected': '#DC2626',
                                'verified': '#2563EB', 
                                'out_for_delivery': '#059669',
                                'delivered': '#059669'
                              };
                              return textColors[displayStatus] || '#222';
                            })()
                          }}
                        >
                          {(() => {
                            const displayStatus = getDisplayStatus(order);
                            const statusLabels: { [key: string]: string } = {
                              'pending': 'Pending',
                              'rejected': 'Rejected',
                              'verified': 'Verified',
                              'out_for_delivery': '',
                              'delivered': 'Delivered'
                            };
                            return statusLabels[displayStatus] || displayStatus;
                          })()}
                        </span>
                      )}
                    </div>

                    <div className="divide-y">
                      {order.items.map((item, index) => (
                        <div key={index} className="py-2 flex justify-between items-center">
                                                      <div className="flex items-center space-x-2">
                              {(() => {
                                const cleanedUrl = cleanImageUrl(item.product.image_url);
                                return cleanedUrl ? (
                                  <img
                                    src={cleanedUrl}
                                    alt={item.product.name}
                                    className="w-16 h-16 rounded object-cover border"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                ) : null;
                              })()}
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

                    <div className="border-t mt-3 pt-3 flex justify-between items-center">
                      <span className="text-base font-medium text-gray-900">Total</span>
                      <span className="text-lg font-bold text-primary-600">
                        {formatCurrency(order.total)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <Package className="w-16 h-16 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">
                {statusFilter === 'rejected' && "No Rejected Orders"}
                {statusFilter === 'pending' && "No Pending Orders"}
                {statusFilter === 'verified' && "No Verified Orders"}
                {statusFilter === 'out_for_delivery' && "No Orders Out for Delivery"}
                {statusFilter === 'delivered' && "No Delivered Orders"}
                {!statusFilter && "No Orders"}
              </h3>
              <p className="text-sm text-gray-500">
                {statusFilter === 'rejected' && "Orders that were rejected will appear here"}
                {statusFilter === 'pending' && "Orders waiting for verification will appear here"}
                {statusFilter === 'verified' && "Orders that have been verified will appear here"}
                {statusFilter === 'out_for_delivery' && "Orders that are being delivered will appear here"}
                {statusFilter === 'delivered' && "Orders that have been delivered will appear here"}
                {!statusFilter && "When you place orders, they will appear here"}
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}