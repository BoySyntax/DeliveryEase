import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';
import Loader from './ui/components/Loader';

// Lazy-loaded components
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const AuthCallback = lazy(() => import('./pages/auth/callback'));

// Admin routes
const AdminLayout = lazy(() => import('./admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./admin/pages/DashboardPage'));
const AdminProducts = lazy(() => import('./admin/pages/ProductsPage'));
const AdminCategories = lazy(() => import('./admin/pages/CategoriesPage'));
const AdminVerifyOrders = lazy(() => import('./admin/pages/VerifyOrdersPage'));
const AdminBatchOrders = lazy(() => import('./admin/pages/BatchOrdersPage'));
const AdminDrivers = lazy(() => import('./admin/pages/DriversPage'));


// Customer routes
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

// Driver routes
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

function App() {
  return (
    <Suspense fallback={<Loader fullScreen />}>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Navigate to="/login" replace />} />
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
          <Route path="drivers" element={<AdminDrivers />} />
        </Route>

        {/* Customer Routes */}
        <Route
          path="/customer"
          element={
            <ProtectedRoute>
              <CustomerLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<CustomerHome />} />
          <Route path="products" element={<CustomerProducts />} />
          <Route path="products/:id" element={<CustomerProductDetails />} />
          <Route path="cart" element={<CustomerCart />} />
          <Route path="checkout" element={<CustomerCheckout />} />
          <Route path="orders" element={<CustomerOrders />} />
          <Route path="orders/:id" element={<CustomerOrderDetails />} />
          <Route path="notifications" element={<CustomerNotifications />} />
          <Route path="profile" element={<CustomerProfile />} />
          <Route path="add-address" element={<CustomerAddAddress />} />
          <Route path="edit-address/:id" element={<CustomerEditAddress />} />
          
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