import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { Mail, Lock, Truck } from 'lucide-react';
import Button from '../ui/components/Button';
import Input from '../ui/components/Input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../ui/components/Card';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.png';

type LoginFormData = {
  email: string;
  password: string;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>();

  const onSubmit = async (data: LoginFormData) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        throw error;
      }

      // Get user profile to determine which dashboard to redirect to
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', (await supabase.auth.getUser()).data.user?.id || '')
        .single();

      if (profile) {
        // Redirect based on role
        switch (profile.role) {
          case 'admin':
            navigate('/admin');
            break;
          case 'driver':
            navigate('/driver');
            break;
          case 'customer':
          default:
            navigate('/customer');
            break;
        }
      } else {
        // Default to customer if no profile found
        navigate('/customer');
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to sign in'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google' });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-0">
          <img src={logo} alt="DeliveryEase Logo" width={128} height={128} style={{objectFit: 'contain'}} />
        </div>
        
        <h1 className="text-center text-3xl font-bold mb-2 text-black">
          DeliveryEase
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Sign in to your account
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
          </CardHeader>
          
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <Input
                id="email"
                type="email"
                label="Email"
                icon={<Mail size={18} />}
                fullWidth
                error={errors.email?.message}
                {...register('email', { 
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i,
                    message: 'Invalid email address',
                  }
                })}
              />
              
              <Input
                id="password"
                type="password"
                label="Password"
                icon={<Lock size={18} />}
                fullWidth
                error={errors.password?.message}
                {...register('password', { 
                  required: 'Password is required',
                  minLength: {
                    value: 6,
                    message: 'Password must be at least 6 characters',
                  }
                })}
              />
            </CardContent>
            
            <CardFooter className="flex flex-col">
              <Button
                type="submit"
                fullWidth
                isLoading={loading}
              >
                Sign In
              </Button>
              <div className="my-4 flex items-center">
                <div className="flex-grow border-t border-gray-200" />
                <span className="mx-2 text-gray-400 text-xs">or</span>
                <div className="flex-grow border-t border-gray-200" />
              </div>
              <Button
                type="button"
                fullWidth
                variant="outline"
                onClick={handleGoogleSignIn}
                className="flex items-center justify-center gap-2"
              >
                <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><g clipPath="url(#clip0_17_40)"><path d="M47.5 24.552C47.5 22.864 47.345 21.232 47.06 19.667H24V28.334H37.19C36.62 31.334 34.77 33.814 32.02 35.48V41.048H39.82C44.22 37.048 47.5 31.334 47.5 24.552Z" fill="#4285F4"/><path d="M24 48C30.48 48 35.98 45.864 39.82 41.048L32.02 35.48C29.86 36.88 27.18 37.668 24 37.668C17.74 37.668 12.36 33.668 10.54 28.334H2.48V34.048C6.3 41.232 14.44 48 24 48Z" fill="#34A853"/><path d="M10.54 28.334C10.1 26.934 9.86 25.434 9.86 23.999C9.86 22.564 10.1 21.064 10.54 19.664V13.95H2.48C0.9 17.13 0 20.48 0 23.999C0 27.518 0.9 30.868 2.48 34.048L10.54 28.334Z" fill="#FBBC05"/><path d="M24 9.332C27.54 9.332 30.66 10.552 33.06 12.814L40.02 6.048C35.98 2.332 30.48 0 24 0C14.44 0 6.3 6.768 2.48 13.952L10.54 19.666C12.36 14.332 17.74 9.332 24 9.332Z" fill="#EA4335"/></g><defs><clipPath id="clip0_17_40"><rect width="48" height="48" fill="white"/></clipPath></defs></svg>
                Continue with Google
              </Button>
              <p className="mt-4 text-center text-sm text-gray-600">
                Don't have an account?{' '}
                <a 
                  href="/register" 
                  className="font-medium text-primary-600 hover:text-primary-500"
                >
                  Sign up
                </a>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}