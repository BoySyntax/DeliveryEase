import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Minus, Plus, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import Button from '../../ui/components/Button';

import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  quantity: number;
  category_id: string;
  created_at: string | null;
  unit: string | null;
  unit_quantity: number | null;
  featured: boolean;
  weight: number;
};

export default function ProductDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);

  useEffect(() => {
    async function loadProduct() {
      if (!id) return;
      
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        setProduct(data);
      } catch (error) {
        console.error('Error loading product:', error);
        toast.error('Failed to load product details');
      } finally {
        setLoading(false);
      }
    }

    loadProduct();
  }, [id]);

  const handleAddToCart = async () => {
    if (!product) return;

    try {
      setAddingToCart(true);
      // Get user's cart or create new one
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to add items to cart');
        return;
      }

      // Get or create cart in a single query
      const { data: cart, error: cartError } = await supabase
        .from('carts')
        .select('id')
        .eq('customer_id', user.id)
        .maybeSingle();
      
      if (cartError) {
        console.warn('Cart fetch error:', cartError);
        // Continue to create a new cart
      }

      let cartId: string;
      
      if (!cart) {
        const { data: newCart, error: createError } = await supabase
          .from('carts')
          .insert([{ customer_id: user.id }])
          .select()
          .single();

        if (createError) throw createError;
        if (!newCart) throw new Error('Failed to create cart');
        cartId = newCart.id;
      } else {
        cartId = cart.id;
      }

      // First try to get existing item
      const { data: existingItem } = await supabase
        .from('cart_items')
        .select('quantity')
        .eq('cart_id', cartId)
        .eq('product_id', product.id)
        .maybeSingle();

      // Check stock availability
      const currentCartQuantity = existingItem ? existingItem.quantity : 0;
      const newTotalQuantity = currentCartQuantity + quantity;
      
      if (newTotalQuantity > product.quantity) {
        const availableToAdd = product.quantity - currentCartQuantity;
        if (availableToAdd > 0) {
          toast.error(`Only ${availableToAdd} more items can be added to cart (${product.quantity} total in stock)`);
        } else {
          toast.error(`Only ${product.quantity} items available in stock`);
        }
        return;
      }

      // Add or update cart item
      const { error: upsertError } = await supabase
        .from('cart_items')
        .upsert({
          cart_id: cartId,
          product_id: product.id,
          quantity: newTotalQuantity
        });

      if (upsertError) throw upsertError;

      toast.success('Added to cart');
    } catch (error) {
      console.error('Error adding to cart:', error);
      toast.error('Failed to add item to cart');
    } finally {
      setAddingToCart(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="animate-pulse">
            <div className="aspect-square bg-gray-200 rounded-lg"></div>
          </div>
          <div className="space-y-6">
            <div className="h-8 bg-gray-200 rounded w-3/4"></div>
            <div className="h-6 bg-gray-200 rounded w-1/4"></div>
            <div className="h-4 bg-gray-200 rounded w-full"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-10 bg-gray-200 rounded w-1/3"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Product not found</h1>
          <p className="mt-2 text-gray-500">The product you're looking for doesn't exist or has been removed.</p>
          <Link to="/products" className="mt-4 inline-block">
            <Button>Back to Products</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full aspect-square object-cover rounded-lg"
          />
        </div>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{product.name}</h1>
            <p className="text-2xl font-semibold text-primary mt-2">
              {formatCurrency(product.price)}
              {product.unit ? ` per ${product.unit}` : ''}
              {product.unit && product.unit !== 'piece' && product.unit_quantity ? ` (${product.unit_quantity} pcs)` : ''}
            </p>
            <p className={`text-sm mt-2 ${product.quantity === 0 ? 'text-red-500 font-medium' : product.quantity <= 10 ? 'text-orange-500' : 'text-green-600'}`}>
              {product.quantity === 0 ? 'Out of Stock' : 
               product.quantity <= 10 ? `Only ${product.quantity} left in stock` : 
               `${product.quantity} in stock`}
            </p>
          </div>

          <div className="prose max-w-none">
            <p>{product.description}</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1 || product.quantity === 0}
              >
                <Minus size={18} />
              </Button>
              <span className="w-8 text-center">{quantity}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQuantity(Math.min(product.quantity || 0, quantity + 1))}
                disabled={quantity >= (product.quantity || 0)}
              >
                <Plus size={18} />
              </Button>
            </div>

            <Button
              onClick={handleAddToCart}
              disabled={product.quantity === 0 || addingToCart}
              className="flex-1"
            >
              {addingToCart ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding to Cart...
                </>
              ) : product.quantity === 0 ? (
                'Out of Stock'
              ) : (
                'Add to Cart'
              )}
            </Button>
          </div>

          {product.quantity === 0 && (
            <p className="text-red-500 text-sm">This product is currently out of stock</p>
          )}
        </div>
      </div>
    </div>
  );
}