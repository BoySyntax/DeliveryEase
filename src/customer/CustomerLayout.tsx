import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { ShoppingBag, Home, Package, User, ShoppingCart, Bell } from 'lucide-react';
import { useProfile } from '../lib/auth';
import Loader from '../ui/components/Loader';
import { cn } from '../lib/utils';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function CustomerLayout() {
  const { profile, loading } = useProfile();
  const navigate = useNavigate();

  // Notification badge for orders
  const [orderNotifCount, setOrderNotifCount] = useState(0);
  useEffect(() => {
    async function fetchOrderNotif() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_status_code')
        .eq('customer_id', user.id)
        .eq('notification_dismissed', false)
        .in('order_status_code', ['pending', 'verified', 'out_for_delivery']);
      if (!error && data) {
        setOrderNotifCount(data.length);
      }
    }
    fetchOrderNotif();
    const interval = setInterval(fetchOrderNotif, 5000);
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

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <ShoppingBag className="h-8 w-8 text-primary-500" />
              <span className="ml-2 text-xl font-semibold text-gray-900">DeliveryEase</span>
            </div>
            
            <div className="hidden sm:flex space-x-4">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => cn(
                    'px-3 py-2 rounded-md text-sm font-medium',
                    isActive
                      ? 'text-primary-600 bg-primary-50'
                      : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
                  )}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
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
      <nav className="sm:hidden bg-white shadow-lg fixed bottom-0 left-0 right-0 z-10">
        <div className="flex justify-between">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
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