import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Home, Package, User, ShoppingCart, Search } from 'lucide-react';
import { useProfile } from '../lib/auth';
import Loader from '../ui/components/Loader';
import { cn } from '../lib/utils';
import { useEffect, useState, memo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import logo from '../assets/go1.png';
import Input from '../ui/components/Input';
import CustomSelect from '../ui/components/CustomSelect';
import { useSearchParams } from 'react-router-dom';
import NotificationBadge from '../ui/components/NotificationBadge';

type Category = {
  id: string;
  name: string;
  image_url?: string | null;
};

const CustomerLayout = memo(function CustomerLayout() {
  const { profile, loading } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const categoryId = searchParams.get('category') || '';

  // Pages where bottom navigation should be hidden
  const hideBottomNavOnPages = [
    '/customer/add-address',
    '/customer/edit-address'
  ];

  // Check if bottom navigation should be hidden on current page
  const shouldHideBottomNav = hideBottomNavOnPages.some(page => location.pathname.startsWith(page));

  const [cartCount, setCartCount] = useState(0);
  const [cartId, setCartId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  async function refreshCartCount(currentCartId: string) {
    try {
      const { data: items, error: itemsError } = await supabase
        .from('cart_items')
        .select('product_id')
        .eq('cart_id', currentCartId);
      if (itemsError) {
        console.warn('Cart items fetch error:', itemsError);
        setCartCount(0);
        return;
      }
      const uniqueProducts = new Set((items || []).map((it: any) => it.product_id));
      setCartCount(uniqueProducts.size);
    } catch (error) {
      console.warn('Error fetching cart count:', error);
      setCartCount(0);
    }
  }

  useEffect(() => {
    let isMounted = true;
    async function initCart() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          // User not authenticated, reset cart state
          if (isMounted) {
            setUserId(null);
            setCartId(null);
            setCartCount(0);
          }
          return;
        }
        if (isMounted) setUserId(user.id);
        const { data: carts } = await supabase
          .from('carts')
          .select('id')
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);
        if (carts && carts.length > 0) {
          if (isMounted) setCartId(carts[0].id);
          await refreshCartCount(carts[0].id);
        } else {
          if (isMounted) setCartId(null);
          setCartCount(0);
        }
      } catch (error) {
        console.warn('Error initializing cart', error);
        setCartCount(0);
      }
    }
    initCart();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (!cartId) return;
    const channel = supabase
      .channel(`cart-items-${cartId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cart_items',
        filter: `cart_id=eq.${cartId}`
      }, () => {
        refreshCartCount(cartId);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [cartId]);

  // Optimistic local updates from add/remove actions
  useEffect(() => {
    const handleAdded = () => setCartCount((c) => c + 1);
    const handleRemoved = () => setCartCount((c) => Math.max(0, c - 1));
    const handleCleared = () => setCartCount(0);
    window.addEventListener('cart:product-added', handleAdded as EventListener);
    window.addEventListener('cart:product-removed', handleRemoved as EventListener);
    window.addEventListener('cart:clear', handleCleared as EventListener);
    return () => {
      window.removeEventListener('cart:product-added', handleAdded as EventListener);
      window.removeEventListener('cart:product-removed', handleRemoved as EventListener);
      window.removeEventListener('cart:clear', handleCleared as EventListener);
    };
  }, []);

  // Subscribe to carts creation for this user, so badge appears right after first add-to-cart
  useEffect(() => {
    if (!userId) return;
    const cartsChannel = supabase
      .channel(`carts-for-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'carts',
        filter: `customer_id=eq.${userId}`
      }, (payload) => {
        const newCartId = (payload as any).new?.id as string | undefined;
        if (newCartId) {
          setCartId(newCartId);
          refreshCartCount(newCartId);
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(cartsChannel);
    };
  }, [userId]);

  // Fetch categories only for /customer/products
  useEffect(() => {
    async function fetchCategories() {
      if (location.pathname.startsWith('/customer/products')) {
        setLoadingCategories(true);
        try {
          const { data, error } = await supabase
            .from('categories')
            .select('*')
            .order('name');
          
          if (error) {
            console.error('Error fetching categories:', error);
            setCategories([]);
          } else {
            console.log('Categories loaded:', data?.length || 0, 'categories');
            setCategories((data as Category[]) || []);
          }
        } catch (error) {
          console.error('Exception fetching categories:', error);
          setCategories([]);
        } finally {
          setLoadingCategories(false);
        }
      } else {
        // Clear categories when not on products page
        setCategories([]);
        setLoadingCategories(false);
      }
    }
    fetchCategories();
  }, [location.pathname]);

  const handleCategoryChange = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set('category', value);
    } else {
      params.delete('category');
    }
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  // Close search panel when navigating away from products page
  useEffect(() => {
    if (!location.pathname.startsWith('/customer/products')) {
      setIsSearchOpen(false);
    }
  }, [location.pathname]);

  const navItems = [
    { icon: <Home size={20} />, label: 'Home', path: '/customer' },
    { icon: <ShoppingCart size={20} />, label: 'Cart', path: '/customer/cart', requiresAuth: true },
    { icon: <Package size={20} />, label: 'Orders', path: '/customer/orders', requiresAuth: true },
    { icon: <NotificationBadge size={20} />, label: 'Notifications', path: '/customer/notifications', requiresAuth: true },
    { icon: <User size={20} />, label: 'Profile', path: '/customer/profile', requiresAuth: true },
  ];

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/customer/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setIsSearchOpen(false); // Close search panel after search
    }
  }, [searchQuery, navigate]);

  // Sync search query with URL parameters
  useEffect(() => {
    const urlSearchQuery = searchParams.get('search') || '';
    setSearchQuery(urlSearchQuery);
  }, [searchParams]);

  // Handle search input changes - update URL on every keystroke for real-time search
  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    const params = new URLSearchParams(searchParams);
    if (value.trim()) {
      params.set('search', value.trim());
    } else {
      params.delete('search');
    }
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  if (loading) {
    return <Loader fullScreen />;
  }

  // If user is authenticated but not a customer, redirect to appropriate dashboard
  if (profile && profile.role !== 'customer') {
    navigate(`/${profile.role}`);
    return null;
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-[100] sm:z-[100] relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-18">
            {/* Logo */}
            <div className="flex items-center flex-shrink-0">
              <img src={logo} alt="Logo" className="w-14 h-14 sm:w-16 sm:h-16 object-contain brightness-110 contrast-125 saturate-110" />
            </div>
            
            {/* Spacer */}
            <div className="flex-1"></div>

            {/* Right Side - Search Icon + Desktop Navigation */}
            <div className="flex items-center space-x-4">
              {/* Homepage Search - Mobile Icon */}
              {location.pathname === '/customer' && (
                <button
                  onClick={() => setIsSearchOpen(!isSearchOpen)}
                  className="sm:hidden p-2 rounded-full hover:bg-gray-100 transition-colors"
                  aria-label="Search products"
                >
                  <Search size={20} className="text-gray-600" />
                </button>
              )}

              {/* Homepage Search Bar - Desktop only */}
              {location.pathname === '/customer' && (
                <div className="hidden sm:flex items-center">
                  <form onSubmit={handleSearch} className="flex items-center">
                                          <Input
                        placeholder="Search for products..."
                        icon={<Search size={20} className="text-gray-400" />}
                        value={searchQuery}
                        onChange={handleSearchInputChange}
                        className="w-80 lg:w-96 xl:w-[28rem] rounded-full px-4 py-2 text-sm text-gray-900 border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 shadow-sm placeholder-gray-400"
                      />
                  </form>
                </div>
              )}

              {/* Products Page - Mobile Search Icon */}
              {location.pathname.startsWith('/customer/products') && (
                <button
                  onClick={() => setIsSearchOpen(!isSearchOpen)}
                  className="sm:hidden p-2 rounded-full hover:bg-gray-100 transition-colors"
                  aria-label="Search products"
                >
                  <Search size={20} className="text-gray-600" />
                </button>
              )}

              {/* Products Page - Desktop Search Bar */}
              {location.pathname.startsWith('/customer/products') && (
                <div className="hidden sm:flex items-center gap-3 flex-1 max-w-6xl">
                  <form onSubmit={handleSearch} className="flex items-center gap-3 w-full">
                    <div className="flex-[4] min-w-0">
                      <Input
                        placeholder="Search for products..."
                        icon={<Search size={20} className="text-gray-400" />}
                        value={searchQuery}
                        onChange={handleSearchInputChange}
                        className="w-full rounded-full px-4 py-2.5 text-sm text-gray-900 border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 shadow-sm placeholder-gray-400"
                      />
                    </div>
                    
                    {/* Categories Dropdown */}
                    <div className="flex-shrink-0 relative min-w-[200px]">
                      {loadingCategories ? (
                        <div className="w-full h-10 px-3 py-2 text-sm rounded-md border border-gray-300 bg-gray-100 flex items-center justify-center">
                          <span className="text-gray-500">Loading...</span>
                        </div>
                      ) : categories.length > 0 ? (
                        <CustomSelect
                          options={[
                            { value: '', label: 'All Categories' },
                            ...categories.map(cat => ({ value: cat.id, label: cat.name }))
                          ]}
                          value={categoryId}
                          onChange={handleCategoryChange}
                          placeholder="All Categories"
                          className="w-full h-10 px-3 py-2 text-sm rounded-md border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 shadow-sm bg-white"
                        />
                      ) : (
                        <div className="w-full h-10 px-3 py-2 text-sm rounded-md border border-gray-300 bg-gray-100 flex items-center justify-center">
                          <span className="text-gray-500 text-xs">No categories</span>
                        </div>
                      )}
                    </div>
                  </form>
                </div>
              )}

                          {/* Desktop Navigation */}
            <nav className="hidden sm:flex items-center space-x-4">
                {navItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/customer'}
                    onClick={(e) => {
                      if (item.requiresAuth && !profile) {
                        e.preventDefault();
                        navigate('/login');
                      }
                    }}
                    className={({ isActive }) => cn(
                      'relative flex flex-col items-center px-1.5 py-1 text-gray-600 hover:text-primary-600 transition-colors',
                      isActive ? 'text-primary-600 font-semibold' : ''
                    )}
                    style={{ textDecoration: 'none' }}
                  >
                    <span className="relative">
                      {item.icon}
                      {(item.label === 'Cart' && cartCount > 0) && (
                        <span className="absolute -top-1 -right-2 min-w-[1.1rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold shadow z-10">
                          {cartCount}
                        </span>
                      )}
                    </span>
                    <span className="text-xs mt-1 whitespace-nowrap">{item.label}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </header>

      {/* Animated Search Panel - Mobile Only */}
      {(location.pathname === '/customer' || location.pathname.startsWith('/customer/products')) && (
        <div className={cn(
          'sm:hidden bg-white shadow-lg transition-all duration-300 ease-in-out border-b sticky top-12 z-40',
          isSearchOpen ? 'max-h-64 opacity-100 overflow-visible' : 'max-h-0 opacity-0 overflow-hidden'
        )}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <form onSubmit={handleSearch} className="space-y-4">
              {/* Search Bar Row */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Input
                    placeholder="Search for products..."
                    icon={<Search size={20} className="text-gray-400" />}
                    value={searchQuery}
                    onChange={handleSearchInputChange}
                    className="w-full rounded-md px-4 py-2.5 text-sm text-gray-900 border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 shadow-sm placeholder-gray-400"
                    autoFocus={isSearchOpen}
                  />
                </div>
              </div>

              {/* Categories Row - Only on products page */}
              {location.pathname.startsWith('/customer/products') && (
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    {loadingCategories ? (
                      <div className="w-full rounded-md px-4 py-2.5 text-sm text-gray-900 border border-gray-300 bg-gray-100 flex items-center justify-center shadow-sm">
                        <span className="text-gray-500">Loading categories...</span>
                      </div>
                    ) : categories.length > 0 ? (
                      <div className="relative">
                        <CustomSelect
                          options={[
                            { value: '', label: 'All Categories' },
                            ...categories.map(cat => ({ value: cat.id, label: cat.name }))
                          ]}
                          value={categoryId}
                          onChange={handleCategoryChange}
                          placeholder="All Categories"
                          className="w-full rounded-md px-4 py-2.5 text-sm text-gray-900 border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 shadow-sm bg-white"
                        />
                      </div>
                    ) : (
                      <div className="w-full rounded-md px-4 py-2.5 text-sm text-gray-900 border border-gray-300 bg-gray-100 flex items-center justify-center shadow-sm">
                        <span className="text-gray-500 text-xs">No categories available</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 relative z-[1]">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      {!shouldHideBottomNav && (
        <nav className="sm:hidden bg-white shadow-lg fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 h-14">
          <div className="flex justify-between">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/customer'}
                onClick={(e) => {
                  if (item.requiresAuth && !profile) {
                    e.preventDefault();
                    navigate('/login');
                  }
                }}
                className={({ isActive }) => cn(
                  'flex flex-1 flex-col items-center py-2',
                  isActive
                    ? 'text-primary-600'
                    : 'text-gray-600'
                )}
              >
                <span className="relative">
                  {item.icon}
                  {(item.label === 'Cart' && cartCount > 0) && (
                    <span className="absolute -top-1 -right-2 min-w-[1.1rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold shadow z-10">
                      {cartCount}
                    </span>
                  )}
                </span>
                <span className="text-xs mt-1">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      )}
      
      {/* Padding for mobile bottom nav */}
      {!shouldHideBottomNav && <div className="sm:hidden h-14" />}
    </div>
  );
});

export default CustomerLayout;