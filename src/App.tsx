import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './lib/auth';
import Loader from './ui/components/Loader';

// Lazy-loaded components
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));

// Admin routes
const AdminLayout = lazy(() => import('./admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./admin/pages/DashboardPage'));
const AdminProducts = lazy(() => import('./admin/pages/ProductsPage'));
const AdminCategories = lazy(() => import('./admin/pages/CategoriesPage'));
const AdminOrders = lazy(() => import('./admin/pages/OrdersPage'));
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
const CustomerNotifications = lazy(() => import('./customer/pages/NotificationsPage'));
const CustomerOrderDetails = lazy(() => import('./customer/pages/OrderDetailsPage'));

// Driver routes
const DriverLayout = lazy(() => import('./driver/DriverLayout'));
const DriverDashboard = lazy(() => import('./driver/pages/DashboardPage'));
const DriverOrders = lazy(() => import('./driver/pages/OrdersPage'));
const DriverProfile = lazy(() => import('./driver/pages/ProfilePage'));

function App() {
  const { session, loading } = useSession();

  if (loading) {
    return <Loader fullScreen />;
  }

  // Determine user role for redirect
  let userRole: string | null = null;
  if (session && session.user && session.user.user_metadata && session.user.user_metadata.role) {
    userRole = session.user.user_metadata.role;
  }

  // Default redirect based on session and role
  let defaultRedirect = <Navigate to="/login" replace />;
  if (session) {
    // If userRole is available, redirect accordingly
    if (userRole === 'admin') {
      defaultRedirect = <Navigate to="/admin" replace />;
    } else if (userRole === 'driver') {
      defaultRedirect = <Navigate to="/driver" replace />;
    } else {
      defaultRedirect = <Navigate to="/customer" replace />;
    }
  }

  return (
    <Suspense fallback={<Loader fullScreen />}>
      <Routes>
        {/* Landing Page Route - only for logged out users */}
        <Route path="/" element={session ? defaultRedirect : <LandingPage />} />
        {/* Auth Routes - only for logged out users */}
        <Route path="/login" element={session ? defaultRedirect : <LoginPage />} />
        <Route path="/register" element={session ? defaultRedirect : <RegisterPage />} />

        {/* Admin Routes */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="drivers" element={<AdminDrivers />} />
        </Route>

        {/* Customer Routes */}
        <Route path="/customer" element={<CustomerLayout />}>
          <Route index element={<CustomerHome />} />
          <Route path="products" element={<CustomerProducts />} />
          <Route path="products/:id" element={<CustomerProductDetails />} />
          <Route path="cart" element={<CustomerCart />} />
          <Route path="checkout" element={<CustomerCheckout />} />
          <Route path="orders" element={<CustomerOrders />} />
          <Route path="orders/:id" element={<CustomerOrderDetails />} />
          <Route path="profile" element={<CustomerProfile />} />
          <Route path="notifications" element={<CustomerNotifications />} />
        </Route>

        {/* Driver Routes */}
        <Route path="/driver" element={<DriverLayout />}>
          <Route index element={<DriverDashboard />} />
          <Route path="orders" element={<DriverOrders />} />
          <Route path="profile" element={<DriverProfile />} />
        </Route>

        {/* Default redirect based on auth state */}
        <Route path="*" element={defaultRedirect} />
      </Routes>
    </Suspense>
  );
}

export default App;