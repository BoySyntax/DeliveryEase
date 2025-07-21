import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../ui/components/Button';
import Input from '../../ui/components/Input';
import { formatCurrency } from '../../lib/utils';
import Loader from '../../ui/components/Loader';
import instapayQR from '../../assets/instapay-qr.png';

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
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [loadingCart, setLoadingCart] = useState(true);
  const [userAddresses, setUserAddresses] = useState<Address[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { register, handleSubmit, formState: { errors }, setValue } = useForm<CheckoutForm>();

  const params = new URLSearchParams(location.search);
  const isSingleProductCheckout = !!params.get('product');

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

        // Check for direct product checkout via query params
        const productId = params.get('product');
        const qty = parseInt(params.get('qty') || '1', 10);
        if (productId) {
          // Single product checkout
          const { data: product, error: productError } = await supabase
            .from('products')
            .select('id, name, price, quantity')
            .eq('id', productId)
            .single();
          if (productError || !product) {
            toast.error('Product not found');
            navigate('/customer/products');
            return;
          }
          setCartItems([{ product, quantity: qty }]);
        } else {
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
        }

        // Load User Addresses (show all, not just Mindanao)
        const { data: addresses, error: addressesError } = await supabase
          .from('addresses')
          .select('*')
          .eq('customer_id', user.id); // Removed .eq('region', 'Mindanao')
        console.log('Fetched addresses:', addresses);

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
  }, [navigate, setValue, location.search]);

  const total = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  const onSubmit = async (data: CheckoutForm) => {
    // Check for payment proof before proceeding
    if (!selectedFile) {
      toast.error('Please upload a payment proof before placing your order.');
      return;
    }
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

      // If single-product checkout, skip cart fetch and use cartItems
      const productId = params.get('product');
      let itemsToOrder = cartItems;
      if (!productId) {
        // Get cart items with product details (re-fetch to ensure latest data)
        const { data: cart, error: cartError } = await supabase
          .from('carts')
          .select('id')
          .eq('customer_id', user.id)
          .single();

        if (cartError) throw new Error('Error fetching cart: ' + cartError.message);

        const { data: cartItemsData, error: itemsError } = await supabase
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

        if (!cartItemsData || cartItemsData.length === 0) {
          toast.error('Your cart is empty');
          return;
        }
        itemsToOrder = cartItemsData;
      }

      // Validate stock availability
      const outOfStockItems = itemsToOrder.filter(
        item => !item.product.quantity || item.quantity > item.product.quantity
      );

      if (outOfStockItems.length > 0) {
        const itemNames = outOfStockItems.map(item => item.product.name).join(', ');
        toast.error(`The following items are out of stock or have insufficient quantity: ${itemNames}`);
        return;
      }

      // Calculate total
      const total = itemsToOrder.reduce(
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
      const orderItems = itemsToOrder.map(item => ({
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
      for (const item of itemsToOrder) {
        const { error: updateError } = await supabase
          .from('products')
          .update({ 
            quantity: item.product.quantity - item.quantity
          })
          .eq('id', item.product.id);

        if (updateError) throw new Error('Error updating product quantity: ' + updateError.message);
      }

      // If not single-product checkout, clear cart
      if (!productId) {
        const { data: cart, error: cartError } = await supabase
          .from('carts')
          .select('id')
          .eq('customer_id', user.id)
          .single();
        if (cart && !cartError) {
          const { error: clearCartError } = await supabase
            .from('cart_items')
            .delete()
            .eq('cart_id', cart.id);
          if (clearCartError) throw new Error('Error clearing cart: ' + clearCartError.message);
        }
      }

      // Handle file upload if a file was selected
      if (selectedFile) {
        setUploadingProof(true);
        let uploadedFileName: string | null = null;
        try {
          // Generate a unique file path including receipts folder
          const fileExtension = selectedFile.name.split('.').pop();
          const timestamp = new Date().getTime();
          const filePath = `receipts/order-${order.id}/${timestamp}.${fileExtension}`;

          console.log('Starting payment proof upload during order placement:', {
            bucket: 'payment-proof',
            path: filePath,
            fileType: selectedFile.type,
            fileSize: selectedFile.size
          });

          // Convert file to ArrayBuffer for proper binary upload
          const arrayBuffer = await selectedFile.arrayBuffer();
          const fileData = new Uint8Array(arrayBuffer);

          // Upload file to storage
          const { error: uploadError, data: uploadData } = await supabase.storage
            .from('payment-proof')
            .upload(filePath, fileData, {
              cacheControl: '3600',
              upsert: false,  // Don't allow overwriting
              contentType: selectedFile.type
            });

          if (uploadError) {
            console.error('Storage upload error during order placement:', uploadError);
            throw new Error(`Failed to upload payment proof: ${uploadError.message}`);
          }

          console.log('Payment proof file uploaded successfully.');

          // Get the URL for storage in the database
          const { data: urlData } = await supabase.storage
            .from('payment-proof')
            .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 days expiry

          if (!urlData?.signedUrl) {
            throw new Error('Failed to generate signed URL for payment proof');
          }

          console.log('Generated signed URL:', urlData.signedUrl);

          // Save proof details to database
          const { error: proofError } = await supabase
            .from('payment_proofs')
            .insert([{
              order_id: order.id,
              file_url: filePath,
              uploaded_at: new Date().toISOString()
            }]);

          if (proofError) {
            console.error('Database insert error (payment_proofs) during order placement:', proofError);
            // Clean up the uploaded file since DB insert failed
            await supabase.storage
              .from('payment-proof')
              .remove([filePath]);
            throw new Error('Failed to save payment proof details');
          }

          console.log('Payment proof details saved to database.');
          toast.success('Order placed and payment proof uploaded successfully!');
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

  if ((loadingCart || loadingAddresses) && !isSingleProductCheckout) {
    return <Loader label={loadingCart ? "Loading cart..." : "Loading addresses..."} />;
  }

  if (loading) {
    return <Loader label="Processing order..." />;
  }

  if (cartItems.length === 0 && !isSingleProductCheckout) {
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
    <div className="max-w-2xl mx-auto">
      <Button
        variant="ghost"
        icon={<ArrowLeft size={18} />}
        onClick={() => navigate('/customer/cart')}
        className="mb-6"
      >
        {!isSingleProductCheckout && 'Back to Cart'}
      </Button>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* 2. Delivery Information */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Delivery Information
          </h2>
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
                type="button"
              >
                Add a new address
              </Button>
            </div>
          ) : (
            <div className="text-center text-gray-500">
              No addresses found. Please add an address in your profile.
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => navigate('/customer/add-address')}
                type="button"
              >
                Add Address
              </Button>
            </div>
          )}
        </div>
        {/* 1. Order Summary at the top (now second) */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Order Summary
          </h2>
          <div className="divide-y">
            {cartItems.map((item, idx) => (
              <div key={`${item.product.id}-${idx}`} className="py-3 flex justify-between">
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
        {/* QR Code and Payment Proof - Combined Modern Flex Container */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6 flex flex-row items-stretch gap-6 overflow-hidden">
          {/* Left: QR Code and Payment Info */}
          <div className="flex flex-col items-center justify-center w-1/2 relative overflow-hidden">
            <div className="flex items-center bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-4 w-full max-w-xs">
              <svg className="w-5 h-5 text-blue-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z" /></svg>
              <span className="text-sm text-blue-800 font-medium">Scan the QR to pay. Please pay the exact amount.</span>
            </div>
            <img
              src={instapayQR}
              alt="InstaPay QR Code"
              className="w-48 h-48 md:w-56 md:h-56 lg:w-64 lg:h-64 object-contain mb-2"
              style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
            />
            <a
              href={instapayQR}
              download="instapay-qr.png"
              className="mt-2 inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-500 to-blue-500 text-white rounded-full shadow-lg hover:from-blue-600 hover:to-primary-600 transition font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2"
              style={{ minWidth: '180px' }}
            >
              <svg xmlns='http://www.w3.org/2000/svg' className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                <path strokeLinecap='round' strokeLinejoin='round' d='M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4' />
              </svg>
              Download QR
            </a>
            <p className="text-gray-500 text-sm">Transfer fees may apply.</p>
            <p className="text-primary-600 font-bold text-lg tracking-wider mt-1">JA****A O.</p>
          </div>
          {/* Divider for large screens */}
          <div className="hidden md:block w-px bg-gray-200 mx-6"></div>
          {/* Right: Proof of Payment Upload */}
          <div className="flex flex-col justify-center w-1/2">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Proof of Payment
            </h2>
            <div className="space-y-4">
              {/* Modern drag-and-drop upload area */}
              <div
                className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 transition-all duration-200 ${
                  loading || uploadingProof
                    ? 'bg-gray-100 opacity-60 cursor-not-allowed'
                    : 'bg-gray-50 hover:border-primary-500 hover:bg-blue-50 cursor-pointer'
                }`}
                style={{ minHeight: '160px' }}
                onClick={() => {
                  if (!loading && !uploadingProof) document.getElementById('proof-upload')?.click();
                }}
                onDragOver={e => {
                  e.preventDefault();
                  if (!loading && !uploadingProof) e.currentTarget.classList.add('border-primary-500', 'bg-blue-50');
                }}
                onDragLeave={e => {
                  e.preventDefault();
                  if (!loading && !uploadingProof) e.currentTarget.classList.remove('border-primary-500', 'bg-blue-50');
                }}
                onDrop={e => {
                  e.preventDefault();
                  if (!loading && !uploadingProof && e.dataTransfer.files[0]) {
                    const fileInput = document.getElementById('proof-upload') as HTMLInputElement;
                    if (fileInput) {
                      const dt = new DataTransfer();
                      dt.items.add(e.dataTransfer.files[0]);
                      fileInput.files = dt.files;
                      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                  }
                }}
              >
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/jpg"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="proof-upload"
                  disabled={loading || uploadingProof}
                />
                <div className="flex flex-col items-center w-full">
                  <Upload size={32} className={`mb-2 ${loading || uploadingProof ? 'text-gray-300' : 'text-primary-500 group-hover:text-primary-600'}`} />
                  {selectedFile ? (
                    <>
                      <p className="text-sm text-gray-700 font-medium mb-2">Selected file: {selectedFile.name}</p>
                      {selectedFile.type.startsWith('image/') && (
                        <img
                          src={URL.createObjectURL(selectedFile)}
                          alt="Preview"
                          className="rounded-lg border max-h-32 mb-2 object-contain shadow"
                          style={{ maxWidth: '180px' }}
                        />
                      )}
                      <button
                        type="button"
                        className="mt-1 text-xs text-red-500 hover:underline"
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedFile(null);
                        }}
                        disabled={loading || uploadingProof}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-base text-gray-700 font-semibold mb-1">Click or drag file to upload</p>
                      <p className="text-xs text-gray-500">JPEG, PNG, JPG up to 5MB</p>
                    </>
                  )}
                  {(loading || uploadingProof) && (
                    <p className="mt-2 text-sm text-blue-500 font-medium flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4 mr-1 text-blue-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                      Uploading...
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* 5. Place Order Button */}
        <div className="bg-white rounded-lg shadow-sm p-6 flex justify-end">
          <Button
            type="submit"
            isLoading={loading}
            disabled={userAddresses.length === 0 || loading}
          >
            Place Order
          </Button>
        </div>
      </form>
    </div>
  );
}