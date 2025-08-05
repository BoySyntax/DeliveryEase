import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, cleanImageUrl } from '../../lib/utils';
import Button from '../../ui/components/Button';
import { Card, CardContent } from '../../ui/components/Card';
import { Database } from '../../lib/database.types';
import Loader from '../../ui/components/Loader';
import { toast } from 'react-hot-toast';
import { checkBatchAutoAssignment } from '../../lib/batch-auto-assignment';
import { EmailService } from '../../lib/emailService';


type OrderStatus = Database['public']['Enums']['order_status'];

interface OrderData {
  id: string;
  created_at: string;
  customer_id: string;
  total: number;
  delivery_status: OrderStatus;
  approval_status: 'pending' | 'approved' | 'rejected';
  payment_proof: {
    file_url: string;
    uploaded_at: string;
  } | null;
  customer: {
    id: string;
    name: string | null;
    avatar_url: string | null;
  } | null;
  items: Array<{
    quantity: number;
    price: number;
    product: {
      name: string;
      image_url: string | null;
    } | null;
  }>;
}

// Customer Avatar component with error handling
function CustomerAvatar({ avatarUrl, customerName }: { avatarUrl: string | null | undefined, customerName: string | null | undefined }) {
  const [imageError, setImageError] = useState(false);
  const cleanedUrl = cleanImageUrl(avatarUrl);
  
  const handleImageError = () => {
    console.error('Customer avatar failed to load:', cleanedUrl);
    setImageError(true);
  };

  if (!cleanedUrl || imageError) {
    return (
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
        <span className="text-sm text-gray-600">
          {customerName?.charAt(0) || '?'}
        </span>
      </div>
    );
  }

  return (
    <img 
      src={cleanedUrl} 
      alt={customerName || ''} 
      className="w-8 h-8 rounded-full object-cover"
      onError={handleImageError}
    />
  );
}

// Product Image component with error handling
function ProductImage({ imageUrl, productName }: { imageUrl: string | null | undefined, productName: string | null | undefined }) {
  const [imageError, setImageError] = useState(false);
  const cleanedUrl = cleanImageUrl(imageUrl);
  
  const handleImageError = () => {
    console.error('Product image failed to load:', cleanedUrl);
    setImageError(true);
  };

  if (!cleanedUrl || imageError) {
    return (
      <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
        <span className="text-xs text-gray-500">
          {productName?.charAt(0) || '?'}
        </span>
      </div>
    );
  }

  return (
    <img 
      src={cleanedUrl} 
      alt={productName || ''} 
      className="w-10 h-10 object-cover rounded"
      onError={handleImageError}
    />
  );
}

// Customer Address Display component
function CustomerAddressDisplay({ customerId }: { customerId: string }) {
  const [address, setAddress] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAddress() {
      try {
        const { data, error } = await supabase
          .from('addresses')
          .select('*')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw error;
        setAddress(data?.[0] || null);
      } catch (error) {
        console.error('Error fetching address:', error);
      } finally {
        setLoading(false);
      }
    }

    if (customerId) {
      fetchAddress();
    }
  }, [customerId]);

  if (loading) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Delivery Address</h3>
        <div className="text-xs text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Delivery Address</h3>
        <div className="text-xs text-red-500">No address available</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Delivery Address</h3>
      <div className="text-xs text-gray-600 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{address.full_name}</span>
          <span>•</span>
          <span>{address.phone}</span>
        </div>
        <div>{address.street_address}</div>
        {address.barangay && (
          <div className="flex items-center gap-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
              📍 {address.barangay}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyOrdersPage() {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);

  useEffect(() => {
    loadOrders();
  }, []);

  async function loadOrders() {
    setLoading(true);
    try {
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          customer_id,
          total,
          delivery_status,
          approval_status,
          payment_proof:payment_proofs(
            file_url,
            uploaded_at
          ),
          customer:profiles!orders_customer_id_fkey(
            id,
            name,
            avatar_url
          ),
          items:order_items(
            quantity,
            price,
            product:products(
              name,
              image_url
            )
          )
        `)
        .eq('approval_status', 'pending')
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      const ordersWithAddresses = (ordersData || []).map(order => ({
        ...order,
        payment_proof: order.payment_proof?.[0] || null,
      })) as OrderData[];

      setOrders(ordersWithAddresses);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }

  const handleVerifyOrder = async (orderId: string, approved: boolean) => {
    console.log('=== HANDLE VERIFY ORDER CALLED ===');
    console.log('Order ID:', orderId);
    console.log('Approved:', approved);
    
    // Add a simple alert to confirm the function is called
    alert(`Function called: ${approved ? 'APPROVE' : 'REJECT'} order ${orderId}`);
    
    try {
      // Get the order's current address through customer_id
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select(`
          id,
          customer_id,
          total,
          items:order_items(
            quantity,
            price,
            product:products(
              name
            )
          )
        `)
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;

      console.log('Order data:', orderData); // Debug log

      // Get customer name from profiles
      const { data: profileData } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', orderData.customer_id)
        .single();

      // Get addresses directly (now allowed by admin policy)
      const { data: addresses, error: addressError } = await supabase
        .from('addresses')
        .select('*')
        .eq('customer_id', orderData.customer_id)
        .order('created_at', { ascending: false });

      console.log('Addresses:', addresses); // Debug log
      console.log('Address error:', addressError); // Debug log

      if (addressError) {
        console.error('Error fetching addresses:', addressError);
        throw new Error('Failed to fetch delivery addresses');
      }

      if (!addresses || addresses.length === 0) {
        throw new Error('Customer has no delivery addresses set up');
      }

      // Use the latest address (already sorted by created_at)
      const addressData = addresses[0];

      // Update order status
      const { error: updateError } = await supabase
        .from('orders')
        .update({ 
          approval_status: approved ? 'approved' : 'rejected',
          delivery_status: approved ? 'pending' : undefined,
          delivery_address: {
            full_name: addressData.full_name,
            phone: addressData.phone,
            street_address: addressData.street_address,
            barangay: addressData.barangay || 'Unknown Barangay', // Include barangay for batching
            latitude: addressData.latitude || null,
            longitude: addressData.longitude || null
          }
        })
        .eq('id', orderId);

      if (updateError) {
        console.error('Error updating order:', updateError);
        throw updateError;
      }

      toast.success(`Order ${approved ? 'approved' : 'rejected'} successfully`);
      
      // Send email notification if order was approved
      if (approved) {
        try {
          // Get customer email from profiles table
          const { data: emailResult, error: emailError } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('id', orderData.customer_id)
            .single();
          
          if (emailResult && emailResult.email) {
            const customerName = profileData?.name || 'Customer';
            
            console.log('🔍 Sending email notification for customer:', orderData.customer_id);
            console.log('📧 Customer email:', emailResult.email);
            
            // Send email notification using EmailService
            const emailSent = await EmailService.sendOrderVerifiedEmail(orderId);
            
            if (emailSent) {
              console.log('✅ Email notification sent successfully!');
              toast.success('Order approved and email sent!');
            } else {
              console.error('❌ Failed to send email notification');
              toast.error('Order approved but email failed to send');
            }
          } else {
            console.log('❌ No profile found for customer:', orderData.customer_id);
            toast.error('Order approved but no customer profile found');
          }
        } catch (emailError) {
          console.error('Error sending email notification:', emailError);
        }
      }
      
      // Notification will be automatically created by the database trigger
      console.log('Order status updated - notification will be created automatically by trigger');
      
      // Check for auto-assignment if order was approved
      if (approved) {
        // Give the database trigger a moment to create/update the batch
        setTimeout(() => {
          checkBatchAutoAssignment(orderId);
        }, 1000);
      }
      
      setOrders(orders.filter(order => order.id !== orderId));
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update order');
    }
  };

  const handleViewProof = async (filePath: string) => {
    setLoadingImage(true);
    try {
      const { data, error } = await supabase.storage
        .from('payment-proof')
        .createSignedUrl(filePath, 60 * 5); // 5 minutes expiry

      if (error) throw error;
      
      if (data?.signedUrl) {
        setSelectedImage(data.signedUrl);
      }
    } catch (error) {
      console.error('Error getting payment proof URL:', error);
      toast.error('Failed to load payment proof');
    } finally {
      setLoadingImage(false);
    }
  };

  const ImageModal = ({ url, onClose }: { url: string; onClose: () => void }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white p-4 rounded-lg max-w-4xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Payment Proof</h3>
          <button 
            className="text-gray-500 hover:text-gray-700"
            onClick={onClose}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <img src={url} alt="Payment Proof" className="max-w-full h-auto rounded-lg" />
      </div>
    </div>
  );

  if (loading) {
    return <Loader label="Loading orders..." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4">
        {orders.map((order) => (
          <Card key={order.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="space-y-4">
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm text-gray-600">
                        Order #{order.id.slice(0, 8)}
                      </h2>
                      <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                        Pending
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {new Date(order.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-blue-600">Payment Proof Uploaded</div>
                    <div className="text-lg font-semibold text-green-600">
                      {formatCurrency(order.total)}
                    </div>
                  </div>
                </div>

                {/* Customer Info */}
                <div className="flex items-center gap-3">
                  <CustomerAvatar 
                    avatarUrl={order.customer?.avatar_url} 
                    customerName={order.customer?.name} 
                  />
                  <div>
                    <h3 className="text-sm font-medium">Customer</h3>
                    <p className="text-sm text-gray-600">{order.customer?.name}</p>
                  </div>
                </div>

                {/* Delivery Address Preview */}
                <CustomerAddressDisplay customerId={order.customer_id} />

                {/* Order Items */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Order Items</h3>
                  <div className="space-y-2">
                    {order.items.map((item, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <ProductImage 
                          imageUrl={item.product?.image_url} 
                          productName={item.product?.name} 
                        />
                        <div className="flex-1">
                          <p className="text-sm">{item.product?.name}</p>
                          <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                        </div>
                        <div className="text-sm font-medium">
                          {formatCurrency(item.price * item.quantity)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payment Proof */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Payment Proof</h3>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => order.payment_proof && handleViewProof(order.payment_proof.file_url)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
                      disabled={loadingImage}
                    >
                      {loadingImage ? (
                        <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                      )}
                      View Proof
                    </button>
                    {order.payment_proof && (
                      <span className="text-xs text-gray-500">
                        Uploaded: {new Date(order.payment_proof.uploaded_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => handleVerifyOrder(order.id, false)}
                    className="flex-1 border-red-500 text-red-500 hover:bg-red-50"
                  >
                    Reject Order
                  </Button>
                  <Button 
                    onClick={() => handleVerifyOrder(order.id, true)}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    Verify Order
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {orders.length === 0 && (
          <p className="text-center text-gray-500">No pending orders to verify.</p>
        )}
      </div>

      {selectedImage && (
        <ImageModal 
          url={selectedImage} 
          onClose={() => setSelectedImage(null)} 
        />
      )}
    </div>
  );
} 