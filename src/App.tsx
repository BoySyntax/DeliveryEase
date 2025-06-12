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

  // Check if user is logged in and redirect accordingly
  const defaultRedirect = session ? (
    // Check user role in session to redirect to the right dashboard
    <Navigate to="/customer" replace />
  ) : (
    <Navigate to="/login" replace />
  );

  return (
    <Suspense fallback={<Loader fullScreen />}>
      <Routes>
        {/* Landing Page Route */}
        <Route path="/" element={<LandingPage />} />
        {/* Auth Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

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