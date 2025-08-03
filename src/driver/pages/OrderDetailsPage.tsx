import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import { formatCurrency } from '../../lib/utils';
import { orderNotificationService } from '../../lib/orderNotificationService';
import { 
  Package, 
  MapPin, 
  User, 
  Phone, 
  ArrowLeft,
  CheckCircle,
  Clock,
  Weight
} from 'lucide-react';
import { useProfile } from '../../lib/auth';
import { toast } from 'react-hot-toast';

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  product: {
    id: string;
    name: string;
    image_url: string | null;
    weight: number;
  } | null;
}

interface Order {
  id: string;
  created_at: string;
  total: number;
  total_weight: number;
  delivery_status: string;
  delivery_address: {
    full_name: string;
    phone: string;
    street_address: string;
    barangay: string;
  } | null;
  customer: {
    name: string | null;
  } | null;
  items: OrderItem[];
}

export default function OrderDetailsPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (orderId && profile?.id) {
      loadOrderDetails();
    }
  }, [orderId, profile?.id]);

  async function loadOrderDetails() {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          total,
          total_weight,
          delivery_status,
          delivery_address,
          customer:profiles!orders_customer_id_fkey(name),
          items:order_items(
            id,
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
        .eq('id', orderId || '')
        .eq('driver_id', profile?.id || '')
        .single();

      if (error) {
        console.error('Error loading order details:', error);
        toast.error('Failed to load order details');
        return;
      }

      setOrder(data);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to load order details');
    } finally {
      setLoading(false);
    }
  }

  const handleCompleteOrder = async () => {
    if (!order) return;
    
    try {
      setCompleting(true);
      
      const { error } = await supabase
        .from('orders')
        .update({ delivery_status: 'delivered' })
        .eq('id', order.id);

      if (error) {
        console.error('Error completing order:', error);
        toast.error('Failed to complete order');
        return;
      }

      // Notification will be automatically created by the database trigger
      console.log('Order delivered - notification will be created automatically by trigger');

      toast.success('Order completed successfully!');
      navigate('/driver');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to complete order');
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return <Loader label="Loading order details..." />;
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Order Not Found</h3>
        <p className="text-gray-500 mb-4">This order doesn't exist or isn't assigned to you.</p>
        <button
          onClick={() => navigate('/driver')}
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/driver')}
          className="inline-flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </button>
        <div className="text-right">
          <p className="text-sm text-gray-500">Order #{order.id.slice(0, 8)}</p>
          <p className="text-lg font-semibold text-gray-900">
            {formatCurrency(order.total)}
          </p>
        </div>
      </div>

      {/* Customer Information */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-primary-600" />
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-gray-900">
                {order.delivery_address?.full_name || order.customer?.name || 'Unknown Customer'}
              </h3>
              {order.delivery_address?.phone && (
                <div className="flex items-center text-sm text-gray-600 mt-1">
                  <Phone className="w-4 h-4 mr-2" />
                  {order.delivery_address.phone}
                </div>
              )}
              {order.delivery_address?.street_address && (
                <div className="flex items-start text-sm text-gray-600 mt-2">
                  <MapPin className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                  <span>{order.delivery_address.street_address}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Order Status */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Order Status</h3>
              <p className="text-sm text-gray-500 mt-1">
                {order.delivery_status === 'delivered' ? 'Delivered' : 
                 order.delivery_status === 'delivering' ? 'Out for Delivery' : 
                 'Pending Delivery'}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {order.delivery_status === 'delivered' ? (
                <CheckCircle className="w-6 h-6 text-green-500" />
              ) : (
                <Clock className="w-6 h-6 text-blue-500" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Order Items */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Order Items</h3>
            <div className="flex items-center text-sm text-gray-600">
              <Weight className="w-4 h-4 mr-1" />
              {order.total_weight?.toFixed(2) || '0.00'} kg
            </div>
          </div>
          
          <div className="space-y-4">
            {order.items && order.items.length > 0 ? (
              order.items.map((item, index) => (
                <div key={item.id} className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
                  {item.product?.image_url ? (
                    <img
                      src={item.product.image_url}
                      alt={item.product.name}
                      className="w-16 h-16 rounded-lg object-cover border"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                      <Package className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">
                      {item.product?.name || 'Unknown Product'}
                    </h4>
                    <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                      <span>Qty: {item.quantity}</span>
                      {item.product?.weight && (
                        <span>Weight: {item.product.weight.toFixed(2)} kg</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="font-medium text-gray-900">
                      {formatCurrency(item.price * item.quantity)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatCurrency(item.price)} each
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No items found for this order</p>
              </div>
            )}
          </div>
          
          <div className="border-t mt-6 pt-4 flex justify-between items-center">
            <span className="text-lg font-medium text-gray-900">Total</span>
            <span className="text-xl font-bold text-primary-600">
              {formatCurrency(order.total)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Complete Order Button */}
      {order.delivery_status !== 'delivered' && (
        <div className="sticky bottom-4">
          <button
            onClick={handleCompleteOrder}
            disabled={completing}
            className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {completing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Completing...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 mr-2" />
                Complete Delivery
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
} 