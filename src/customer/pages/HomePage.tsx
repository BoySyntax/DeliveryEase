import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, ArrowRight, ShoppingCart, Loader2, Bell, Package, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../ui/components/Card';
import Button from '../../ui/components/Button';
import { formatCurrency } from '../../lib/utils';
import Loader from '../../ui/components/Loader';
import { toast } from 'react-hot-toast';

type Category = {
  id: string;
  name: string;
  image_url: string | null;
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
  const [cartCount, setCartCount] = useState(0);
  const [orderCount, setOrderCount] = useState(0);

  const [currentCategoryPage, setCurrentCategoryPage] = useState(0);
  const categoriesScrollRef = useRef<HTMLDivElement>(null);
  const [categoriesPerPage, setCategoriesPerPage] = useState(2);

  useEffect(() => {
    function updateCategoriesPerPage() {
      if (window.innerWidth >= 1280) {
        setCategoriesPerPage(5); // xl and up
      } else if (window.innerWidth >= 1024) {
        setCategoriesPerPage(4); // lg
      } else if (window.innerWidth >= 768) {
        setCategoriesPerPage(3); // md
      } else {
        setCategoriesPerPage(2); // mobile
      }
    }
    updateCategoriesPerPage();
    window.addEventListener('resize', updateCategoriesPerPage);
    return () => window.removeEventListener('resize', updateCategoriesPerPage);
  }, []);

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

    }
    fetchStats();
  }, []);

  const totalPages = Math.ceil(categories.length / categoriesPerPage);

  const scrollToCategoryPage = (pageIndex: number) => {
    if (categoriesScrollRef.current) {
      const container = categoriesScrollRef.current;
      // Calculate item width based on categoriesPerPage
      const itemWidth = container.scrollWidth / totalPages;
      let page = pageIndex;
      if (page < 0) page = 0;
      if (page >= totalPages) page = totalPages - 1;
      const scrollPosition = page * itemWidth;
      container.scrollTo({
        left: scrollPosition,
        behavior: 'smooth',
      });
      setCurrentCategoryPage(page);
    }
  };

  // Handle scroll events to update current page
  useEffect(() => {
    const container = categoriesScrollRef.current;
    if (!container || categories.length <= 2) return;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const containerWidth = container.clientWidth;
      const totalPages = Math.ceil(categories.length / categoriesPerPage);
      const itemWidth = container.scrollWidth / totalPages;
      
      const currentPage = Math.round(scrollLeft / itemWidth);
      setCurrentCategoryPage(currentPage);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [categories.length]);

  const handleAddToCart = async (productId: string) => {
    setAddingToCart(productId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to add items to cart');
        navigate('/customer/login');
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

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {[...Array(10)].map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="aspect-square bg-gray-200 rounded-lg mb-3"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Categories Section */}
      <section className="mb-8 relative">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-center items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">Categories</h2>
          </div>
          
          {/* Categories Container with Scroll */}
          <div className="relative">
            {/* Navigation Arrows */}
            {categories.length > 2 && (
              <>
                <button
                  onClick={() => scrollToCategoryPage(currentCategoryPage - 1)}
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-20 rounded-lg p-1.5 shadow-lg border transition-all duration-200 bg-white border-gray-200 hover:bg-gray-50 hover:shadow-xl cursor-pointer"
                  style={{ transform: 'translateY(-50%)' }}
                >
                  <ChevronLeft size={16} className="text-green-500" />
                </button>
                <button
                  onClick={() => scrollToCategoryPage(currentCategoryPage + 1)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-20 rounded-lg p-1.5 shadow-lg border transition-all duration-200 bg-white border-gray-200 hover:bg-gray-50 hover:shadow-xl cursor-pointer"
                  style={{ transform: 'translateY(-50%)' }}
                >
                  <ChevronRight size={16} className="text-green-500" />
                </button>
              </>
            )}
            
            {/* Scrollable Categories */}
            <div 
              ref={categoriesScrollRef}
              className="flex overflow-x-auto scrollbar-hide px-16 relative gap-4 md:gap-16"
              style={{ scrollSnapType: 'x mandatory' }}
            >
              {/* Original categories only */}
              {categories.map((category, index) => (
                <Link
                  key={`${category.id}-${index}`}
                  to={`/customer/products?category=${category.id}`}
                  className="group flex flex-col items-center p-2 flex-shrink-0 relative -mx-1"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  {/* Category image or placeholder */}
                  {category.image_url ? (
                    <div className="w-28 h-28 md:w-36 md:h-36 mb-3 flex items-center justify-center overflow-visible">
                      <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-gray-50 to-gray-100 shadow-lg border-2 border-gray-200 flex items-center justify-center group-hover:shadow-xl group-hover:border-primary-300 transition-all duration-200">
                        <img
                          src={category.image_url}
                          alt={category.name}
                          className="w-20 h-20 md:w-28 md:h-28 object-contain group-hover:scale-125 transition-transform duration-200"
                          style={{ objectFit: 'contain' }}
                          onError={(e) => {
                            // Fallback to placeholder if image fails to load
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            target.nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                        <div className="w-24 h-24 md:w-32 md:h-32 bg-gray-300 rounded-full flex items-center justify-center group-hover:bg-primary-100 transition-colors hidden">
                          <span className="text-xl md:text-3xl font-bold text-gray-600 group-hover:text-primary-600">
                            {category.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-28 h-28 md:w-36 md:h-36 mb-3 flex items-center justify-center">
                      <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-gray-50 to-gray-100 shadow-lg border-2 border-gray-200 flex items-center justify-center group-hover:shadow-xl group-hover:border-primary-300 transition-all duration-200">
                        <span className="text-xl md:text-3xl font-bold text-gray-600 group-hover:text-primary-600">
                          {category.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    </div>
                  )}
                  <span className="text-xs font-semibold text-gray-800 text-center line-clamp-2 leading-tight">
                    {category.name}
                  </span>
                </Link>
              ))}
            </div>
            
            {/* Pagination Dots */}
            {categories.length > 2 && (
              <div className="flex flex-col items-center mt-6 gap-2">
                <div className="flex gap-2">
                  {Array.from({ length: totalPages }).map((_, index) => (
                    <button
                      key={index}
                      onClick={() => scrollToCategoryPage(index)}
                      className={`h-2 rounded-full transition-all duration-200 ${
                        currentCategoryPage === index 
                          ? 'bg-green-500 w-6' 
                          : 'bg-gray-800 hover:bg-gray-600 w-2'
                      }`}
                    />
                  ))}
                </div>

              </div>
            )}
          </div>
        </div>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {featuredProducts.map((product) => (
            <Card key={product.id} className="h-full group transform transition hover:-translate-y-1 hover:shadow-xl rounded-lg border border-gray-200 hover:border-primary-400 relative overflow-hidden">
              <Link to={`/customer/products/${product.id}`}> 
                <div className="aspect-square w-full overflow-hidden bg-gray-100 rounded-t-lg">
                  <img 
                    src={product.image_url} 
                    alt={product.name}
                    className="h-full w-full object-cover object-center transition-transform group-hover:scale-105"
                  />
                </div>
              </Link>
              <CardContent className="p-2 sm:p-3 flex flex-col flex-1">
                <h3 className="text-sm sm:text-base font-medium text-gray-900 line-clamp-2 flex-1 mb-1 leading-tight">
                  {product.name}
                </h3>
                <div className="flex items-baseline gap-1 mb-1 flex-wrap">
                  <span className="text-primary-600 font-semibold text-sm">
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
                  <p className="text-gray-500 text-xs mb-1">Qty: {product.quantity}</p>
                )}
                {product.quantity !== undefined && product.quantity <= 5 && product.quantity > 0 && (
                  <span className="inline-block bg-yellow-100 text-yellow-800 text-xs font-semibold px-1 py-0.5 rounded-full mb-1">Low Stock</span>
                )}
                {product.quantity === 0 && (
                  <span className="inline-block bg-red-100 text-red-800 text-xs font-semibold px-1 py-0.5 rounded-full mb-1">Out of Stock</span>
                )}
                <Button
                  size="sm"
                  icon={<ShoppingCart size={14} />}
                  fullWidth
                  disabled={product.quantity === 0 || addingToCart === product.id}
                  onClick={() => handleAddToCart(product.id)}
                  className="rounded-md mt-auto text-xs py-1 px-2"
                >
                  {addingToCart === product.id ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
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