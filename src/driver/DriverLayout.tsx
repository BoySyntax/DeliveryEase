import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  User, 
  ShoppingBag, 
  LogOut 
} from 'lucide-react';
import { useProfile } from '../lib/auth';
import { supabase } from '../lib/supabase';
import Loader from '../ui/components/Loader';
import { cn } from '../lib/utils';
import logo from '../assets/logo.png';

export default function DriverLayout() {
  const { profile, loading } = useProfile();
  const navigate = useNavigate();

  if (loading) {
    return <Loader fullScreen />;
  }

  // If not a driver, redirect to appropriate dashboard
  if (profile && profile.role !== 'driver') {
    navigate(`/${profile.role}`);
    return null;
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const navItems = [
    { icon: <LayoutDashboard size={24} />, label: 'Dashboard', path: '/driver' },
    { icon: <Package size={24} />, label: 'Orders', path: '/driver/orders' },
    { icon: <User size={24} />, label: 'Profile', path: '/driver/profile' },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <img src={require('../assets/logo.png')} alt="DeliveryEase Logo" width={32} height={32} style={{objectFit: 'contain', marginRight: 8}} />
              <span className="ml-2 text-xl font-semibold text-gray-900">DeliveryEase</span>
            </div>
            
            <div className="hidden md:flex space-x-4">
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
              
              <button
                onClick={handleSignOut}
                className="px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:text-primary-600 hover:bg-gray-50"
              >
                Sign Out
              </button>
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
      <nav className="md:hidden bg-white shadow-lg fixed bottom-0 left-0 right-0 z-10">
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
              {item.icon}
              <span className="text-xs mt-1">{item.label}</span>
            </NavLink>
          ))}
          
          <button
            onClick={handleSignOut}
            className="flex flex-1 flex-col items-center py-3 text-gray-600"
          >
            <LogOut size={24} />
            <span className="text-xs mt-1">Sign Out</span>
          </button>
        </div>
      </nav>
      
      {/* Padding for mobile bottom nav */}
      <div className="md:hidden h-16" />
    </div>
  );
}