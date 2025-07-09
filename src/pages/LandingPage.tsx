import { motion } from 'framer-motion';
import { Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.png';
import Loader from '../ui/components/Loader';

export default function LandingPage() {
  const navigate = useNavigate();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Get user's role from profiles table
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        // Redirect based on role
        if (profile?.role === 'admin') {
          navigate('/admin', { replace: true });
        } else if (profile?.role === 'driver') {
          navigate('/driver', { replace: true });
        } else {
          navigate('/customer', { replace: true });
        }
      } else {
        setCheckingAuth(false);
      }
    };

    checkAuthAndRedirect();
  }, [navigate]);

  if (checkingAuth) {
    return <Loader fullScreen />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex flex-col items-center justify-center p-4">
      <div className="flex justify-center mt-8 mb-4">
        {/* Logo removed as requested. You can add a text heading or previous icon here if needed. */}
      </div>

      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-8"
      >
        <h1 className="text-4xl md:text-6xl font-bold text-black mb-4">
          DeliveryEase
        </h1>
        <p className="text-lg md:text-xl text-gray-600">
          Fast, reliable delivery at your fingertips
        </p>
      </motion.div>

      <motion.div
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          // First animate the truck
          const truck = document.getElementById('delivery-truck');
          if (truck) {
            truck.style.transform = 'translateX(100vw)';
            truck.style.transition = 'transform 1s ease-in-out';
          }
          // Then navigate after animation
          setTimeout(() => navigate('/login'), 800);
        }}
        className="cursor-pointer bg-white p-4 rounded-full shadow-lg hover:shadow-xl transition-shadow"
      >
        <motion.div
          id="delivery-truck"
          animate={{ x: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 1 }}
          className="text-primary-500"
        >
          <img src={logo} alt="DeliveryEase Logo" width={96} height={96} style={{objectFit: 'contain'}} />
        </motion.div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-6 text-gray-600"
      >
        Click the truck to get started
      </motion.p>
    </div>
  );
}