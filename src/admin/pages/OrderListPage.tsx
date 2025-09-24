import { useState, useEffect } from 'react';
import { Calendar, Clock, CheckCircle, XCircle, Truck, Package, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import { formatCurrency } from '../../lib/utils';
import Button from '../../ui/components/Button';

type Order = {
  id: string;
  created_at: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  delivery_status: string | null;
  total: number;
  customer: {
    name: string;
  };
  items: {
    quantity: number;
    price: number;
    product: {
      name: string;
      image_url: string;
    };
  }[];
};

export default function OrderListPage() {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('pending');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);

  useEffect(() => {
    loadOrdersForDate(selectedDate);
  }, [selectedDate]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showOrderModal) {
        closeModal();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showOrderModal]);

  const loadOrdersForDate = async (date: string) => {
    setLoading(true);
    try {
      // Create date range for the selected day in local timezone
      const selectedDate = new Date(date + 'T00:00:00');
      const startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0, 0);
      const endDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59, 999);

      console.log('Loading orders for date range:', {
        selectedDate: date,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        localStart: startDate.toLocaleString(),
        localEnd: endDate.toLocaleString()
      });

      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          approval_status,
          delivery_status,
          total,
          customer:profiles!orders_customer_id_fkey (
            name
          ),
          items:order_items (
            quantity,
            price,
            product:products (
              name,
              image_url
            )
          )
        `)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }
      
      console.log('Loaded orders:', data);
      console.log('Orders with local dates:', data?.map(order => ({
        id: order.id.slice(0, 8),
        created_at: order.created_at,
        local_date: new Date(order.created_at).toLocaleString()
      })));
      
      setOrders(data || []);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusInfo = (order: Order) => {
    if (order.approval_status === 'rejected') {
      return {
        icon: <XCircle size={16} className="text-red-500" />,
        label: 'Rejected',
        color: 'bg-red-100 text-red-800'
      };
    }
    
    if (order.approval_status === 'pending') {
      return {
        icon: <Clock size={16} className="text-yellow-500" />,
        label: 'Pending',
        color: 'bg-yellow-100 text-yellow-800'
      };
    }
    
    if (order.delivery_status === 'delivered') {
      return {
        icon: <CheckCircle size={16} className="text-green-500" />,
        label: 'Delivered',
        color: 'bg-green-100 text-green-800'
      };
    }
    
    if (order.delivery_status === 'delivering') {
      return {
        icon: <Truck size={16} className="text-blue-500" />,
        label: 'Out for Delivery',
        color: 'bg-blue-100 text-blue-800'
      };
    }
    
    return {
      icon: <CheckCircle size={16} className="text-blue-500" />,
      label: 'Verified',
      color: 'bg-blue-100 text-blue-800'
    };
  };

  const getOrdersByStatus = (status: string) => {
    const filteredOrders = orders.filter(order => {
      if (status === 'rejected') return order.approval_status === 'rejected';
      if (status === 'pending') return order.approval_status === 'pending';
      if (status === 'verified') {
        return order.approval_status === 'approved' && 
               order.delivery_status === 'pending';
      }
      if (status === 'out_for_delivery') {
        return order.delivery_status === 'delivering';
      }
      if (status === 'delivered') return order.delivery_status === 'delivered';
      return false;
    });
    
    console.log(`${status} orders:`, filteredOrders);
    return filteredOrders;
  };

  const pendingOrders = getOrdersByStatus('pending');
  const rejectedOrders = getOrdersByStatus('rejected');
  const verifiedOrders = getOrdersByStatus('verified');
  const outForDeliveryOrders = getOrdersByStatus('out_for_delivery');
  const deliveredOrders = getOrdersByStatus('delivered');

  const tabs = [
    { id: 'pending', label: 'Pending', icon: <Clock size={16} />, count: pendingOrders.length, orders: pendingOrders },
    { id: 'rejected', label: 'Rejected', icon: <XCircle size={16} />, count: rejectedOrders.length, orders: rejectedOrders },
    { id: 'verified', label: 'Verified', icon: <CheckCircle size={16} />, count: verifiedOrders.length, orders: verifiedOrders },
    { id: 'out_for_delivery', label: 'Out for Delivery', icon: <Truck size={16} />, count: outForDeliveryOrders.length, orders: outForDeliveryOrders },
    { id: 'delivered', label: 'Delivered', icon: <Package size={16} />, count: deliveredOrders.length, orders: deliveredOrders },
  ];

  const currentTab = tabs.find(tab => tab.id === activeTab) || tabs[0];

  const handleOrderClick = (order: Order) => {
    setSelectedOrder(order);
    setShowOrderModal(true);
  };

  const closeModal = () => {
    setShowOrderModal(false);
    setSelectedOrder(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900">Order List</h1>
      </div>

      {/* Calendar */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <Calendar size={20} className="text-gray-600" />
            <h2 className="text-lg font-medium text-gray-900">Select Date</h2>
          </div>
          <div className="max-w-xs">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-2 sm:space-x-8 px-4 sm:px-6 pt-4 sm:pt-6 overflow-x-auto scrollbar-hide" aria-label="Tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`${
                    activeTab === tab.id
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 font-medium text-xs sm:text-sm flex items-center gap-1 sm:gap-2 flex-shrink-0`}
                >
                  <span className="hidden sm:inline">{tab.icon}</span>
                  <span className="sm:hidden text-xs">{tab.icon}</span>
                  <span className="text-xs sm:text-sm">{tab.label}</span>
                  {tab.count > 0 && (
                    <span className={`${
                      activeTab === tab.id ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-600'
                    } inline-flex items-center justify-center px-1.5 sm:px-2 py-0.5 rounded-full text-xs font-medium`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Table Content */}
          <div className="p-4 sm:p-6">
            {loading ? (
              <div className="text-center py-8">
                <Loader label="Loading orders..." />
              </div>
            ) : currentTab.orders.length > 0 ? (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto scrollbar-hide">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Order ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Customer
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date Created
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {currentTab.orders.map((order) => {
                        const statusInfo = getStatusInfo(order);
                        return (
                          <tr 
                            key={order.id} 
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => handleOrderClick(order)}
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              #{order.id.slice(0, 8)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {order.customer.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                                {statusInfo.icon}
                                {statusInfo.label}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                              {formatCurrency(order.total)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(order.created_at).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card Layout */}
                <div className="md:hidden space-y-3">
                  {currentTab.orders.map((order) => {
                    const statusInfo = getStatusInfo(order);
                    return (
                      <div 
                        key={order.id} 
                        className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => handleOrderClick(order)}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-medium text-gray-900 text-sm">
                              Order #{order.id.slice(0, 8)}
                            </h4>
                            <p className="text-sm text-gray-600 mt-1">
                              {order.customer.name}
                            </p>
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                            {statusInfo.icon}
                            {statusInfo.label}
                          </span>
                        </div>
                        <div className="flex justify-between items-center mt-3">
                          <span className="text-lg font-semibold text-gray-900">
                            {formatCurrency(order.total)}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(order.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <div className="flex justify-center mb-4">
                  {currentTab.icon && <div className="text-gray-400 scale-[3]">{currentTab.icon}</div>}
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No {currentTab.label} Orders
                </h3>
                <p className="text-gray-500">
                  No {currentTab.label.toLowerCase()} orders found for {new Date(selectedDate).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Order Details Modal */}
      {showOrderModal && selectedOrder && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={closeModal}
        >
          <div 
            className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-hide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">
                Order #{selectedOrder.id.slice(0, 8)} Details
              </h2>
              <Button
                variant="outline"
                size="sm"
                icon={<X size={16} />}
                onClick={closeModal}
                className="!p-2"
              />
            </div>
            
            <div className="px-6 py-4">
              {/* Order Info */}
              <div className="mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Customer</h3>
                    <p className="text-sm text-gray-900 mt-1">{selectedOrder.customer.name}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Order Date</h3>
                    <p className="text-sm text-gray-900 mt-1">{new Date(selectedOrder.created_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Status</h3>
                    <div className="mt-1">
                      {(() => {
                        const statusInfo = getStatusInfo(selectedOrder);
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                            {statusInfo.icon}
                            {statusInfo.label}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Total Amount</h3>
                    <p className="text-lg font-semibold text-gray-900 mt-1">{formatCurrency(selectedOrder.total)}</p>
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Order Items</h3>
                <div className="space-y-3">
                  {selectedOrder.items.map((item, index) => (
                    <div key={index} className="flex items-center justify-between border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center space-x-4">
                        {item.product.image_url && (
                          <img
                            src={item.product.image_url}
                            alt={item.product.name}
                            className="w-12 h-12 rounded object-cover border"
                          />
                        )}
                        <div>
                          <h4 className="font-medium text-gray-900">{item.product.name}</h4>
                          <p className="text-sm text-gray-500">Quantity: {item.quantity}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">{formatCurrency(item.price)}</p>
                        <p className="text-sm text-gray-500">each</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Summary */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-medium text-gray-900">Total:</span>
                  <span className="text-xl font-semibold text-gray-900">{formatCurrency(selectedOrder.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
