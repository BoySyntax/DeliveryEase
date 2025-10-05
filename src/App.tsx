import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';
import Loader from './ui/components/Loader';

// Lazy-loaded components with loading fallbacks
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const AuthCallback = lazy(() => import('./pages/auth/callback'));

// Admin routes - grouped for better chunking
const AdminLayout = lazy(() => import('./admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./admin/pages/DashboardPage'));
const AdminProducts = lazy(() => import('./admin/pages/ProductsPage'));
const AdminCategories = lazy(() => import('./admin/pages/CategoriesPage'));
const AdminVerifyOrders = lazy(() => import('./admin/pages/VerifyOrdersPage'));
const AdminBatchOrders = lazy(() => import('./admin/pages/BatchOrdersPage'));
const AdminOrderList = lazy(() => import('./admin/pages/OrderListPage'));
const AdminDrivers = lazy(() => import('./admin/pages/DriversPage'));
const AdminDriverDetail = lazy(() => import('./admin/pages/DriverDetailPage'));
const AdminEmergencyRequests = lazy(() => import('./admin/pages/EmergencyRequestsPage'));

// Customer routes - grouped for better chunking
const CustomerLayout = lazy(() => import('./customer/CustomerLayout'));
const CustomerHome = lazy(() => import('./customer/pages/HomePage'));
const CustomerProducts = lazy(() => import('./customer/pages/ProductsPage'));
const CustomerProductDetails = lazy(() => import('./customer/pages/ProductDetailsPage'));
const CustomerCart = lazy(() => import('./customer/pages/CartPage'));
const CustomerCheckout = lazy(() => import('./customer/pages/CheckoutPage'));
const CustomerOrders = lazy(() => import('./customer/pages/OrdersPage'));
const CustomerProfile = lazy(() => import('./customer/pages/ProfilePage'));
const CustomerOrderDetails = lazy(() => import('./customer/pages/OrderDetailsPage'));
const CustomerAddAddress = lazy(() => import('./customer/pages/AddAddressPage'));
const CustomerEditAddress = lazy(() => import('./customer/pages/EditAddressPage'));
const CustomerNotifications = lazy(() => import('./customer/pages/NotificationsPage'));

// Driver routes - grouped for better chunking
const DriverLayout = lazy(() => import('./driver/DriverLayout'));
const DriverDashboard = lazy(() => import('./driver/pages/DashboardPage'));
const DriverProfile = lazy(() => import('./driver/pages/ProfilePage'));
const DriverRoute = lazy(() => import('./driver/pages/RoutePage'));
const DriverOrderDetails = lazy(() => import('./driver/pages/OrderDetailsPage'));

// Protected Route Component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <Loader fullScreen />;
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// Public Customer Route Component - allows unauthenticated access
function PublicCustomerRoute({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(() => {
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // No need to do anything with session for public routes
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <Loader fullScreen />;
  }

  // Allow access regardless of authentication status
  return <>{children}</>;
}

function App() {
  return (
    <Suspense fallback={<Loader fullScreen />}>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Navigate to="/customer" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Protected Routes */}
        {/* Admin Routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="verify-orders" element={<AdminVerifyOrders />} />
          <Route path="batch-orders" element={<AdminBatchOrders />} />
          <Route path="order-list" element={<AdminOrderList />} />
          <Route path="drivers" element={<AdminDrivers />} />
          <Route path="drivers/:driverId" element={<AdminDriverDetail />} />
          <Route path="emergency-requests" element={<AdminEmergencyRequests />} />
        </Route>

        {/* Customer Routes */}
        <Route
          path="/customer"
          element={
            <PublicCustomerRoute>
              <CustomerLayout />
            </PublicCustomerRoute>
          }
        >
          <Route index element={<CustomerHome />} />
          <Route path="products" element={<CustomerProducts />} />
          <Route path="products/:id" element={<CustomerProductDetails />} />
          <Route path="cart" element={
            <ProtectedRoute>
              <CustomerCart />
            </ProtectedRoute>
          } />
          <Route path="checkout" element={
            <ProtectedRoute>
              <CustomerCheckout />
            </ProtectedRoute>
          } />
          <Route path="orders" element={
            <ProtectedRoute>
              <CustomerOrders />
            </ProtectedRoute>
          } />
          <Route path="orders/:id" element={
            <ProtectedRoute>
              <CustomerOrderDetails />
            </ProtectedRoute>
          } />
          <Route path="notifications" element={
            <ProtectedRoute>
              <CustomerNotifications />
            </ProtectedRoute>
          } />
          <Route path="profile" element={
            <ProtectedRoute>
              <CustomerProfile />
            </ProtectedRoute>
          } />
          <Route path="add-address" element={
            <ProtectedRoute>
              <CustomerAddAddress />
            </ProtectedRoute>
          } />
          <Route path="edit-address/:id" element={
            <ProtectedRoute>
              <CustomerEditAddress />
            </ProtectedRoute>
          } />
          
        </Route>

        {/* Driver Routes */}
        <Route
          path="/driver"
          element={
            <ProtectedRoute>
              <DriverLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DriverDashboard />} />
          <Route path="route" element={<DriverRoute />} />
          <Route path="profile" element={<DriverProfile />} />
          <Route path="order/:orderId" element={<DriverOrderDetails />} />
        </Route>

        {/* Catch all route - redirect to login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
    </Suspense>
  );
}

export default App;