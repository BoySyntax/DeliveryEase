import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ProductCard from '../components/ProductCard';
import Input from '../../ui/components/Input';
import Select from '../../ui/components/Select';
import Loader from '../../ui/components/Loader';
import { toast } from 'react-hot-toast';

type Category = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  price: number;
  image_url: string;
  category_id: string;
  quantity?: number;
  unit?: string;
  unit_quantity?: number;
};

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [addingToCart, setAddingToCart] = useState<string | null>(null);

  const categoryId = searchParams.get('category') || '';
  const searchQuery = searchParams.get('search') || '';

  useEffect(() => {
    async function loadCategories() {
      setLoadingCategories(true);
      try {
        const { data: categoriesData } = await supabase
          .from('categories')
          .select('*')
          .order('name');
        
        if (categoriesData) {
          setCategories(categoriesData);
        }
      } catch (error) {
        console.error('Error loading categories:', error);
        toast.error('Failed to load categories');
      } finally {
        setLoadingCategories(false);
      }
    }

    loadCategories();
  }, []);

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

  const handleSearch = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set('search', value);
    } else {
      params.delete('search');
    }
    setSearchParams(params);
  };

  const handleCategoryChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set('category', value);
    } else {
      params.delete('category');
    }
    setSearchParams(params);
  };

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
        .single();

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
        .eq('product_id', productId)
        .maybeSingle();

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

  if (loadingCategories) {
    return <Loader label="Loading categories..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-row gap-2 items-center mb-2 justify-center">
        <Input
          placeholder="Search products..."
          icon={<Search size={16} />}
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-[220px] h-8 py-1 text-xs rounded-md border-gray-300 focus:border-primary-500 focus:ring-primary-500 shadow-sm pl-8"
        />
        <Select
          options={[
            { value: '', label: 'All Categories' },
            ...categories.map(cat => ({
              value: cat.id,
              label: cat.name
            }))
          ]}
          value={categoryId}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="w-[180px] h-8 px-2 py-1 text-xs rounded-md border-gray-300 focus:border-primary-500 focus:ring-primary-500 shadow-sm"
        />
      </div>

      {loadingProducts ? (
        <div className="grid grid-cols-2 gap-4">
          {[...Array(8)].map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="aspect-square bg-gray-200 rounded-lg mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No products found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              id={product.id}
              name={product.name}
              price={product.price}
              imageUrl={product.image_url}
              quantity={product.quantity}
              unit={product.unit}
              unit_quantity={product.unit_quantity}
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