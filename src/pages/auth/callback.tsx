import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        
        if (!session) {
          throw new Error('No session found after authentication');
        }

        console.log('Session established:', session);

        // Get user profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        if (profileError) {
          // If profile doesn't exist, create one for Google users
          if (session.user.app_metadata.provider === 'google') {
            console.log('Creating profile for Google user:', session.user);
            const { error: insertError } = await supabase
              .from('profiles')
              .insert([{
                id: session.user.id,
                name: session.user.user_metadata.full_name,
                role: 'customer', // Default role for Google sign-ins
              }]);
            
            if (insertError) {
              console.error('Error creating profile:', insertError);
              throw insertError;
            }
            
            console.log('Profile created successfully');
            navigate('/customer', { replace: true });
            return;
          }
          throw profileError;
        }

        console.log('Profile found:', profile);

        // Redirect based on role
        if (profile?.role === 'admin') {
          navigate('/admin', { replace: true });
        } else if (profile?.role === 'driver') {
          navigate('/driver', { replace: true });
        } else if (profile?.role === 'customer') {
          navigate('/customer', { replace: true });
        } else {
          throw new Error('Invalid user role');
        }
      } catch (error) {
        console.error('Error in auth callback:', error);
        toast.error(error instanceof Error ? error.message : 'Authentication failed');
        navigate('/login');
      }
    };

    handleCallback();
  }, [navigate]);

  return null;
} 