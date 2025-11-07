import { useState, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Package, Tags, Users, ShoppingBag, LogOut, Truck, Menu, X, Calendar, AlertTriangle } from 'lucide-react';
import { useProfile } from '../lib/auth';
import { supabase } from '../lib/supabase';
import Loader from '../ui/components/Loader';
import { cn } from '../lib/utils';
import Button from '../ui/components/Button';
import NotificationIcon from '../ui/components/NotificationIcon';
import EmergencyModal from './components/EmergencyModal';
import logo from '../assets/go1.png';

interface EmergencyRequest {
  id: string;
  driver_name: string;
  driver_id?: string;
  driver_avatar_url?: string;
  driver_phone?: string;
  address: string;
  latitude: number;
  longitude: number;
  requested_at: string;
  message?: string;
}

export default function AdminLayout() {
  const { profile, loading } = useProfile();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [currentEmergency, setCurrentEmergency] = useState<EmergencyRequest | null>(null);
  const [emergencyCount, setEmergencyCount] = useState(0);
  const [modalReopenTimer, setModalReopenTimer] = useState<NodeJS.Timeout | null>(null);

  const loadEmergencyCount = useCallback(async () => {
    try {
      console.log('🔍 Loading emergency count...');
      
      // Check for emergency notifications - look for unread rescue requests
      const { data, count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('type', 'info')
        .ilike('title', '%rescue%')
        .or('read.is.null,read.eq.false')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error loading emergency count:', error);
        return;
      }

      console.log('📊 Emergency notifications found:', count);
      console.log('📋 Emergency notification data:', data);
      const newCount = count || 0;
      console.log('🔄 Setting emergency count to:', newCount);
      setEmergencyCount(newCount);
    } catch (error) {
      console.error('❌ Error loading emergency count:', error);
    }
  }, []);

  const handleEmergencyNotification = useCallback(async (notification: any) => {
    try {
      console.log('🚨 Processing emergency notification:', notification);
      const data = notification.data as any;
      const emergencyRequest: EmergencyRequest = {
        id: notification.id,
        driver_name: data?.driver_name || 'Unknown Driver',
        driver_id: data?.driver_id,
        driver_avatar_url: data?.driver_avatar_url,
        address: data?.address || 'Unknown Location',
        latitude: data?.latitude || 0,
        longitude: data?.longitude || 0,
        requested_at: notification.created_at,
        message: notification.message
      };

      console.log('🚨 Emergency request object:', emergencyRequest);
      setCurrentEmergency(emergencyRequest);
      setEmergencyModalOpen(true);
      // Don't manually increment count - let loadEmergencyCount handle it
      console.log('🚨 Emergency modal should be opening now...');
    } catch (error) {
      console.error('Error handling emergency notification:', error);
    }
  }, []);

  const handleAcknowledgeEmergency = async (requestId: string) => {
    try {
      // Mark notification as read
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', requestId);
      
      // Clear the reopen timer since we're handling the emergency
      if (modalReopenTimer) {
        clearTimeout(modalReopenTimer);
        setModalReopenTimer(null);
      }
      
      // Refresh the count from database
      loadEmergencyCount();
    } catch (error) {
      console.error('Error acknowledging emergency:', error);
    }
  };

  const handleResolveEmergency = async (requestId: string) => {
    try {
      // Mark notification as read
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', requestId);
      
      // Clear the reopen timer since we're handling the emergency
      if (modalReopenTimer) {
        clearTimeout(modalReopenTimer);
        setModalReopenTimer(null);
      }
      
      // Refresh the count from database
      loadEmergencyCount();
    } catch (error) {
      console.error('Error resolving emergency:', error);
    }
  };

  const loadLatestEmergencyRequest = useCallback(async () => {
    try {
      const { data: latestNotification, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('type', 'info')
        .ilike('title', '%rescue%')
        .or('read.is.null,read.eq.false')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !latestNotification) {
        console.log('No emergency requests found for modal reopen');
        return;
      }

      const data = latestNotification.data as any;
      
      // Fetch phone number from profiles table if not in notification data
      let driverPhone = data?.driver_phone;
      
      if (!driverPhone && data?.driver_id) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('phone')
            .eq('id', data.driver_id)
            .single();
          
          if ((profile as any)?.phone) {
            driverPhone = (profile as any).phone;
          }
        } catch (phoneError) {
          console.log('Could not fetch phone number:', phoneError);
        }
      }
      
      const emergencyRequest: EmergencyRequest = {
        id: latestNotification.id,
        driver_name: data?.driver_name || 'Unknown Driver',
        driver_id: data?.driver_id,
        driver_avatar_url: data?.driver_avatar_url,
        driver_phone: driverPhone,
        address: data?.address || 'Unknown Location',
        latitude: data?.latitude || 0,
        longitude: data?.longitude || 0,
        requested_at: latestNotification.created_at,
        message: latestNotification.message
      };

      setCurrentEmergency(emergencyRequest);
    } catch (error) {
      console.error('Error loading latest emergency request:', error);
    }
  }, []);

  const closeEmergencyModal = () => {
    setEmergencyModalOpen(false);
    setCurrentEmergency(null);
    // Refresh count when modal is closed
    loadEmergencyCount();
    
    // Set up timer to reopen modal in 5 seconds if there are still emergency requests
    if (modalReopenTimer) {
      clearTimeout(modalReopenTimer);
    }
    
    const timer = setTimeout(() => {
      if (emergencyCount > 0) {
        console.log('🔄 Reopening emergency modal after 5 seconds...');
        setEmergencyModalOpen(true);
        // Get the latest emergency request
        loadLatestEmergencyRequest();
      }
    }, 5000);
    
    setModalReopenTimer(timer);
  };

  useEffect(() => {
    if (profile?.role === 'admin') {
      console.log('🔧 Admin detected, setting up emergency notifications...');
      loadEmergencyCount();

      // Poll for new emergency notifications every 5 seconds
      const pollInterval = setInterval(async () => {
        try {
          console.log('🔄 Polling for emergency notifications...');
          
          // First refresh the count
          await loadEmergencyCount();
          
          // Then check for new notifications to show modal
          const { data: newNotifications, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('type', 'info')
            .ilike('title', '%rescue%')
            .or('read.is.null,read.eq.false')
            .order('created_at', { ascending: false })
            .limit(1);

          if (error) {
            console.error('❌ Error polling for emergency notifications:', error);
            return;
          }

          if (newNotifications && newNotifications.length > 0) {
            const latestNotification = newNotifications[0];
            console.log('🔄 Polling found new emergency notification:', latestNotification);
            handleEmergencyNotification(latestNotification);
          }
        } catch (error) {
          console.error('❌ Error in emergency notification polling:', error);
        }
      }, 3000); // Poll every 3 seconds

      return () => {
        console.log('🔌 Cleaning up polling...');
        clearInterval(pollInterval);
        // Clear the modal reopen timer
        if (modalReopenTimer) {
          clearTimeout(modalReopenTimer);
        }
      };
    }
  }, [profile?.role, loadEmergencyCount, handleEmergencyNotification]);

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

  if (loading) {
    return <Loader fullScreen />;
  }

  // If not an admin, redirect to appropriate dashboard
  if (profile && profile.role !== 'admin') {
    navigate(`/${profile.role}`);
    return null;
  }

  const navItems = [
    { icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/admin' },
    { icon: <ShoppingBag size={20} />, label: 'Products', path: '/admin/products' },
    { icon: <Tags size={20} />, label: 'Categories', path: '/admin/categories' },
    { icon: <Package size={20} />, label: 'Verify Orders', path: '/admin/verify-orders' },
    { icon: <Truck size={20} />, label: 'Order Batches', path: '/admin/batch-orders' },
    { icon: <Calendar size={20} />, label: 'Order List', path: '/admin/order-list' },
    { icon: <Users size={20} />, label: 'Drivers', path: '/admin/drivers' },
    { icon: <AlertTriangle size={20} />, label: 'Emergency Requests', path: '/admin/emergency-requests' },
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64 bg-white shadow-lg">
          <div className="flex items-center justify-center h-24 px-4 bg-white border-b border-gray-200 font-semibold">
            <img src={logo} alt="fordaGO Logo" className="w-20 h-20 object-contain" />
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
            <img src={logo} alt="fordaGO Logo" className="w-16 h-16 object-contain" />
          </div>

          <div className="flex items-center space-x-2">
            {/* Notification Icon for Mobile */}
            <NotificationIcon />
            
            {/* Emergency Icon for Mobile - Always visible, blinks when there are emergencies */}
            <button
              onClick={() => emergencyCount > 0 && setEmergencyModalOpen(true)}
              className="relative p-2 transition-colors"
              title={emergencyCount > 0 ? `${emergencyCount} emergency request${emergencyCount > 1 ? 's' : ''}` : 'No emergency requests'}
            >
              <AlertTriangle 
                className={`h-6 w-6 ${
                  emergencyCount > 0 
                    ? 'text-red-600' 
                    : 'text-gray-400'
                }`} 
                style={{
                  animation: emergencyCount > 0 ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none'
                }}
              />
              {emergencyCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center animate-bounce">
                  {emergencyCount}
                </span>
              )}
            </button>

            
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
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-y-auto">
        {/* Top Bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center">
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Notification Icon */}
            <NotificationIcon />
            
            {/* Emergency Icon - Always visible, blinks when there are emergencies */}
            <button
              onClick={() => emergencyCount > 0 && setEmergencyModalOpen(true)}
              className="relative p-2 transition-colors"
              title={emergencyCount > 0 ? `${emergencyCount} emergency request${emergencyCount > 1 ? 's' : ''}` : 'No emergency requests'}
            >
              <AlertTriangle 
                className={`h-6 w-6 ${
                  emergencyCount > 0 
                    ? 'text-red-600' 
                    : 'text-gray-400'
                }`} 
                style={{
                  animation: emergencyCount > 0 ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none'
                }}
              />
              {emergencyCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center animate-bounce">
                  {emergencyCount}
                </span>
              )}
            </button>



            
            {/* User Profile */}
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-primary-600">
                  {profile?.name?.charAt(0)?.toUpperCase() || 'A'}
                </span>
              </div>
              <span className="text-sm font-medium text-gray-700 hidden sm:block">
                {profile?.name || 'Admin'}
              </span>
            </div>
          </div>
        </div>
        
        <main className="flex-1 p-4 md:p-6 pt-20 md:pt-4">
          <Outlet />
        </main>
      </div>

      {/* Emergency Modal */}
      <EmergencyModal
        isOpen={emergencyModalOpen}
        onClose={closeEmergencyModal}
        request={currentEmergency}
        onAcknowledge={handleAcknowledgeEmergency}
        onResolve={handleResolveEmergency}
      />
    </div>
  );
}