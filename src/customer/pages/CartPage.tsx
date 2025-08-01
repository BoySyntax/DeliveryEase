import React, { useState, useEffect } from 'react';
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
        console.log('User found, checking cart...');
        // Get the latest cart for this user
        const { data: existingCarts, error: cartError } = await supabase
          .from('carts')
          .select('id')
          .eq('customer_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (cartError) {
          console.error('Error checking cart:', cartError);
          if (!ignore) {
            toast.error('Failed to access cart');
            setIsLoaded(true);
          }
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
            if (!ignore) {
              toast.error('Failed to create cart');
              setIsLoaded(true);
            }
            return;
          }
          cartId = newCart.id;
        } else {
          cartId = existingCarts[0].id;
        }

        // Fetch cart items
        const { data: items, error: itemsError } = await supabase
          .from('cart_items')
          .select(`
            id,
            quantity,
            product:products (
              id,
              name,
              price,
              image_url
            )
          `)
          .eq('cart_id', cartId);

        if (itemsError) {
          console.error('Error fetching cart items:', itemsError);
          if (!ignore) {
            toast.error('Failed to load cart items');
            setCartItems([]);
            setIsLoaded(true);
          }
          return;
        }

        if (!ignore) {
          setCartItems((items || []) as CartItem[]);
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

  const handleUpdateQuantity = async (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    setUpdatingItem(itemId);

    try {
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity: newQuantity })
        .eq('id', itemId);

      if (error) throw error;

      setCartItems(prev =>
        prev.map(item =>
          item.id === itemId
            ? { ...item, quantity: newQuantity }
            : item
        )
      );
    } catch (error) {
      console.error('Error updating quantity:', error);
      toast.error('Failed to update quantity');
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

      setCartItems(prev => prev.filter(item => item.id !== itemId));
      toast.success('Item removed from cart');
    } catch (error) {
      console.error('Error removing item:', error);
      toast.error('Failed to remove item');
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
    <div className="max-w-2xl mx-auto pb-8">
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
                          disabled={updatingItem === item.id}
                          className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-700 border rounded"
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