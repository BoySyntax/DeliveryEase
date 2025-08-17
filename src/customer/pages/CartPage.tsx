import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import Button from '../../ui/components/Button';
import { toast } from 'react-hot-toast';
import { useSession } from '../../lib/auth';

type CartItem = {
  id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    price: number;
    image_url: string;
    quantity: number;
  };
};

export default function CartPage() {
  const { session } = useSession();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [updatingItem, setUpdatingItem] = useState<string | null>(null);
  const [removingItem, setRemovingItem] = useState<string | null>(null);
  const navigate = useNavigate();

  // Refresh cart data from server
  const refreshCart = async () => {
    if (!session?.user) return;

    try {
      // Get the latest cart for this user
      const { data: existingCarts, error: cartError } = await supabase
        .from('carts')
        .select('id')
        .eq('customer_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (cartError) {
        console.error('Error checking cart:', cartError);
        return;
      }

      let cartId;
      if (!existingCarts || existingCarts.length === 0) {
        // Create a new cart if none exists
        const { data: newCart, error: createError } = await supabase
          .from('carts')
          .insert({ customer_id: session.user.id })
          .select('id')
          .single();

        if (createError) {
          console.error('Error creating cart:', createError);
          return;
        }
        cartId = newCart.id;
      } else {
        cartId = existingCarts[0].id;
      }

      // Fetch cart items with fresh data
      const { data: items, error: itemsError } = await supabase
        .from('cart_items')
        .select(`
          id,
          quantity,
          product:products (
            id,
            name,
            price,
            image_url,
            quantity
          )
        `)
        .eq('cart_id', cartId);

      if (itemsError) {
        console.error('Error fetching cart items:', itemsError);
        return;
      }

      const normalized = (items || []) as CartItem[];
      // Consolidate any duplicate rows for the same product (legacy carts)
      const consolidated = await consolidateDuplicates(normalized);
      setCartItems(consolidated);
    } catch (error) {
      console.error('Cart refresh error:', error);
    }
  };

  useEffect(() => {
    let ignore = false;

    async function initializeCart() {
      console.log('Cart initialization started');
      
      if (!session?.user) {
        console.log('No session found');
        if (!ignore) {
          setIsLoaded(true);
        }
        return;
      }

      try {
        await refreshCart();
        if (!ignore) {
          setIsLoaded(true);
        }
      } catch (error) {
        console.error('Cart initialization error:', error);
        if (!ignore) {
          toast.error('Failed to initialize cart');
          setCartItems([]);
          setIsLoaded(true);
        }
      }
    }

    setIsLoaded(false);
    initializeCart();

    return () => {
      ignore = true;
    };
  }, [session]);

  // Refresh cart when page becomes visible (e.g., user comes back from another tab/page)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && session?.user) {
        refreshCart();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session]);

  // Merge duplicate cart rows by product and fix server state
  async function consolidateDuplicates(items: CartItem[]): Promise<CartItem[]> {
    const productIdToItems = new Map<string, CartItem[]>();
    for (const it of items) {
      if (!it.product?.id) continue;
      const key = it.product.id;
      const list = productIdToItems.get(key) || [];
      list.push(it);
      productIdToItems.set(key, list);
    }

    const result: CartItem[] = [];
    for (const [, group] of productIdToItems) {
      if (group.length === 1) {
        result.push(group[0]);
        continue;
      }
      // Multiple rows for same product: merge them
      const keeper = group[0];
      const sum = group.reduce((s, g) => s + (g.quantity || 0), 0);
      const maxAllowed = keeper.product.quantity;
      const mergedQty = Math.min(sum, maxAllowed);

      // Update server: set qty on keeper, delete others
      try {
        if (keeper.quantity !== mergedQty) {
          await supabase.from('cart_items').update({ quantity: mergedQty }).eq('id', keeper.id);
          keeper.quantity = mergedQty;
        }
        const toDelete = group.slice(1).map(g => g.id);
        if (toDelete.length > 0) {
          await supabase.from('cart_items').delete().in('id', toDelete);
        }
      } catch (e) {
        console.warn('Failed consolidating duplicate cart rows', e);
      }
      result.push(keeper);
    }
    return result;
  }

  const handleUpdateQuantity = async (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    
    // Find the cart item to check stock
    const cartItem = cartItems.find(item => item.id === itemId);
    if (!cartItem) return;
    
    // Check if the new quantity exceeds available stock
    if (newQuantity > cartItem.product.quantity) {
      toast.error(`Only ${cartItem.product.quantity} items available in stock`);
      return;
    }
    
    setUpdatingItem(itemId);

    try {
      // Update database first, then refresh from server
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity: newQuantity })
        .eq('id', itemId);

      if (error) throw error;
      
      // Refresh cart data from server to ensure accuracy
      await refreshCart();
      
      // Fire event if quantity change crosses 0/1 boundary (affects distinct product count)
      const wasZero = cartItem.quantity === 0;
      const nowZero = newQuantity === 0;
      if (!wasZero && nowZero) {
        window.dispatchEvent(new Event('cart:product-removed'));
      } else if (wasZero && !nowZero) {
        window.dispatchEvent(new Event('cart:product-added'));
      }
    } catch (error) {
      console.error('Error updating quantity:', error);
      toast.error('Failed to update quantity');
      // Refresh cart to get accurate state
      await refreshCart();
    } finally {
      setUpdatingItem(null);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    setRemovingItem(itemId);

    try {
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      // Refresh cart data from server to ensure accuracy
      await refreshCart();
      window.dispatchEvent(new Event('cart:product-removed'));
      toast.success('Item removed from cart');
    } catch (error) {
      console.error('Error removing item:', error);
      toast.error('Failed to remove item');
      // Refresh cart to get accurate state
      await refreshCart();
    } finally {
      setRemovingItem(null);
    }
  };

  const handleCheckout = () => {
    navigate('/customer/checkout');
  };

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShoppingBag className="w-16 h-16 text-gray-400" />
        <h2 className="text-2xl font-semibold text-gray-900">Please sign in to view your cart</h2>
        <Button onClick={() => navigate('/login')}>Sign In</Button>
      </div>
    );
  }

  const total = cartItems.reduce(
    (sum, item) => sum + item.quantity * item.product.price,
    0
  );

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <div className="bg-gray-50 w-full">
        <div className="max-w-2xl mx-auto px-4">
          <h1 className="text-2xl font-semibold -mt-5 py-3">Shopping Cart</h1>
        </div>
      </div>
      <div className="px-4">
        {!isLoaded ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            <p className="text-gray-500">Loading your cart...</p>
          </div>
        ) : cartItems.length > 0 ? (
          <>
            <div className="space-y-3">
              {cartItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-lg p-4 shadow-sm"
                >
                  <div className="flex items-center">
                    <div className="w-14 h-14 mr-3">
                      <img
                        src={item.product.image_url}
                        alt={item.product.name}
                        className="w-full h-full object-cover rounded"
                      />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-medium mb-0.5">{item.product.name}</h3>
                      <p className="text-gray-600 text-sm">{formatCurrency(item.product.price)}</p>
                      <p className="text-gray-500 text-xs">Stock: {item.product.quantity}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center">
                        <button
                          onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 1 || updatingItem === item.id}
                          className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-700 border rounded"
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-medium text-sm">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                          disabled={updatingItem === item.id || item.quantity >= item.product.quantity}
                          className={`w-7 h-7 flex items-center justify-center border rounded ${
                            item.quantity >= item.product.quantity 
                              ? 'text-gray-300 cursor-not-allowed' 
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        disabled={removingItem === item.id}
                        className="text-red-500 hover:text-red-600"
                      >
                        {removingItem === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <div className="flex justify-between items-center mb-3">
                <span className="text-lg font-medium">Total</span>
                <span className="text-xl font-semibold">
                  {formatCurrency(total)}
                </span>
              </div>
              <Button
                onClick={handleCheckout}
                fullWidth
                className="bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-lg font-medium"
              >
                Proceed to Checkout
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <ShoppingBag className="w-16 h-16 text-gray-400" />
            <h2 className="text-2xl font-semibold text-gray-900">Your cart is empty</h2>
            <Button onClick={() => navigate('/customer/products')}>Browse Products</Button>
          </div>
        )}
      </div>
    </div>
  );
}