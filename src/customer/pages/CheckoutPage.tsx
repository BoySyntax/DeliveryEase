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
import { orderNotificationService } from '../../lib/orderNotificationService';

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
  region?: string;
  province?: string;
  city?: string;
  barangay: string | null;
  postal_code?: string;
  street_address: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
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
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [isReorderFlow, setIsReorderFlow] = useState(false);
  const [detectingReorder, setDetectingReorder] = useState(true);
  const [reorderProcessed, setReorderProcessed] = useState(false);
  const [originalOrderIdState, setOriginalOrderIdState] = useState<string | null>(null);
  const [hasShownReorderBlocked, setHasShownReorderBlocked] = useState(false);
  const [reorderBlocked, setReorderBlocked] = useState(false);
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<CheckoutForm>();
  
  // Get reorder parameter from URL
  const urlParams = new URLSearchParams(window.location.search);
  const reorderFromEmail = urlParams.get('reorder');
  
  // Get current user
  const [user, setUser] = useState<any>(null);
  
  // Debug: Log reorder parameter on component mount
  console.log('🚀 CheckoutPage mounted with reorder:', reorderFromEmail);

  // Load user on component mount
  useEffect(() => {
    const loadUser = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) {
        console.error('Error loading user:', error);
      } else {
        setUser(user);
        console.log('👤 User loaded:', user?.id);
      }
    };
    loadUser();
  }, []);

  // Build a clean, comma-separated location string without empty values
  const formatLocation = (parts: Array<string | null | undefined>): string => {
    return parts
      .map(part => (typeof part === 'string' ? part.trim() : part))
      .filter(part => !!part && part !== ',')
      .join(', ');
  };

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
        // Check for reorder from URL parameter (from email)
        const reorderFromEmail = urlParams.get('reorder');
        
        if (reorderFromEmail && !reorderProcessed) {
          console.log('📧 Reorder from email detected for order:', reorderFromEmail);
          console.log('📧 Current state:', { reorderProcessed, isReorderFlow, cartItemsLength: cartItems.length });
          
          // ✅ CRITICAL CHECK: Verify order is still rejected before proceeding
          try {
            const { data: orderCheck, error: checkError } = await supabase
              .from('orders')
              .select('id, approval_status')
              .eq('id', reorderFromEmail)
              .eq('customer_id', user.id)
              .single();
            
            if (checkError || !orderCheck) {
              console.error('❌ Error checking order status:', checkError);
              toast.error('Unable to verify order status.');
              navigate('/customer/orders');
              return;
            }
            
            // ✅ BLOCK if order is not rejected (was already reordered)
            if (orderCheck.approval_status !== 'rejected') {
              // console.log('🚫 Order was already reordered. Status:', orderCheck.approval_status);
              setIsReorderFlow(true);
              setReorderProcessed(true);
              return;
            }
            
            console.log('✅ Order is still rejected, proceeding with reorder');
          } catch (checkErr) {
            console.error('❌ Error in order status check:', checkErr);
            toast.error('Unable to verify order status.');
            navigate('/customer/orders');
            return;
          }
          
          // Set reorder flow state immediately
          setIsReorderFlow(true);
          setReorderProcessed(true);
          
          // Fetch the order details to get items for reorder
          try {
            const { data: orderData, error: orderError } = await supabase
              .from('orders')
              .select(`
                id,
                customer_id,
                items:order_items(
                  product_id,
                  quantity,
                  price,
                  product:products(
                    id,
                    name,
                    price,
                    image_url
                  )
                )
              `)
              .eq('id', reorderFromEmail)
              .eq('customer_id', user.id)
              .single();

            if (orderError) throw orderError;

            if (orderData && orderData.items) {
              // Convert order items to reorder format
              const reorderItems = orderData.items.map((item: any) => ({
                product_id: item.product_id,
                quantity: item.quantity
              }));

              // Store in session storage for reorder flow
              sessionStorage.setItem('reorderItems', JSON.stringify(reorderItems));
              sessionStorage.setItem('isReorder', 'true');
              sessionStorage.setItem('originalOrderId', reorderFromEmail);
              
              console.log('✅ Reorder items stored from email for order:', reorderFromEmail);
              
              // Load the reorder items into cartItems state
              const productIds = reorderItems.map(i => i.product_id);
              const { data: products, error: productsError } = await supabase
                .from('products')
                .select('*')
                .in('id', productIds);

              if (productsError) throw productsError;

              if (products && products.length > 0) {
                const items: CartItem[] = reorderItems
                  .map(reorderItem => {
                    const product = products.find(p => p.id === reorderItem.product_id);
                    if (!product) return null;
                    return {
                      product: {
                        id: product.id,
                        name: product.name,
                        price: product.price,
                        quantity: product.quantity
                      },
                      quantity: reorderItem.quantity
                    };
                  })
                  .filter((item): item is CartItem => item !== null);

                if (items.length > 0) {
                  setCartItems(items);
                  console.log('✅ Reorder items loaded into cart:', items);
                  console.log('✅ Cart items state updated, length:', items.length);
                } else {
                  console.log('❌ No valid products found for reorder');
                  toast.error('Some items from your previous order are no longer available');
                }
              }
            }
          } catch (error) {
            console.error('Error fetching order for reorder from email:', error);
            toast.error('Could not load order for reorder. Please try again.');
          }
        }

        // Check for reorder items in session storage first
        const reorderItems = sessionStorage.getItem('reorderItems');
        const isReorder = sessionStorage.getItem('isReorder');
        const ssOriginalOrderId = sessionStorage.getItem('originalOrderId');
        
        console.log('🔍 Checkout: Checking for reorder items...');
        console.log('📦 reorderItems:', reorderItems);
        console.log('🔄 isReorder:', isReorder);
        console.log('🔄 reorderProcessed:', reorderProcessed);
        console.log('🔄 isReorderFlow state:', isReorderFlow);
        
        if (reorderItems && isReorder === 'true' && !reorderProcessed && !isReorderFlow) {
          // Set reorder flow state
          setIsReorderFlow(true);
          console.log('🔄 Reorder flow detected and set to true');
          if (ssOriginalOrderId) {
            setOriginalOrderIdState(ssOriginalOrderId);
            console.log('🆔 Captured originalOrderId for reorder:', ssOriginalOrderId);
          } else {
            console.log('⚠️ No originalOrderId found in session storage during reorder detection');
          }
          
          // Load reorder items by fetching products for provided IDs
          const parsedItems: Array<{ product_id: string; quantity: number }> = JSON.parse(reorderItems);
          console.log('📋 Parsed reorder items:', parsedItems);
          const productIds = parsedItems.map(i => i.product_id);
          console.log('🆔 Product IDs to fetch:', productIds);
          
          if (productIds.length > 0) {
            const { data: products, error: productsError } = await supabase
              .from('products')
              .select('id, name, price, quantity, image_url')
              .in('id', productIds);
            if (productsError) throw new Error('Error fetching products for reorder: ' + productsError.message);

            console.log('🛍️ Fetched products:', products);
            const productMap = new Map(products.map(p => [p.id, p]));
            const items: CartItem[] = parsedItems
              .map(({ product_id, quantity }) => {
                const product = productMap.get(product_id);
                if (!product) {
                  console.log(`❌ Product ${product_id} not found or unavailable`);
                  return null;
                }
                return { product, quantity } as CartItem;
              })
              .filter(Boolean) as CartItem[];
            console.log('✅ Final cart items:', items);
            
            // Log if some products were not found
            if (items.length < parsedItems.length) {
              console.log(`⚠️ Only ${items.length} of ${parsedItems.length} reorder items are available`);
              if (items.length === 0) {
                toast.error('No reorder items are currently available');
              } else {
                toast.error(`Only ${items.length} of ${parsedItems.length} reorder items are available`);
              }
            }
            
            setCartItems(items);
          } else {
            // No product IDs means empty reorder
            console.log('❌ No product IDs found in reorder items');
            setCartItems([]);
          }
          
          // Mark reorder as processed
          setReorderProcessed(true);
        } else {
          // Not a reorder flow
          setIsReorderFlow(false);
        }
        
        // Reorder detection complete
        setDetectingReorder(false);
        
        // Load Cart Items (pick latest cart if multiple exist) - Only if not a reorder flow
        if (!(reorderItems && isReorder === 'true')) {
          const { data: carts, error: cartError } = await supabase
              .from('carts')
              .select('id')
              .eq('customer_id', user.id)
              .order('created_at', { ascending: false })
              .limit(1);

            if (cartError) throw new Error('Error fetching cart: ' + cartError.message);

            if (!carts || carts.length === 0) {
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
              .eq('cart_id', carts[0].id);

            if (itemsError) throw new Error('Error fetching cart items: ' + itemsError.message);

            if (items) {
              setCartItems(items);
            }
          }
        }

        // Load User Addresses (show all, not just Mindanao)
        const { data: addresses, error: addressesError } = await supabase
          .from('addresses')
          .select('*')
          .eq('customer_id', user.id)
          .eq('active', true);
        console.log('Fetched addresses:', addresses);

        if (addressesError) throw new Error('Error fetching addresses: ' + addressesError.message);

        if (addresses) {
          console.log('All user addresses loaded:', addresses); // Debug log
          setUserAddresses(addresses as Address[]);
          // Set default selected address if available
          if (addresses.length > 0) {
            const defaultAddressId = addresses[0].id;
            setValue('addressId', defaultAddressId);
            setSelectedAddressId(defaultAddressId);
            console.log('Default address selected:', addresses[0]); // Debug log
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

  // Handle reorder from URL parameter (simple approach)
  useEffect(() => {
    const handleReorderFromURL = async () => {
      const reorderFromEmail = urlParams.get('reorder');
      
      console.log('🔍 Reorder check:', { 
        reorderFromEmail, 
        user: !!user, 
        cartItemsLength: cartItems.length,
        reorderProcessed,
        isReorderFlow 
      });
      
      if (reorderFromEmail) {
        console.log('📧 Reorder parameter detected:', reorderFromEmail);
        
        if (!user) {
          console.log('⏳ User not loaded yet, waiting...');
          return;
        }
        
        if (reorderProcessed) {
          console.log('✅ Reorder already processed');
          return;
        }
        
        // ✅ CRITICAL CHECK: Verify order is still rejectable before allowing reorder
        // This prevents duplicate reorders if the order was already reordered from email
        try {
          const { data: orderCheck, error: orderError } = await supabase
            .from('orders')
            .select('id, approval_status, created_at')
            .eq('id', reorderFromEmail)
            .eq('customer_id', user.id)
            .single();
          
          if (orderError) {
            console.error('❌ Error checking order status:', orderError);
            toast.error('Unable to verify order status.');
            return;
          }
          
          if (!orderCheck) {
            console.log('⚠️ Order not found');
            toast.error('Order not found.');
            navigate('/customer/orders');
            return;
          }
          
          // ✅ BLOCK REORDER: If order is not rejected, it means it was already reordered
          if (orderCheck.approval_status !== 'rejected') {
            // console.log('🚫 Order was already reordered. Current status:', orderCheck.approval_status);
            setReorderBlocked(true);
            return;
          }
          
          console.log('✅ Order is still rejected, reorder is allowed');
        } catch (error) {
          console.error('❌ Error checking reorder status:', error);
          toast.error('Unable to verify if order was already reordered.');
          return;
        }
        console.log('📧 Reorder from email - loading order:', reorderFromEmail);
        console.log('🔄 Setting reorder flow state immediately');
        setIsReorderFlow(true);
        setReorderProcessed(true);
        
        try {
          // First, let's test with a simple order fetch
          console.log('🔍 Testing simple order fetch for:', reorderFromEmail);
          const { data: testOrder, error: testError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', reorderFromEmail)
            .single();
            
          console.log('Test order result:', { testOrder, testError });
          
          if (testError) {
            console.error('❌ Order fetch failed:', testError);
            toast.error('Order not found. Please check the order ID.');
            return;
          }
          
          if (!testOrder) {
            console.error('❌ No order data returned');
            toast.error('Order not found. Please check the order ID.');
            return;
          }
          
          console.log('✅ Order found:', testOrder);
          
          // Check if order belongs to current user
          if (testOrder.customer_id !== user.id) {
            console.error('❌ Order belongs to different user');
            toast.error('This order belongs to a different account.');
            return;
          }
          
          // Now try to fetch with items
          console.log('🔍 Fetching order with items...');
          const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .select(`
              id,
              customer_id,
              items:order_items(
                product_id,
                quantity,
                price,
                product:products(
                  id,
                  name,
                  price,
                  image_url
                )
              )
            `)
            .eq('id', reorderFromEmail)
            .single();


          if (orderError) {
            console.error('❌ Error fetching order with items:', orderError);
            console.log('🔄 Trying to create test items for reorder...');
            
            // Create some test items for demonstration
            const testItems = [
              {
                product: {
                  id: 'test-1',
                  name: 'Test Product 1',
                  price: 10.00,
                  image_url: null,
                  quantity: 0 // Add required quantity field
                },
                quantity: 2
              },
              {
                product: {
                  id: 'test-2', 
                  name: 'Test Product 2',
                  price: 15.00,
                  image_url: null,
                  quantity: 0 // Add required quantity field
                },
                quantity: 1
              }
            ];
            
            setCartItems(testItems);
            console.log('✅ Test items loaded for reorder demonstration');
            toast.success('Demo reorder items loaded (order not found)');
            return;
          }

          if (orderData && orderData.items && orderData.items.length > 0) {
            console.log('✅ Order found, loading items...', orderData);
            
            // Set reorder flow state
            setIsReorderFlow(true);
            setReorderProcessed(true);
            
            // Convert order items to cart format
            const items = orderData.items
              .map((item: any) => {
                console.log('Processing item:', item);
                if (item.product) {
                  return {
                    product: item.product,
                    quantity: item.quantity
                  };
                }
                return null;
              })
              .filter((item): item is { product: any; quantity: number } => item !== null);

            console.log('Converted items:', items);

            if (items.length > 0) {
              setCartItems(items);
              console.log('✅ Reorder items loaded into cart:', items.length, 'items');
              console.log('Cart items after setCartItems:', items);
              
              // Store for reorder tracking
              sessionStorage.setItem('reorderItems', JSON.stringify(orderData.items.map((item: any) => ({
                product_id: item.product_id,
                quantity: item.quantity
              }))));
              sessionStorage.setItem('isReorder', 'true');
              sessionStorage.setItem('originalOrderId', reorderFromEmail);
            } else {
              console.log('❌ No valid items found after conversion');
            }
          } else {
            console.log('❌ No order data or items found:', orderData);
          }
        } catch (error) {
          console.error('Error loading reorder:', error);
        }
      }
    };

    handleReorderFromURL();
  }, [user, reorderProcessed, reorderFromEmail]);

  useEffect(() => {
    if (!hasShownReorderBlocked && reorderBlocked) {
      setHasShownReorderBlocked(true);
      toast.error('This order has already been reordered. Please check your order history.');
      navigate('/customer/orders');
    }
  }, [hasShownReorderBlocked, reorderBlocked, navigate]);

  const total = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  // Watch for address selection changes
  const watchedAddressId = watch('addressId');
  
  // Update selected address when form value changes
  useEffect(() => {
    if (watchedAddressId && watchedAddressId !== selectedAddressId) {
      setSelectedAddressId(watchedAddressId);
    }
  }, [watchedAddressId, selectedAddressId]);

  const handleAddressChange = (addressId: string) => {
    const selectedAddress = userAddresses.find(addr => addr.id === addressId);
    console.log('Address selection changed to:', selectedAddress); // Debug log
    setSelectedAddressId(addressId);
    setValue('addressId', addressId);
  };

  const onSubmit = async (data: CheckoutForm) => {
    // Check for payment proof before proceeding
    if (!selectedFile) {
      toast.error('Please upload a payment proof before placing your order.');
      return;
    }
    setLoading(true);
    
      console.log('🚀 Starting order submission...');
      console.log('📊 State check:');
      console.log('  - isReorderFlow:', isReorderFlow);
      console.log('  - cartItems.length:', cartItems.length);
      console.log('  - detectingReorder:', detectingReorder);
      console.log('  - reorderProcessed:', reorderProcessed);
      console.log('  - sessionStorage isReorder:', sessionStorage.getItem('isReorder'));
      console.log('  - sessionStorage originalOrderId:', sessionStorage.getItem('originalOrderId'));
    
    try {
      // Check user authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error('Authentication error: ' + authError.message);
      if (!user) {
        toast.error('Please sign in to place an order');
        return;
      }

      // Find the selected address
      const selectedAddress = userAddresses.find(addr => addr.id === selectedAddressId);
      if (!selectedAddress) {
          toast.error('Please select a valid address');
          return;
      }

      console.log('Selected address for order:', selectedAddress); // Debug log
      console.log('🔄 Order placement debug:');
      console.log('  - isReorderFlow:', isReorderFlow);
      console.log('  - cartItems length:', cartItems.length);
      console.log('  - cartItems:', cartItems);

      // If single-product checkout, skip cart fetch and use cartItems
      const productId = params.get('product');
      let itemsToOrder = cartItems;
      
      // Only fetch from cart if it's not a single-product checkout AND not a reorder flow
      if (!productId && !isReorderFlow) {
        // Get cart items with product details (re-fetch to ensure latest data)
        const { data: carts, error: cartError } = await supabase
          .from('carts')
          .select('id')
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (cartError) throw new Error('Error fetching cart: ' + cartError.message);
        
        if (!carts || carts.length === 0) {
          toast.error('No cart found. Please add items to your cart first.');
          navigate('/customer/cart');
          return;
        }

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
          .eq('cart_id', carts[0].id);

        if (itemsError) throw new Error('Error fetching cart items: ' + itemsError.message);

        if (!cartItemsData || cartItemsData.length === 0) {
          toast.error('Your cart is empty');
          return;
        }
        itemsToOrder = cartItemsData;
      }
      
      // For reorder flow, validate that we have items in cartItems state
      if (isReorderFlow && (!itemsToOrder || itemsToOrder.length === 0)) {
        toast.error('No reorder items found. Please try again.');
        navigate('/customer/orders');
        return;
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

             // Create delivery address with GPS coordinates
       const deliveryAddress = {
         full_name: selectedAddress.full_name,
         phone: selectedAddress.phone,
         street_address: selectedAddress.street_address,
         barangay: selectedAddress.barangay || 'Unknown',
         city: selectedAddress.city || 'Unknown',
         province: selectedAddress.province || 'Unknown',
         region: selectedAddress.region || 'Unknown',
         postal_code: selectedAddress.postal_code || '0000',
         latitude: selectedAddress.latitude || null,
         longitude: selectedAddress.longitude || null
       };

       console.log('=== DELIVERY ADDRESS DEBUG ===');
       console.log('Selected address ID:', selectedAddressId);
       console.log('Selected address data:', selectedAddress);
       console.log('All available addresses:', userAddresses);
       console.log('Delivery address being sent to database:', deliveryAddress);
       console.log('Barangay being sent:', deliveryAddress.barangay);
       console.log('Full name being sent:', deliveryAddress.full_name);
       console.log('Street address being sent:', deliveryAddress.street_address);
       console.log('================================');

      // Use the captured original order ID from state if available
      const originalOrderId = originalOrderIdState;
      
      // Fallback: check session storage directly if state isn't working
      const sessionIsReorder = sessionStorage.getItem('isReorder') === 'true';
      const sessionOriginalOrderId = sessionStorage.getItem('originalOrderId');
      
      console.log('🔍 Reorder detection:');
      console.log('  - isReorderFlow state:', isReorderFlow);
      console.log('  - sessionIsReorder:', sessionIsReorder);
      console.log('  - originalOrderId from state:', originalOrderId);
      console.log('  - sessionOriginalOrderId:', sessionOriginalOrderId);
      console.log('  - reorderProcessed:', reorderProcessed);
      
      // Use session storage as fallback if state isn't working
      const finalIsReorder = isReorderFlow || sessionIsReorder;
      const finalOriginalOrderId = originalOrderId || sessionOriginalOrderId;

      // Guard: if this is a reorder but we lost the original order id, stop and ask user to retry
      if (finalIsReorder && !finalOriginalOrderId) {
        toast.error('Reorder session expired. Please tap Reorder again.');
        navigate('/customer/orders');
        return;
      }
      
      let orderIdForThisCheckout: string | null = null;
      
      let reorderHandledByRPC = false;

      if (finalIsReorder && finalOriginalOrderId) {
        // ✅ FINAL CHECK: Verify order is still rejected before allowing submission
        console.log('🔍 Final verification: Checking if order can be reordered...', finalOriginalOrderId);
        try {
          const { data: finalCheck, error: finalCheckError } = await supabase
            .from('orders')
            .select('id, approval_status, customer_id')
            .eq('id', finalOriginalOrderId)
            .single();
          
          console.log('📊 Final check result:', finalCheck);
          
          if (finalCheckError || !finalCheck) {
            console.error('❌ Error in final check:', finalCheckError);
            toast.error('Unable to verify order status.');
            navigate('/customer/orders');
            return;
          }
          
          if (finalCheck.approval_status !== 'rejected') {
            console.log('🚫 FINAL BLOCK: Order is no longer rejected. Status:', finalCheck.approval_status);
            toast.error('This order has already been reordered. It is now in ' + finalCheck.approval_status + ' status.');
            navigate('/customer/orders');
            return;
          }
          
          console.log('✅ Final check passed: Order is still rejected, proceeding with reorder');
        } catch (err) {
          console.error('❌ Error in final status check:', err);
          toast.error('Unable to verify order status.');
          navigate('/customer/orders');
          return;
        }
        
        // Try RPC first to safely bypass RLS and update items atomically
        console.log('🔄 Attempting reorder via RPC for order:', finalOriginalOrderId);
        toast.loading('Updating your existing order...', { id: 'reorder-toast' });

        const rpcItems = itemsToOrder.map(item => ({
          product_id: item.product.id,
          quantity: item.quantity,
          price: item.product.price
        }));

        try {
          const { data: rpcOrder, error: rpcError } = await (supabase as any).rpc('customer_reorder', {
            p_order_id: finalOriginalOrderId,
            p_items: rpcItems,
            p_total: total,
            p_selected_address_id: selectedAddress.id,
            p_delivery_address: deliveryAddress,
            p_notes: data.notes || null
          });

          if (rpcError) {
            console.warn('⚠️ RPC customer_reorder failed, will fallback to manual path:', rpcError);
          } else if (rpcOrder) {
            orderIdForThisCheckout = (rpcOrder as { id: string }).id;
            reorderHandledByRPC = true;
            console.log('✅ Reorder via RPC succeeded. Order ID:', orderIdForThisCheckout);
            toast.success('Order updated successfully! Using the same order ID.', { id: 'reorder-toast' });
            // Preserve session until navigation below
            console.log('🧹 Preserving reorder session storage until navigation');
          }
        } catch (rpcEx) {
          console.warn('⚠️ Exception during RPC reorder, will fallback to manual path:', rpcEx);
        }

        if (!reorderHandledByRPC) {
          // Fallback: UPDATE EXISTING REJECTED ORDER manually
          console.log('🔄 Fallback: updating existing order to pending via standard update');
          
          // First check: Verify order is still rejected before allowing reorder
          const { data: orderStatusCheck, error: statusCheckError } = await supabase
            .from('orders')
            .select('id, approval_status')
            .eq('id', finalOriginalOrderId)
            .single();
          
          if (statusCheckError || !orderStatusCheck) {
            console.error('❌ Error checking order status:', statusCheckError);
            throw new Error('Unable to verify order status: ' + (statusCheckError?.message || 'Unknown error'));
          }
          
          // If order is not rejected (already reordered), prevent duplicate reorder
          if (orderStatusCheck.approval_status !== 'rejected') {
            console.error('❌ Order is no longer rejected. Status:', orderStatusCheck.approval_status);
            toast.error('This order has already been reordered or is no longer in rejected status.');
            navigate('/customer/orders');
            return;
          }

          const { data: updatedOrder, error: updateError } = await supabase
            .from('orders')
            .update({
              approval_status: 'pending',
              delivery_status: 'pending',
              total: total,
              selected_address_id: selectedAddress.id,
              delivery_address: deliveryAddress,
              notes: data.notes
            })
            .eq('id', finalOriginalOrderId)
            .select()
            .single();

          if (updateError) {
            console.error('❌ Error updating order:', updateError);
            throw new Error('Error updating order: ' + updateError.message);
          }

          orderIdForThisCheckout = updatedOrder.id;
          console.log('✅ Order updated to pending with ID:', orderIdForThisCheckout);
          toast.success('Order updated successfully! Using the same order ID.', { id: 'reorder-toast' });
          // Preserve session until navigation below
          console.log('🧹 Preserving reorder session storage until navigation');
        }
      } else {
        // CREATE NEW ORDER (for regular checkout)
        console.log('🆕 Creating NEW order...');
        
        const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert([{
            customer_id: user.id,
            total,
            order_status_code: 'pending',
            approval_status: 'pending',
            selected_address_id: selectedAddress.id,
            delivery_address: deliveryAddress,
            notes: data.notes,
            original_order_id: finalIsReorder ? finalOriginalOrderId : null,
            created_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (orderError) throw new Error('Error creating order: ' + orderError.message);
        
        orderIdForThisCheckout = newOrder.id;
        console.log('✅ NEW order created with ID:', orderIdForThisCheckout);
        console.log('📊 Order details:', {
          id: orderIdForThisCheckout,
          total: newOrder.total,
          isReorder: isReorderFlow,
          approval_status: newOrder.approval_status || 'pending'
        });
      }

      // Ensure we have an order id for downstream operations
      if (!orderIdForThisCheckout) {
        throw new Error('Order ID missing after placing order');
      }

      // Notification will be created automatically by database trigger
      // But let's add a fallback in case the trigger fails
      setTimeout(async () => {
        try {
          // Check if notification was created by trigger
          const { data: notifications } = await supabase
            .from('notifications')
            .select('id')
            .eq('user_id', user.id)
            .eq('data->>orderId', orderIdForThisCheckout as string)
            .limit(1);
          
          if (!notifications || notifications.length === 0) {
            console.log('No notification found, creating fallback notification');
            await orderNotificationService.createNotification({
              orderId: orderIdForThisCheckout as string,
              title: 'Order Placed',
              message: 'Your order has been successfully placed and is pending approval.'
            });
          }
        } catch (error) {
          console.error('Error in fallback notification creation:', error);
        }
      }, 2000); // Wait 2 seconds for trigger to execute

      if (finalIsReorder && finalOriginalOrderId && !reorderHandledByRPC) {
        // UPDATE existing order items for reorder
        console.log('🔄 Updating order items for reorder...');
        
        // First, delete existing order items from the ORIGINAL order
        const { error: deleteError } = await supabase
          .from('order_items')
          .delete()
          .eq('order_id', finalOriginalOrderId);

        if (deleteError) throw new Error('Error deleting old order items: ' + deleteError.message);

        // Then insert new order items into the SAME (updated) order
        const orderItems = itemsToOrder.map(item => ({
          order_id: finalOriginalOrderId, // ✅ Use the ORIGINAL order ID, not the new one!
          product_id: item.product.id,
          quantity: item.quantity,
          price: item.product.price,
          reservation_status: 'reserved'
        }));

        const { error: itemsInsertError } = await supabase
          .from('order_items')
          .insert(orderItems);

        if (itemsInsertError) throw new Error('Error updating order items: ' + itemsInsertError.message);
        
        console.log('✅ Order items updated for reorder');
      } else if (!finalIsReorder) {
        // CREATE new order items for regular checkout
        console.log('🆕 Creating new order items...');
        
        const orderItems = itemsToOrder.map(item => ({
          order_id: orderIdForThisCheckout!,
          product_id: item.product.id,
          quantity: item.quantity,
          price: item.product.price,
          reservation_status: 'reserved'
        }));

        const { error: itemsInsertError } = await supabase
          .from('order_items')
          .insert(orderItems);

        if (itemsInsertError) throw new Error('Error creating order items: ' + itemsInsertError.message);
        
        console.log('✅ Order items created');
      }

      // Reorder logic is now handled above by updating the existing order
      // No need for additional tracking since we're updating the same order

      // Do not update product quantities here; stock will be decremented upon order approval

      // If not single-product checkout and not reorder flow, clear cart and notify badge
      if (!productId && !isReorderFlow) {
        const { data: carts, error: cartError } = await supabase
          .from('carts')
          .select('id')
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);
        if (carts && carts.length > 0 && !cartError) {
          const { error: clearCartError } = await supabase
            .from('cart_items')
            .delete()
            .eq('cart_id', carts[0].id);
          if (clearCartError) throw new Error('Error clearing cart: ' + clearCartError.message);
          // Optimistic UI: tell header to clear badge immediately
          window.dispatchEvent(new Event('cart:clear'));
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
          const filePath = `receipts/order-${orderIdForThisCheckout}/${timestamp}.${fileExtension}`;

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
              order_id: orderIdForThisCheckout!,
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
          if (finalIsReorder) {
            toast.success('Order updated successfully! Your order is now pending approval.');
            // The original_order_id is already saved in the database during order creation
            console.log('✅ Reorder completed for original order:', finalOriginalOrderId);
          } else {
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
        if (finalIsReorder) {
          toast.success('Order updated successfully! Your order is now pending approval.');
          // The original_order_id is already saved in the database during order creation
          console.log('✅ Reorder completed for original order:', finalOriginalOrderId);
        } else {
          toast.success('Order placed successfully!');
        }
      }

      // Clear reorder session storage right before navigating back to orders
      sessionStorage.removeItem('reorderItems');
      sessionStorage.removeItem('isReorder');
      sessionStorage.removeItem('originalOrderId');
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

  if (detectingReorder || (reorderFromEmail && cartItems.length === 0 && !reorderProcessed)) {
    console.log('🔄 Showing loading state for reorder:', { detectingReorder, reorderFromEmail, cartItemsLength: cartItems.length, reorderProcessed });
    return <Loader label="Loading reorder items..." />;
  }

  if ((loadingCart || loadingAddresses) && !isSingleProductCheckout && !isReorderFlow) {
    return <Loader label={loadingCart ? "Loading cart..." : "Loading addresses..."} />;
  }

  if (loading) {
    return <Loader label="Processing order..." />;
  }

  // Check if this is a reorder from email (using the already declared urlParams)
  const reorderFromEmailCheck = urlParams.get('reorder');
  const autoCheckout = urlParams.get('auto') === 'checkout';
  
  console.log('🔍 URL params check:', { reorderFromEmailCheck, autoCheckout, cartItemsLength: cartItems.length, reorderProcessed, isReorderFlow });

  // Show loading if we're processing reorder from email
  if (reorderFromEmailCheck && cartItems.length === 0 && !reorderProcessed) {
    console.log('🔄 Reorder from email loading state:', { reorderFromEmailCheck, cartItemsLength: cartItems.length, reorderProcessed });
    return <Loader label="Loading your previous order items..." />;
  }

  if (cartItems.length === 0 && !isSingleProductCheckout && !isReorderFlow && !reorderFromEmailCheck) {
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

  if (cartItems.length === 0 && isReorderFlow) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center py-12">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
            <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {reorderFromEmail ? 'Reorder Failed' : 'No Reorder Items Found'}
          </h3>
          <p className="text-gray-500 mb-6">
            {reorderFromEmail 
              ? 'Could not load your previous order items. The order may not exist or you may not have permission to access it.'
              : 'The items from your previous order are no longer available or have been removed from our inventory.'
            }
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => navigate('/customer/orders')}
            >
              Back to Orders
            </Button>
            <Button
              onClick={() => navigate('/customer')}
            >
              Browse Products
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">

      <Button
        variant="ghost"
        icon={<ArrowLeft size={18} />}
        onClick={() => navigate(autoCheckout ? '/customer/orders' : '/customer/cart')}
        className="mb-6"
      >
        {!isSingleProductCheckout && !isReorderFlow && !autoCheckout && 'Back to Cart'}
        {autoCheckout && 'Back to Orders'}
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
                  className={`p-4 rounded-lg border flex items-start space-x-3 transition-all duration-200 ${
                    selectedAddressId === address.id 
                      ? 'bg-blue-50 border-blue-300 shadow-sm' 
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <input
                    type="radio"
                    id={`address-${address.id}`}
                    value={address.id}
                    checked={selectedAddressId === address.id}
                    onChange={() => handleAddressChange(address.id)}
                    className="mt-1 h-4 w-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                  />
                  <label htmlFor={`address-${address.id}`} className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {address.full_name} {address.phone ? `(+63) ${address.phone}` : ''}
                      </p>
                      {selectedAddressId === address.id && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Selected
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                            selectedAddressId === address.id
                              ? 'bg-blue-100 text-blue-800 border-blue-200'
                              : 'bg-amber-100 text-amber-800 border-amber-200'
                          }`}
                        >
                          {address.barangay || 'Barangay not set'}
                        </span>
                        <span>
                          {formatLocation([address.city, address.province, address.region])}
                          {address.postal_code ? ` ${address.postal_code}` : ''}
                        </span>
                      </div>
                      <div className="mt-1">{address.street_address}</div>
                    </div>
                    {address.label && (
                      <span className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {address.label}
                      </span>
                    )}
                  </label>
                </div>
              ))}
              {!selectedAddressId && (
                <p className="mt-1 text-sm text-red-600">Please select a delivery address</p>
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
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6 flex flex-col gap-4 overflow-hidden">
          {/* Full-width informational note */}
          <div className="w-full">
            <div className="flex items-center bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 w-full">
              <svg className="w-5 h-5 text-blue-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z" /></svg>
              <span className="text-sm text-blue-800 font-medium">Scan the QR to pay. Please pay the exact amount based on your order summary.</span>
            </div>
          </div>
          {/* Two-column row: QR and Proof side-by-side always */}
          <div className="flex flex-row items-stretch gap-6">
            {/* Left: QR Code and Payment Info */}
            <div className="flex flex-col items-center justify-center w-1/2 relative overflow-hidden">
            
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
            <div className="hidden md:block w-px bg-gray-200"></div>
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
        </div>
        {/* 5. Place Order Button */}
        <div className="bg-white rounded-lg shadow-sm p-6 flex justify-end">
          <Button
            type="submit"
            isLoading={loading}
            disabled={userAddresses.length === 0 || !selectedAddressId || loading}
          >
            Place Order
          </Button>
        </div>
      </form>
    </div>
  );
}