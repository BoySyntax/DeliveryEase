import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ShoppingCart, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../ui/components/Card';
import Button from '../../ui/components/Button';
import { formatCurrency } from '../../lib/utils';

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


  const [currentCategoryPage, setCurrentCategoryPage] = useState(0);
  const categoriesScrollRef = useRef<HTMLDivElement>(null);
  const [categoriesPerPage, setCategoriesPerPage] = useState(2);
  const [touchStartX, setTouchStartX] = useState(0);
  const [touchEndX, setTouchEndX] = useState(0);
  const [mouseStartX, setMouseStartX] = useState(0);
  const [mouseEndX, setMouseEndX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

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

        // Fetch all featured products (unlimited)
        const { data: productsData } = await supabase
          .from('products')
          .select('*')
          .eq('featured', true)
          .order('created_at', { ascending: false });
        
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



  const totalPages = Math.ceil(categories.length / categoriesPerPage);

  // Handle touch events for swiping
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStartX || !touchEndX) return;
    
    const distance = touchStartX - touchEndX;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && currentCategoryPage < totalPages - 1) {
      // Swipe left - go to next page
      scrollToCategoryPage(currentCategoryPage + 1);
    }
    if (isRightSwipe && currentCategoryPage > 0) {
      // Swipe right - go to previous page
      scrollToCategoryPage(currentCategoryPage - 1);
    }
  };

  // Handle mouse events for desktop dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    console.log('Mouse down detected');
    setIsDragging(true);
    setMouseStartX(e.clientX);
    setMouseEndX(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setMouseEndX(e.clientX);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setIsDragging(false);
    
    if (!mouseStartX || !mouseEndX) return;
    
    const distance = mouseStartX - mouseEndX;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && currentCategoryPage < totalPages - 1) {
      // Swipe left - go to next page
      scrollToCategoryPage(currentCategoryPage + 1);
    }
    if (isRightSwipe && currentCategoryPage > 0) {
      // Swipe right - go to previous page
      scrollToCategoryPage(currentCategoryPage - 1);
    }
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  // Add global mouse event listeners for better drag handling
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setMouseEndX(e.clientX);
      }
    };

    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        
        if (!mouseStartX || !mouseEndX) return;
        
        const distance = mouseStartX - mouseEndX;
        const isLeftSwipe = distance > 50;
        const isRightSwipe = distance < -50;

        if (isLeftSwipe && currentCategoryPage < totalPages - 1) {
          scrollToCategoryPage(currentCategoryPage + 1);
        }
        if (isRightSwipe && currentCategoryPage > 0) {
          scrollToCategoryPage(currentCategoryPage - 1);
        }
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, mouseStartX, mouseEndX, currentCategoryPage, totalPages]);

  const scrollToCategoryPage = (pageIndex: number) => {
    if (categoriesScrollRef.current) {
      const container = categoriesScrollRef.current;
      
      // Calculate the width of each individual category item
      const containerWidth = container.clientWidth;
      const itemWidth = containerWidth / categoriesPerPage;
      
      let page = pageIndex;
      if (page < 0) page = 0;
      if (page >= totalPages) page = totalPages - 1;
      
      // Scroll by the number of items visible at once
      const scrollPosition = page * itemWidth * categoriesPerPage;
      
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
      
      // Calculate the width of each individual category item
      const itemWidth = containerWidth / categoriesPerPage;
      
      // Calculate current page based on how many items we've scrolled past
      const currentPage = Math.round(scrollLeft / (itemWidth * categoriesPerPage));
      
      // Ensure currentPage is within bounds
      const clampedPage = Math.max(0, Math.min(currentPage, totalPages - 1));
      setCurrentCategoryPage(clampedPage);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [categories.length, categoriesPerPage]);

  const handleAddToCart = async (productId: string) => {
    if (addingToCart === productId) return; // Prevent multiple rapid clicks
    
    setAddingToCart(productId);
    
    // Add small delay to prevent rapid clicking issues
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to add items to cart');
        navigate('/login');
        return;
      }

      // Get latest existing cart; create one only if none exists
      const { data: carts } = await supabase
        .from('carts')
        .select('id')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      let cartId: string;

      if (carts && carts.length > 0) {
        cartId = carts[0].id;
      } else {
        const { data: newCart, error: createError } = await supabase
          .from('carts')
          .insert([{ customer_id: user.id }])
          .select()
          .single();

        if (createError) throw createError;
        if (!newCart) throw new Error('Failed to create cart');
        cartId = newCart.id;
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
        .select('id, quantity')
        .eq('cart_id', cartId)
        .eq('product_id', productId)
        .maybeSingle();

      // Check stock availability
      const currentCartQuantity = existingItem ? existingItem.quantity : 0;
      if (currentCartQuantity >= product.quantity) {
        toast.error(`Only ${product.quantity} items available in stock`);
        return;
      }

      // Use either insert or update based on existence to ensure accuracy
      if (existingItem) {
        // Update existing item
        const { error: updateError } = await supabase
          .from('cart_items')
          .update({ quantity: currentCartQuantity + 1 })
          .eq('id', existingItem.id);
        if (updateError) throw updateError;
      } else {
        // Insert new item
        const { error: insertError } = await supabase
          .from('cart_items')
          .insert({
            cart_id: cartId,
            product_id: productId,
            quantity: 1
          });
        if (insertError) throw insertError;
      }

      toast.success('Added to cart');
      if (!existingItem) {
        window.dispatchEvent(new Event('cart:product-added'));
      }
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
    <div className="space-y-10 pb-20">
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
                  <ChevronLeft size={16} className="text-primary-600" />
                </button>
                <button
                  onClick={() => scrollToCategoryPage(currentCategoryPage + 1)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-20 rounded-lg p-1.5 shadow-lg border transition-all duration-200 bg-white border-gray-200 hover:bg-gray-50 hover:shadow-xl cursor-pointer"
                  style={{ transform: 'translateY(-50%)' }}
                >
                  <ChevronRight size={16} className="text-primary-600" />
                </button>
              </>
            )}
            
            {/* Scrollable Categories */}
            <div 
              ref={categoriesScrollRef}
              className={`flex overflow-x-auto scrollbar-hide px-16 relative gap-4 md:gap-16 select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              style={{ scrollSnapType: 'x mandatory' }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseDown={handleMouseDown}
              onScroll={() => {
                // Trigger scroll handler immediately for better responsiveness
                const container = categoriesScrollRef.current;
                if (!container || categories.length <= 2) return;

                const scrollLeft = container.scrollLeft;
                const containerWidth = container.clientWidth;
                const itemWidth = containerWidth / categoriesPerPage;
                const currentPage = Math.round(scrollLeft / (itemWidth * categoriesPerPage));
                const clampedPage = Math.max(0, Math.min(currentPage, totalPages - 1));
                setCurrentCategoryPage(clampedPage);
              }}
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
                          draggable={false}
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
                          ? 'bg-primary-600 w-6' 
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
                <span className="absolute top-3 left-3 bg-primary-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow">New</span>
              )}
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}