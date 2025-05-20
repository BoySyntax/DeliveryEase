import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, ArrowRight, ShoppingCart, Loader2 } from 'lucide-react';
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
};

export default function HomePage() {
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingToCart, setAddingToCart] = useState<string | null>(null);
  const navigate = useNavigate();

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
          .order('created_at', { ascending: false })
          .limit(4);
        
        if (productsData) {
          setFeaturedProducts(productsData);
        }
      } catch (error) {
        console.error('Error loading home data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
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
    <div className="space-y-8">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-primary-500 to-primary-700 text-white rounded-lg py-12 px-6 mb-8">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Fresh Groceries Delivered to Your Door</h1>
          <p className="text-lg mb-6 opacity-90">Shop our wide selection of quality products and enjoy fast, reliable delivery.</p>
          <Link to="/customer/products">
            <Button 
              size="lg" 
              variant="secondary"
              icon={<ShoppingBag size={20} />}
            >
              Shop Now
            </Button>
          </Link>
        </div>
      </section>

      {/* Categories Section */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Categories</h2>
          <Link to="/customer/products" className="text-primary-600 flex items-center text-sm font-medium">
            View all <ArrowRight size={16} className="ml-1" />
          </Link>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories.slice(0, 4).map((category) => (
            <Link 
              key={category.id} 
              to={`/customer/products?category=${category.id}`}
              className="group"
            >
              <Card className="h-24 flex items-center justify-center text-center transition-all group-hover:border-primary-500 group-hover:shadow-md">
                <CardContent className="p-4">
                  <span className="text-gray-800 font-medium group-hover:text-primary-600">{category.name}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Products Section */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Featured Products</h2>
          <Link to="/customer/products" className="text-primary-600 flex items-center text-sm font-medium">
            View all <ArrowRight size={16} className="ml-1" />
          </Link>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featuredProducts.map((product) => (
            <Card key={product.id} className="h-full group transform transition hover:-translate-y-1 hover:shadow-md">
              <Link to={`/customer/products/${product.id}`}>
                <div className="aspect-square w-full overflow-hidden bg-gray-100 rounded-t-lg">
                  <img 
                    src={product.image_url} 
                    alt={product.name}
                    className="h-full w-full object-cover object-center"
                  />
                </div>
                <CardContent className="p-4">
                  <h3 className="text-lg font-medium text-gray-900 group-hover:text-primary-600">{product.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {product.quantity === 0 || !product.quantity ? 'Out of Stock' : `Quantity: ${product.quantity}`}
                  </p>
                  <p className="text-primary-600 font-semibold mt-1">{formatCurrency(product.price)}</p>
                </CardContent>
              </Link>
              <div className="px-4 pb-4">
                <Button
                  size="sm"
                  icon={<ShoppingCart size={16} />}
                  fullWidth
                  disabled={product.quantity === 0 || addingToCart === product.id}
                  onClick={() => handleAddToCart(product.id)}
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
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* How It Works Section */}
      <section className="bg-gray-50 rounded-lg p-6 mt-10">
        <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">How It Works</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="bg-primary-100 text-primary-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShoppingBag size={24} />
            </div>
            <h3 className="font-medium mb-2">Browse Products</h3>
            <p className="text-gray-600 text-sm">Shop our wide selection of quality products</p>
          </div>
          
          <div className="text-center">
            <div className="bg-primary-100 text-primary-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="font-medium mb-2">Place Your Order</h3>
            <p className="text-gray-600 text-sm">Checkout and pay for your items</p>
          </div>
          
          <div className="text-center">
            <div className="bg-primary-100 text-primary-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </div>
            <h3 className="font-medium mb-2">Fast Delivery</h3>
            <p className="text-gray-600 text-sm">Enjoy reliable and timely delivery</p>
          </div>
        </div>
      </section>
    </div>
  );
}