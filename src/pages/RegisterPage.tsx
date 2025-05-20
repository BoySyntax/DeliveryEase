import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { Mail, Lock, User, ShoppingBag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Button from '../ui/components/Button';
import Input from '../ui/components/Input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../ui/components/Card';

type RegisterFormData = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm<RegisterFormData>();

  const onSubmit = async (data: RegisterFormData) => {
    setLoading(true);
    try {
      // Sign up user
      const { error: signUpError, data: authData } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
      });

      if (signUpError) {
        throw signUpError;
      }

      // Create user profile
      if (authData.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([
            {
              id: authData.user.id,
              name: data.name,
              role: 'customer', // Default role for new registrations
            },
          ]);

        if (profileError) {
          throw profileError;
        }
      }

      toast.success('Account created successfully!');
      navigate('/customer');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to create account'
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
          Create a new account
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Sign Up</CardTitle>
          </CardHeader>
          
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <Input
                id="name"
                type="text"
                label="Full Name"
                icon={<User size={18} />}
                fullWidth
                error={errors.name?.message}
                {...register('name', { 
                  required: 'Name is required',
                })}
              />
              
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
              
              <Input
                id="confirmPassword"
                type="password"
                label="Confirm Password"
                icon={<Lock size={18} />}
                fullWidth
                error={errors.confirmPassword?.message}
                {...register('confirmPassword', { 
                  required: 'Please confirm your password',
                  validate: (value) => 
                    value === watch('password') || 'Passwords do not match',
                })}
              />
            </CardContent>
            
            <CardFooter className="flex flex-col">
              <Button
                type="submit"
                fullWidth
                isLoading={loading}
              >
                Create Account
              </Button>
              
              <p className="mt-4 text-center text-sm text-gray-600">
                Already have an account?{' '}
                <a 
                  href="/login" 
                  className="font-medium text-primary-600 hover:text-primary-500"
                >
                  Sign in
                </a>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}