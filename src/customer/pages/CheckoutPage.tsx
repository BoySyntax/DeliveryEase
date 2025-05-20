import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../ui/components/Button';
import Input from '../../ui/components/Input';
import { formatCurrency } from '../../lib/utils';
import Loader from '../../ui/components/Loader';

type CheckoutForm = {
  addressId: string;
  notes: string;
};

type CartItem = {
  product: {
    id: string;
    name: string;
    price: number;
    quantity: number;
  };
  quantity: number;
};

type Address = {
  id: string;
  customer_id: string;
  full_name: string;
  phone: string;
  region: string;
  province: string;
  city: string;
  barangay: string;
  postal_code: string;
  street_address: string;
  label?: string;
};

export default function CheckoutPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [loadingCart, setLoadingCart] = useState(true);
  const [userAddresses, setUserAddresses] = useState<Address[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { register, handleSubmit, formState: { errors }, setValue } = useForm<CheckoutForm>();

  useEffect(() => {
    async function loadCartAndAddresses() {
      setLoadingCart(true);
      setLoadingAddresses(true);
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw new Error('Authentication error: ' + authError.message);

        if (!user) {
          navigate('/login');
          return;
        }

        // Load Cart Items
        const { data: cart, error: cartError } = await supabase
          .from('carts')
          .select('id')
          .eq('customer_id', user.id)
          .single();

        if (cartError) throw new Error('Error fetching cart: ' + cartError.message);

        if (!cart) {
          navigate('/customer/cart');
          return;
        }

        const { data: items, error: itemsError } = await supabase
          .from('cart_items')
          .select(`
            id,
            quantity,
            product:products (
              id,
              name,
              price,
              quantity
            )
          `)
          .eq('cart_id', cart.id);

        if (itemsError) throw new Error('Error fetching cart items: ' + itemsError.message);

        if (items) {
          setCartItems(items);
        }

        // Load User Addresses and Filter by Mindanao
        const { data: addresses, error: addressesError } = await supabase
          .from('addresses')
          .select('*')
          .eq('customer_id', user.id)
          .eq('region', 'Mindanao'); // Filter by Mindanao region

        if (addressesError) throw new Error('Error fetching addresses: ' + addressesError.message);

        if (addresses) {
          setUserAddresses(addresses as Address[]);
          // Optionally set a default selected address if available
          if (addresses.length > 0) {
            setValue('addressId', addresses[0].id);
          }
        }

      } catch (error) {
        console.error('Error loading cart and addresses:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to load data');
      } finally {
        setLoadingCart(false);
        setLoadingAddresses(false);
      }
    }

    loadCartAndAddresses();
  }, [navigate, setValue]);

  const total = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  const onSubmit = async (data: CheckoutForm) => {
    setLoading(true);
    try {
      // Check user authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error('Authentication error: ' + authError.message);
      if (!user) {
        toast.error('Please sign in to place an order');
        return;
      }

      // Find the selected address
      const selectedAddress = userAddresses.find(addr => addr.id === data.addressId);
      if (!selectedAddress) {
          toast.error('Please select a valid address');
          return;
      }

      // Get cart items with product details (re-fetch to ensure latest data)
      const { data: cart, error: cartError } = await supabase
        .from('carts')
        .select('id')
        .eq('customer_id', user.id)
        .single();

      if (cartError) throw new Error('Error fetching cart: ' + cartError.message);

      const { data: cartItems, error: itemsError } = await supabase
        .from('cart_items')
        .select(`
          id,
          quantity,
          product:products (
            id,
            name,
            price,
            quantity
          )
        `)
        .eq('cart_id', cart.id);

      if (itemsError) throw new Error('Error fetching cart items: ' + itemsError.message);

      if (!cartItems || cartItems.length === 0) {
        toast.error('Your cart is empty');
        return;
      }

      // Validate stock availability
      const outOfStockItems = cartItems.filter(
        item => !item.product.quantity || item.quantity > item.product.quantity
      );

      if (outOfStockItems.length > 0) {
        const itemNames = outOfStockItems.map(item => item.product.name).join(', ');
        toast.error(`The following items are out of stock or have insufficient quantity: ${itemNames}`);
        return;
      }

      // Calculate total
      const total = cartItems.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0
      );

      // Start a transaction
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert([{
          customer_id: user.id,
          total,
          order_status_code: 'pending',
          address: {
            full_name: selectedAddress.full_name,
            phone: selectedAddress.phone,
            street_address: selectedAddress.street_address,
            barangay: selectedAddress.barangay,
            city: selectedAddress.city,
            province: selectedAddress.province,
            region: selectedAddress.region,
            postal_code: selectedAddress.postal_code
          },
          notes: data.notes,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (orderError) throw new Error('Error creating order: ' + orderError.message);

      // Create order items
      const orderItems = cartItems.map(item => ({
        order_id: order.id,
        product_id: item.product.id,
        quantity: item.quantity,
        price: item.product.price
      }));

      // Insert order items
      const { error: itemsInsertError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsInsertError) throw new Error('Error creating order items: ' + itemsInsertError.message);

      // Update product quantities
      for (const item of cartItems) {
        const { error: updateError } = await supabase
          .from('products')
          .update({ 
            quantity: item.product.quantity - item.quantity
          })
          .eq('id', item.product.id);

        if (updateError) throw new Error('Error updating product quantity: ' + updateError.message);
      }

      // Clear cart
      const { error: clearCartError } = await supabase
        .from('cart_items')
        .delete()
        .eq('cart_id', cart.id);

      if (clearCartError) throw new Error('Error clearing cart: ' + clearCartError.message);

      // Handle file upload if a file was selected
      if (selectedFile) {
        setUploadingProof(true);
        let uploadedFileName: string | null = null;
        try {
          const timestamp = new Date().getTime();
          const fileExt = selectedFile.name.split('.').pop();
          // Use the order ID for the final file name
          const fileName = `order-${order.id}-${timestamp}.${fileExt}`;
          uploadedFileName = fileName;
          const filePath = `receipts/${fileName}`;

          console.log('Starting payment proof upload during order placement:', {
            bucket: 'payment-proof',
            path: filePath,
            fileType: selectedFile.type,
            fileSize: selectedFile.size
          });

          // Upload file to storage
          const { error: uploadError } = await supabase.storage
            .from('payment-proof')
            .upload(filePath, selectedFile, {
              cacheControl: '3600',
              upsert: true
            });

          if (uploadError) {
            console.error('Storage upload error during order placement:', uploadError);
            throw new Error(`Failed to upload payment proof: ${uploadError.message}`);
          }

          console.log('Payment proof file uploaded successfully.');

          // Get the public URL
          const { data: { publicUrl } } = supabase.storage
            .from('payment-proof')
            .getPublicUrl(filePath);

          console.log('Generated public URL:', publicUrl);

          // Save proof details to database
          const { error: proofError } = await supabase
            .from('payment_proofs')
            .insert([{
              order_id: order.id,
              file_url: publicUrl,
              uploaded_at: new Date().toISOString()
            }]);

          if (proofError) {
            console.error('Database insert error (payment_proofs) during order placement:', proofError);
            // Note: File is uploaded, but DB record failed. Admin can manually link.
            toast.error('Payment proof uploaded, but failed to save details in database. Please contact support.');
          } else {
            console.log('Payment proof details saved to database.');
            toast.success('Order placed and payment proof uploaded successfully!');
          }
        } catch (uploadError) {
          console.error('Error during payment proof upload process:', uploadError);
          toast.error(uploadError instanceof Error ? uploadError.message : 'Failed to upload payment proof');
          // Consider cleanup of the partially uploaded file if necessary
        } finally {
          setUploadingProof(false);
        }
      } else {
        // No file selected, just place the order
        toast.success('Order placed successfully!');
      }

      // Navigate after order is placed and upload attempted/completed
      navigate('/customer/orders');

    } catch (error) {
      console.error('Error placing order:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  // Handles file selection and stores the file object in state
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      console.log('File selected for upload:', { name: file.name, type: file.type, size: file.size });
      // Basic validation (optional, could be more robust)
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
      const maxSize = 5 * 1024 * 1024; // 5MB

      if (!allowedTypes.includes(file.type)) {
        toast.error('Please select a valid image file (JPEG, PNG, JPG).');
        setSelectedFile(null);
        return;
      }
      if (file.size > maxSize) {
        toast.error('File size should be less than 5MB.');
        setSelectedFile(null);
        return;
      }

      setSelectedFile(file);
      toast.success('Payment proof file selected.');
    } else {
      setSelectedFile(null);
      console.log('No file selected.');
    }
  };

  if (loadingCart || loadingAddresses) {
    return <Loader label={loadingCart ? "Loading cart..." : "Loading addresses..."} />;
  }

  if (loading) {
    return <Loader label="Processing order..." />;
  }

  if (cartItems.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Your cart is empty</p>
        <Button
          className="mt-4"
          onClick={() => navigate('/customer/cart')}
        >
          Back to Cart
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Button
        variant="ghost"
        icon={<ArrowLeft size={18} />}
        onClick={() => navigate('/customer/cart')}
        className="mb-6"
      >
        Back to Cart
      </Button>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Delivery Information
            </h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {userAddresses.length > 0 ? (
                <div className="space-y-4">
                  <label className="block text-lg font-semibold text-gray-900">Select Delivery Address</label>
                  {userAddresses.map(address => (
                    <div 
                      key={address.id} 
                      className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex items-start space-x-3"
                    >
                      <input
                        type="radio"
                        id={`address-${address.id}`}
                        value={address.id}
                        {...register('addressId', { required: 'Please select an address' })}
                        className="mt-1 h-4 w-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                      />
                      <label htmlFor={`address-${address.id}`} className="flex-1 cursor-pointer">
                        <p className="text-sm font-medium text-gray-900">
                          {address.full_name} {address.phone ? `(+63) ${address.phone}` : ''}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          {address.street_address}<br/>
                          {address.barangay}, {address.city}, {address.province}, {address.region} {address.postal_code}
                        </p>
                        {address.label && (
                          <span className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {address.label}
                          </span>
                        )}
                      </label>
                    </div>
                  ))}
                  {errors.addressId && (
                    <p className="mt-1 text-sm text-red-600">{errors.addressId.message}</p>
                  )}
                  <Button
                    variant="outline"
                    fullWidth
                    onClick={() => navigate('/customer/add-address')}
                  >
                    Add a new address
                  </Button>
                </div>
              ) : (
                <div className="text-center text-gray-500">
                  No addresses found in Mindanao. Please add an address in your profile.
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => navigate('/customer/add-address')}
                  >
                    Add Address
                  </Button>
                </div>
              )}
              
              <Input
                label="Order Notes (Optional)"
                error={errors.notes?.message}
                {...register('notes')}
              />

              <Button
                type="submit"
                fullWidth
                isLoading={loading}
                disabled={userAddresses.length === 0 || loading}
              >
                Place Order
              </Button>
            </form>
          </div>

          {/* Payment Proof Selection Section */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="space-y-4">
              {/* Hidden file input */}
              <input
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                onChange={handleFileSelect} // Use the new handler for selection
                className="hidden"
                id="proof-upload"
                disabled={loading || uploadingProof} // Disable while placing order or uploading
              />
              {/* Label acts as the clickable button */}
              <label 
                htmlFor="proof-upload"
                className={`block w-full p-4 border border-dashed rounded-lg text-center ${(loading || uploadingProof) ? 'cursor-not-allowed opacity-50 bg-gray-100' : 'cursor-pointer hover:border-primary-600'}`}
              >
                <div className="flex flex-col items-center">
                  <Upload size={24} className={`text-gray-400 ${(selectedFile || loading || uploadingProof) ? '' : 'group-hover:text-primary-600'}`} />
                  {selectedFile ? (
                    <p className="mt-2 text-sm text-gray-600 font-medium">Selected file: {selectedFile.name}</p>
                  ) : (
                    <>
                      <p className="mt-2 text-sm text-gray-600 font-medium">Click to select payment proof (Optional)</p>
                      <p className="text-xs text-gray-500">JPEG, PNG, JPG up to 5MB</p>
                    </>
                  )}
                </div>
              </label>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Order Summary
          </h2>
          
          <div className="divide-y">
            {cartItems.map((item) => (
              <div key={item.product.id} className="py-3 flex justify-between">
                <div>
                  <p className="text-sm text-gray-900">{item.product.name}</p>
                  <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                </div>
                <p className="text-sm font-medium text-gray-900">
                  {formatCurrency(item.product.price * item.quantity)}
                </p>
              </div>
            ))}
          </div>

          <div className="border-t mt-4 pt-4">
            <div className="flex justify-between">
              <span className="text-base font-medium text-gray-900">Total</span>
              <span className="text-xl font-bold text-primary-600">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}