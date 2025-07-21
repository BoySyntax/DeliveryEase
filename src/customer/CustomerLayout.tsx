import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingBag, Home, Package, User, ShoppingCart, Bell, Truck, Search } from 'lucide-react';
import { useProfile } from '../lib/auth';
import Loader from '../ui/components/Loader';
import { cn } from '../lib/utils';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.png';

export default function CustomerLayout() {
  const { profile, loading } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');

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

  // Check if search bar should be hidden on current page
  const shouldHideSearch = hideSearchOnPages.some(page => location.pathname.startsWith(page));

  // Notification badge for orders
  const [orderNotifCount, setOrderNotifCount] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  useEffect(() => {
    async function fetchOrderNotif() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('orders')
        .select('id')
        .eq('customer_id', user.id)
        .eq('notification_dismissed', false)
        .eq('notification_read', false);
      if (!error && data) {
        setOrderNotifCount(data.length);
      }
    }
    async function fetchCartCount() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Get user's cart
      const { data: cart } = await supabase
        .from('carts')
        .select('id')
        .eq('customer_id', user.id)
        .single();
      if (!cart) {
        setCartCount(0);
        return;
      }
      // Get cart items count
      const { data: items, error } = await supabase
        .from('cart_items')
        .select('id')
        .eq('cart_id', cart.id);
      if (!error && items) {
        setCartCount(items.length);
      }
    }
    fetchOrderNotif();
    fetchCartCount();
    const interval = setInterval(() => {
      fetchOrderNotif();
      fetchCartCount();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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
    { icon: <Bell size={20} />, label: 'Notifications', path: '/customer/notifications' },
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
          <div className="flex justify-between h-20 items-center">
            <div className="flex items-center">
              <img src={logo} alt="DeliveryEase Logo" width={56} height={56} style={{objectFit: 'contain', marginRight: 8}} />
              <span className="text-lg font-semibold text-gray-900">DeliveryEase</span>
            </div>
            
            {/* Search Bar - Centered */}
            {!shouldHideSearch && (
              <form onSubmit={handleSearch} className="hidden md:block flex-1 max-w-lg mx-8">
                <div className="relative">
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
              </form>
            )}
            
            <div className="hidden sm:flex space-x-4">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/customer'}
                  className={({ isActive }) => cn(
                    'px-3 py-2 rounded-md text-sm font-medium',
                    isActive
                      ? 'text-primary-600 bg-primary-50'
                      : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
                  )}
                >
                  <span className="relative">
                    {item.icon}
                    {(item.label === 'Cart' && cartCount > 0) && (
                      <span className="absolute -top-2 -right-2 min-w-[1.1rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold shadow z-10">
                        {cartCount}
                      </span>
                    )}
                  </span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
          
          {/* Mobile Search Bar */}
          {!shouldHideSearch && (
            <div className="md:hidden py-3">
              <form onSubmit={handleSearch}>
                <div className="relative">
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
              </form>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="sm:hidden bg-white shadow-lg fixed bottom-0 left-0 right-0 z-10">
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
                {(item.label === 'Notifications' && orderNotifCount > 0) && (
                  <span className="absolute -top-1 -right-2 min-w-[1.1rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold shadow z-10">
                    {orderNotifCount}
                  </span>
                )}
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
      
      {/* Padding for mobile bottom nav */}
      <div className="sm:hidden h-16" />
    </div>
  );
}