import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
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
};

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);

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
    try {
      // Get user's cart or create new one
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to add items to cart');
        return;
      }

      let { data: cart } = await supabase
        .from('carts')
        .select('id')
        .eq('customer_id', user.id)
        .single();

      if (!cart) {
        const { data: newCart, error: cartError } = await supabase
          .from('carts')
          .insert([{ customer_id: user.id }])
          .select()
          .single();

        if (cartError) throw cartError;
        cart = newCart;
      }

      // Check if item already exists in cart
      const { data: existingItem } = await supabase
        .from('cart_items')
        .select('id, quantity')
        .eq('cart_id', cart.id)
        .eq('product_id', productId)
        .single();

      if (existingItem) {
        // Update quantity
        await supabase
          .from('cart_items')
          .update({ quantity: existingItem.quantity + 1 })
          .eq('id', existingItem.id);
      } else {
        // Add new item
        await supabase
          .from('cart_items')
          .insert([{
            cart_id: cart.id,
            product_id: productId,
            quantity: 1
          }]);
      }

      toast.success('Added to cart');
    } catch (error) {
      console.error('Error adding to cart:', error);
      toast.error('Failed to add item to cart');
    }
  };

  if (loadingCategories) {
    return <Loader label="Loading categories..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4">
        <Input
          placeholder="Search products..."
          icon={<Search size={18} />}
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="md:w-64"
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
          className="md:w-48"
        />
      </div>

      {loadingProducts ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              id={product.id}
              name={product.name}
              price={product.price}
              imageUrl={product.image_url}
              quantity={product.quantity}
              onAddToCart={() => handleAddToCart(product.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}