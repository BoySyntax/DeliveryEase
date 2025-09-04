import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Package, Tags, Users, ShoppingBag, LogOut, Truck, Menu, X } from 'lucide-react';
import { useProfile } from '../lib/auth';
import { supabase } from '../lib/supabase';
import Loader from '../ui/components/Loader';
import { cn } from '../lib/utils';
import Button from '../ui/components/Button';
import logo from '../assets/go1.png';

export default function AdminLayout() {
  const { profile, loading } = useProfile();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  if (loading) {
    return <Loader fullScreen />;
  }

  // If not an admin, redirect to appropriate dashboard
  if (profile && profile.role !== 'admin') {
    navigate(`/${profile.role}`);
    return null;
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const closeDropdown = () => {
    setIsDropdownOpen(false);
  };

  const navItems = [
    { icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/admin' },
    { icon: <ShoppingBag size={20} />, label: 'Products', path: '/admin/products' },
    { icon: <Tags size={20} />, label: 'Categories', path: '/admin/categories' },
    { icon: <Package size={20} />, label: 'Verify Orders', path: '/admin/verify-orders' },
    { icon: <Truck size={20} />, label: 'Order Batches', path: '/admin/batch-orders' },
    { icon: <Users size={20} />, label: 'Drivers', path: '/admin/drivers' },
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64 bg-white shadow-lg">
          <div className="flex items-center h-16 px-4 bg-primary-500 text-white font-semibold">
            <img src={logo} alt="Logo" width={40} height={40} style={{objectFit: 'contain', marginRight: 8}} />
            <span className="text-lg">Admin</span>
          </div>
          
          <div className="flex flex-col flex-1 overflow-y-auto">
            <nav className="flex-1 px-2 py-4 space-y-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/admin'}
                  className={({ isActive }) => cn(
                    'flex items-center px-4 py-2 text-sm font-medium rounded-md',
                    isActive
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-primary-600'
                  )}
                >
                  {item.icon}
                  <span className="ml-3">{item.label}</span>
                </NavLink>
              ))}
            </nav>
            
            <div className="p-4 border-t">
              <Button
                variant="outline"
                fullWidth
                icon={<LogOut size={18} />}
                onClick={handleSignOut}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile header */}
      <div className="md:hidden bg-white shadow-sm fixed top-0 left-0 right-0 z-10">
        <div className="flex items-center justify-between h-16 px-4">
          <div className="flex items-center">
            <img src={logo} alt="Logo" width={40} height={40} style={{objectFit: 'contain', marginRight: 8}} />
          </div>

          <div className="relative">
            <button
              onClick={toggleDropdown}
              className="p-2 text-gray-600 hover:text-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-md"
              aria-label="Open menu"
            >
              {isDropdownOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <>
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 bg-black bg-opacity-25 z-10"
                  onClick={closeDropdown}
                />
                
                {/* Menu */}
                <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                  <div className="py-2">
                    {navItems.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        end={item.path === '/admin'}
                        onClick={closeDropdown}
                        className={({ isActive }) => cn(
                          'flex items-center px-4 py-3 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary-50 text-primary-600 border-r-4 border-primary-600'
                            : 'text-gray-700 hover:bg-gray-50 hover:text-primary-600'
                        )}
                      >
                        <span className="mr-3">{item.icon}</span>
                        {item.label}
                      </NavLink>
                    ))}
                    
                    <div className="border-t border-gray-100 mt-2 pt-2">
                      <button
                        onClick={() => {
                          handleSignOut();
                          closeDropdown();
                        }}
                        className="flex items-center w-full px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-red-600 transition-colors"
                      >
                        <LogOut size={20} className="mr-3" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-y-auto">
        <main className="flex-1 p-4 md:p-6">
          <div className="mt-16 md:mt-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}