import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, ArrowRight, ShoppingCart, Loader2, Search, Bell, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../ui/components/Card';
import Button from '../../ui/components/Button';
import { formatCurrency } from '../../lib/utils';
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
  created_at?: string;
  unit?: string;
  unit_quantity?: number;
};

export default function HomePage() {
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingToCart, setAddingToCart] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [cartCount, setCartCount] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // Fetch categories
        const { data: categoriesData } = await supabase
          .from('categories')
          .select('*')
          .order('name');
        
        if (categoriesData) {
          setCategories(categoriesData);
        }

        // Fetch featured products (most recent 4)
        const { data: productsData } = await supabase
          .from('products')
          .select('*')
          .eq('featured', true)
          .order('created_at', { ascending: false })
          .limit(4);
        
        if (productsData) {
          setFeaturedProducts(productsData.map((p: any) => ({
            ...p,
            created_at: p.created_at ?? undefined,
          })));
        }
      } catch (error) {
        console.error('Error loading home data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  useEffect(() => {
    async function fetchStats() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Cart count
      const { data: cart } = await supabase
        .from('carts')
        .select('id')
        .eq('customer_id', user.id)
        .single();
      if (cart) {
        const { data: items } = await supabase
          .from('cart_items')
          .select('id')
          .eq('cart_id', cart.id);
        setCartCount(items ? items.length : 0);
      }
      // Orders count
      const { data: orders } = await supabase
        .from('orders')
        .select('id')
        .eq('customer_id', user.id)
        .in('order_status_code', ['pending', 'verified', 'out_for_delivery']);
      setOrderCount(orders ? orders.length : 0);
      // Notifications count
      const { data: notifs } = await supabase
        .from('orders')
        .select('id')
        .eq('customer_id', user.id)
        .eq('notification_dismissed', false)
        .in('order_status_code', ['pending', 'verified', 'out_for_delivery']);
      setNotifCount(notifs ? notifs.length : 0);
    }
    fetchStats();
  }, []);

  const handleAddToCart = async (productId: string) => {
    setAddingToCart(productId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to add items to cart');
        navigate('/customer/login');
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
    } finally {
      setAddingToCart(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="aspect-square bg-gray-200 rounded-lg mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-primary-500 to-primary-700 text-white rounded-2xl py-12 px-6 mb-8 relative overflow-hidden shadow-lg w-full">
        <div className="max-w-6xl mx-auto text-center relative z-10">
          <form onSubmit={e => { e.preventDefault(); navigate(`/customer/products?search=${encodeURIComponent(searchQuery)}`); }} className="flex justify-center mb-6">
            <div className="relative w-full max-w-md">
              <input
                type="text"
                className="w-full rounded-full px-5 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-400 shadow"
                placeholder="Search for products..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-600 hover:text-primary-800">
                <Search size={22} />
              </button>
            </div>
          </form>
          <div className="mt-8">
            <div className="flex justify-between items-center mb-4 px-2">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Categories</h2>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 px-2 hide-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {categories.slice(0, 8).map((category) => (
                <Link
                  key={category.id}
                  to={`/customer/products?category=${category.id}`}
                  className="flex-shrink-0 bg-white/90 hover:bg-primary-100 transition-colors rounded-xl shadow-md px-4 py-2 flex items-center justify-center min-w-0 border border-gray-200 dark:border-gray-700"
                  style={{ width: 'auto', minWidth: 'unset', maxWidth: '200px' }}
                >
                  <span className="text-base font-semibold text-gray-800 dark:text-gray-900 text-center line-clamp-2 whitespace-nowrap">{category.name}</span>
                </Link>
              ))}
            </div>
            <style>{`
              .hide-scrollbar::-webkit-scrollbar { display: none; }
              .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
          </div>
        </div>
        {/* Subtle pattern/illustration */}
        <div className="absolute inset-0 opacity-10 bg-[url('/pattern.svg')] bg-repeat z-0" />
      </section>

      {/* Quick Stats / Shortcuts */}
      {/* Removed dashboard cards for Cart Items, Orders in Progress, and Notifications as requested */}

      {/* Featured Products Section */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800">Featured Products</h2>
          <Link to="/customer/products" className="text-primary-600 flex items-center text-sm font-medium">
            View all <ArrowRight size={16} className="ml-1" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {featuredProducts.map((product) => (
            <Card key={product.id} className="h-full group transform transition hover:-translate-y-1 hover:shadow-xl rounded-2xl border-2 border-transparent hover:border-primary-400 relative overflow-hidden min-h-[260px]">
              <Link to={`/customer/products/${product.id}`}> 
                <div className="aspect-square w-full overflow-hidden bg-gray-100 rounded-t-2xl">
                  <img 
                    src={product.image_url} 
                    alt={product.name}
                    className="h-full w-full object-cover object-center transition-transform group-hover:scale-105"
                  />
                </div>
              </Link>
              <CardContent className="p-3 flex flex-col flex-1">
                <h3 className="text-base font-bold text-gray-900 line-clamp-2 flex-1 mb-1">
                  {product.name}
                </h3>
                <div className="flex items-baseline gap-1 mb-2 flex-wrap">
                  <span className="text-primary-600 font-semibold text-base">
                    {formatCurrency(product.price)}
                  </span>
                  {product.unit && (
                    <span className="text-gray-700 text-xs font-medium">
                      per {product.unit}
                    </span>
                  )}
                  {product.unit && product.unit !== 'piece' && product.unit_quantity && (
                    <span className="text-gray-500 text-xs font-normal">
                      ({product.unit_quantity} pcs)
                    </span>
                  )}
                </div>
                {/* Show product quantity */}
                {product.quantity !== undefined && (
                  <p className="text-gray-500 text-xs mb-2">Quantity: {product.quantity}</p>
                )}
                {product.quantity !== undefined && product.quantity <= 5 && product.quantity > 0 && (
                  <span className="inline-block bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-1 rounded-full mb-2">Low Stock</span>
                )}
                {product.quantity === 0 && (
                  <span className="inline-block bg-red-100 text-red-800 text-xs font-semibold px-2 py-1 rounded-full mb-2">Out of Stock</span>
                )}
                <Button
                  size="sm"
                  icon={<ShoppingCart size={16} />}
                  fullWidth
                  disabled={product.quantity === 0 || addingToCart === product.id}
                  onClick={() => handleAddToCart(product.id)}
                  className="rounded-full mt-auto"
                >
                  {addingToCart === product.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : product.quantity === 0 ? (
                    'Out of Stock'
                  ) : (
                    'Add to Cart'
                  )}
                </Button>
              </CardContent>
              {/* New badge for recently added products */}
              {product.created_at && (Date.now() - new Date(product.created_at).getTime() < 1000 * 60 * 60 * 24 * 7) && (
                <span className="absolute top-3 left-3 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow">New</span>
              )}
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}