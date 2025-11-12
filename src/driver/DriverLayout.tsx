import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  User, 
  Map, 
  LogOut 
} from 'lucide-react';
import { useProfile } from '../lib/auth';
import { supabase } from '../lib/supabase';
import Loader from '../ui/components/Loader';
import { cn } from '../lib/utils';
import logo from '../assets/go1.png';

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
    navigate('/');
  };

  const navItems = [
    { icon: <LayoutDashboard size={24} />, label: 'Dashboard', path: '/driver', end: true },
    { icon: <Map size={24} />, label: 'Routes', path: '/driver/route' },
    { icon: <User size={24} />, label: 'Profile', path: '/driver/profile' },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="flex justify-between h-14 sm:h-16 items-center">
            <div className="flex items-center">
              <img src={logo} alt="fordaGO Logo" className="w-14 h-14 sm:w-18 sm:h-18 object-contain" />
            </div>
            
            <div className="hidden md:flex space-x-2 lg:space-x-4">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) => cn(
                    'px-2 lg:px-3 py-2 rounded-md text-sm font-medium transition-colors',
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
                className="px-2 lg:px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:text-primary-600 hover:bg-gray-50 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-x-hidden">
        <div className="max-w-7xl mx-auto py-3 sm:py-4 md:py-6 px-3 sm:px-4 md:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden bg-white shadow-lg fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 safe-area-pb">
        <div className="flex justify-between px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) => cn(
                'flex flex-1 flex-col items-center py-2 px-1 min-w-0',
                isActive
                  ? 'text-primary-600'
                  : 'text-gray-600'
              )}
            >
              <div className="mb-1">
                {item.icon}
              </div>
              <span className="text-xs leading-tight text-center truncate w-full">{item.label}</span>
            </NavLink>
          ))}
          
          <button
            onClick={handleSignOut}
            className="flex flex-1 flex-col items-center py-2 px-1 text-gray-600 min-w-0"
          >
            <div className="mb-1">
              <LogOut size={24} />
            </div>
            <span className="text-xs leading-tight text-center truncate w-full">Sign Out</span>
          </button>
        </div>
      </nav>
      
      {/* Padding for mobile bottom nav */}
      <div className="md:hidden h-16" />
    </div>
  );
}