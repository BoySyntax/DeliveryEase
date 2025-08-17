import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import fordaa from '../assets/fordaa.png';

export default function LoginPage() {
  const navigate = useNavigate();

  const handleGoogleSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({ 
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: false,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      });

      if (error) throw error;
    } catch (error) {
      console.error('Google sign in error:', error);
      toast.error('Failed to sign in with Google');
    }
  };

  return (
    <div className="fixed inset-0 bg-primary-500">
      {/* Logo Section */}
      <div className="absolute inset-x-0 top-0 h-2/3 flex flex-col items-center justify-center">
        <div className="relative">
          <img 
            src={fordaa} 
            alt="DeliveryEase" 
            className="w-96 h-96 object-contain brightness-0 invert"
          />
        </div>
      </div>

      {/* Sign In Section */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-white rounded-t-[32px] px-6 pt-8">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-primary-500 to-primary-600 bg-clip-text text-transparent">
            Welcome back!
          </h2>
          <p className="text-gray-600 mt-1">
            Log in to your account
          </p>
        </div>

        <button
          onClick={handleGoogleSignIn}
          className="w-full bg-white border border-gray-300 rounded-xl py-4 flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M47.5 24.552C47.5 22.864 47.345 21.232 47.06 19.667H24V28.334H37.19C36.62 31.334 34.77 33.814 32.02 35.48V41.048H39.82C44.22 37.048 47.5 31.334 47.5 24.552Z" fill="#4285F4"/>
            <path d="M24 48C30.48 48 35.98 45.864 39.82 41.048L32.02 35.48C29.86 36.88 27.18 37.668 24 37.668C17.74 37.668 12.36 33.668 10.54 28.334H2.48V34.048C6.3 41.232 14.44 48 24 48Z" fill="#34A853"/>
            <path d="M10.54 28.334C10.1 26.934 9.86 25.434 9.86 23.999C9.86 22.564 10.1 21.064 10.54 19.664V13.95H2.48C0.9 17.13 0 20.48 0 23.999C0 27.518 0.9 30.868 2.48 34.048L10.54 28.334Z" fill="#FBBC05"/>
            <path d="M24 9.332C27.54 9.332 30.66 10.552 33.06 12.814L40.02 6.048C35.98 2.332 30.48 0 24 0C14.44 0 6.3 6.768 2.48 13.952L10.54 19.666C12.36 14.332 17.74 9.332 24 9.332Z" fill="#EA4335"/>
          </svg>
          <span className="text-gray-700 font-medium">Continue with Google</span>
        </button>
      </div>
    </div>
  );
}