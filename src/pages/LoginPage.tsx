import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { Mail, Lock, ShoppingBag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Button from '../ui/components/Button';
import Input from '../ui/components/Input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../ui/components/Card';

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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="bg-primary-500 text-white p-3 rounded-full">
            <ShoppingBag size={32} />
          </div>
        </div>
        
        <h1 className="text-center text-3xl font-bold mb-2 text-gray-900">
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