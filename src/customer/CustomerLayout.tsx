import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Home, Package, User, ShoppingCart, Search } from 'lucide-react';
import { useProfile } from '../lib/auth';
import Loader from '../ui/components/Loader';
import { cn } from '../lib/utils';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.png';
import Input from '../ui/components/Input';
import Select from '../ui/components/Select';
import { useSearchParams } from 'react-router-dom';
import NotificationBadge from '../ui/components/NotificationBadge';

type Category = {
  id: string;
  name: string;
  image_url?: string | null;
};

export default function CustomerLayout() {
  const { profile, loading } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const categoryId = searchParams.get('category') || '';

  // Pages where search bar should be hidden
  const hideSearchOnPages = [
    '/customer/cart',
    '/customer/checkout',
    '/customer/orders',
    '/customer/notifications',
    '/customer/profile',
    '/customer/add-address',
    '/customer/edit-address'
  ];

  // Pages where bottom navigation should be hidden
  const hideBottomNavOnPages = [
    '/customer/add-address',
    '/customer/edit-address'
  ];

  // Check if search bar should be hidden on current page
  const shouldHideSearch = hideSearchOnPages.some(page => location.pathname.startsWith(page));

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
        if (!user) return;
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
          const { data } = await supabase
            .from('categories')
            .select('*')
            .order('name');
          setCategories((data as Category[]) || []);
        } catch {
          setCategories([]);
        } finally {
          setLoadingCategories(false);
        }
      }
    }
    fetchCategories();
  }, [location.pathname]);

  const handleCategoryChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set('category', value);
    } else {
      params.delete('category');
    }
    setSearchParams(params);
  };

  if (loading) {
    return <Loader fullScreen />;
  }

  // If not a customer, redirect to appropriate dashboard
  if (profile && profile.role !== 'customer') {
    navigate(`/${profile.role}`);
    return null;
  }

  const navItems = [
    { icon: <Home size={20} />, label: 'Home', path: '/customer' },
    { icon: <ShoppingCart size={20} />, label: 'Cart', path: '/customer/cart' },
    { icon: <Package size={20} />, label: 'Orders', path: '/customer/orders' },
    { icon: <NotificationBadge size={20} />, label: 'Notifications', path: '/customer/notifications' },
    { icon: <User size={20} />, label: 'Profile', path: '/customer/profile' },
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/customer/products?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center" style={{ paddingTop: location.pathname.startsWith('/customer/products') ? 4 : undefined, paddingBottom: location.pathname.startsWith('/customer/products') ? 2 : undefined }}>
              <img src={logo} alt="DeliveryEase Logo" width={56} height={56} style={{objectFit: 'contain', marginRight: 8}} />
              <span className="text-lg font-semibold text-gray-900">DeliveryEase</span>
            </div>
            {/* Desktop Nav & Search (sm and up) */}
            <div className="hidden sm:flex sm:items-center sm:gap-6">
              {/* Show search bar on all pages except those in hideSearchOnPages */}
              {!shouldHideSearch && !loadingCategories && (
                <form onSubmit={handleSearch} className="flex items-center gap-2">
                  <Input
                    placeholder="Search for products..."
                    icon={<Search size={18} className="text-gray-400" />}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-96 rounded-full px-4 py-2 text-sm text-gray-900 border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 shadow-sm placeholder-gray-400 pr-10"
                  />
                  {/* Show category selector only on /customer/products */}
                  {location.pathname === '/customer/products' && (
                    <Select
                      options={[
                        { value: '', label: 'All Categories' },
                        ...categories.map(cat => ({ value: cat.id, label: cat.name }))
                      ]}
                      value={categoryId}
                      onChange={e => handleCategoryChange(e.target.value)}
                      className="w-[180px] h-10 px-3 py-2 text-sm rounded-md border-gray-300 focus:border-primary-500 focus:ring-primary-500 shadow-sm bg-white"
                    />
                  )}
                </form>
              )}
              {/* Desktop Nav Items */}
              <nav className="flex items-center gap-8 ml-6">
                {navItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/customer'}
                    className={({ isActive }) => cn(
                      'relative flex flex-col items-center text-gray-600 hover:text-primary-600 transition',
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
                    <span className="text-xs mt-1">{item.label}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
            {/* Mobile search bar (below logo/title) */}
            {!shouldHideSearch && (
              <div className="sm:hidden py-3">
                <form onSubmit={handleSearch} className="flex flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      className="w-full rounded-full px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-400 border border-gray-300"
                      placeholder="Search for products..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                    <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary-600">
                      <Search size={18} />
                    </button>
                  </div>
                  {/* Show category selector only on /customer/products */}
                  {location.pathname === '/customer/products' && !loadingCategories && (
                    <Select
                      options={[
                        { value: '', label: 'All Categories' },
                        ...categories.map(cat => ({ value: cat.id, label: cat.name }))
                      ]}
                      value={categoryId}
                      onChange={e => handleCategoryChange(e.target.value)}
                      className="w-[150px] h-10 px-3 py-2 text-sm rounded-md border-gray-300 focus:border-primary-500 focus:ring-primary-500 shadow-sm bg-white"
                    />
                  )}
                </form>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      {!shouldHideBottomNav && (
        <nav className="sm:hidden bg-white shadow-lg fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200">
          <div className="flex justify-between">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/customer'}
                className={({ isActive }) => cn(
                  'flex flex-1 flex-col items-center py-3',
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
      {!shouldHideBottomNav && <div className="sm:hidden h-16" />}
    </div>
  );
}