import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { supabase } from '../../lib/supabase';
import ProductCard from '../components/ProductCard';

import { toast } from 'react-hot-toast';

type Product = {
  id: string;
  name: string;
  price: number;
  image_url: string;
  category_id: string;
  quantity?: number;
  unit?: string | null;
  unit_quantity?: number | null;
};

export default function ProductsPage() {
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [addingToCart, setAddingToCart] = useState<string | null>(null);

  const categoryId = searchParams.get('category') || '';
  const searchQuery = searchParams.get('search') || '';



  useEffect(() => {
    async function loadProducts() {
      setLoadingProducts(true);
      try {
        // Build products query
        let query = supabase
          .from('products')
          .select('*')
          .order('name');

        // Apply category filter
        if (categoryId) {
          query = query.eq('category_id', categoryId);
        }

        // Apply search filter
        if (searchQuery) {
          query = query.ilike('name', `%${searchQuery}%`);
        }

        const { data: productsData } = await query;
        
        if (productsData) {
          setProducts(productsData);
        }
      } catch (error) {
        console.error('Error loading products:', error);
        toast.error('Failed to load products');
      } finally {
        setLoadingProducts(false);
      }
    }

    loadProducts();
  }, [categoryId, searchQuery]);



  const handleAddToCart = async (productId: string) => {
    setAddingToCart(productId);
    try {
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

      // Get product stock information
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('quantity')
        .eq('id', productId)
        .single();

      if (productError) throw productError;

      // First try to get existing item
      const { data: existingItem } = await supabase
        .from('cart_items')
        .select('quantity')
        .eq('cart_id', cartId)
        .eq('product_id', productId)
        .maybeSingle();

      // Check stock availability
      const currentCartQuantity = existingItem ? existingItem.quantity : 0;
      if (currentCartQuantity >= product.quantity) {
        toast.error(`Only ${product.quantity} items available in stock`);
        return;
      }

      // Add or update cart item
      if (existingItem) {
        // Update the quantity of the existing item
        const { error: updateError } = await supabase
          .from('cart_items')
          .update({ quantity: existingItem.quantity + 1 })
          .eq('cart_id', cartId)
          .eq('product_id', productId);
        if (updateError) throw updateError;
      } else {
        // Insert new cart item
        const { error: insertError } = await supabase
          .from('cart_items')
          .insert({ cart_id: cartId, product_id: productId, quantity: 1 });
        if (insertError) throw insertError;
      }

      toast.success('Added to cart');
    } catch (error) {
      console.error('Error adding to cart:', error);
      toast.error('Failed to add item to cart');
    } finally {
      setAddingToCart(null);
    }
  };



  return (
    <div className="space-y-6 pb-20">
      {/* Removed search bar and category selector, now in layout */}
      {loadingProducts ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {[...Array(10)].map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="aspect-square bg-gray-200 rounded-lg mb-3"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No products found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              id={product.id}
              name={product.name}
              price={product.price}
              imageUrl={product.image_url}
              quantity={product.quantity}
              unit={product.unit || undefined}
              unit_quantity={product.unit_quantity || undefined}
              onAddToCart={() => handleAddToCart(product.id)}
              loading={addingToCart === product.id}
              className="border border-gray-200"
            />
          ))}
        </div>
      )}
    </div>
  );
}