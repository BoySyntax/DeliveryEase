import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabase';
import { Database } from './database.types';

export type UserProfile = Database['public']['Tables']['profiles']['Row'];
export type UserRole = Database['public']['Enums']['user_role'];

export const useSession = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
};

export const useProfile = () => {
  const { session, loading: sessionLoading } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let ignore = false;

    const fetchProfile = async () => {
      if (!session?.user) {
        if (!ignore) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (error) throw error;

        if (!ignore) {
          setProfile(data);
          setError(null);
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        if (!ignore) {
          setError(err instanceof Error ? err : new Error('Failed to fetch profile'));
          setProfile(null);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    if (!sessionLoading) {
      fetchProfile();
    }

    return () => {
      ignore = true;
    };
  }, [session, sessionLoading]);

  return { profile, loading: loading || sessionLoading, error };
};

export const useRequireAuth = (allowedRoles?: UserRole[]) => {
  const navigate = useNavigate();
  const { profile, loading, error } = useProfile();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!profile) {
      navigate('/login', { replace: true });
      return;
    }

    if (allowedRoles && !allowedRoles.includes(profile.role)) {
      // Redirect based on role
      switch (profile.role) {
        case 'admin':
          navigate('/admin', { replace: true });
          break;
        case 'driver':
          navigate('/driver', { replace: true });
          break;
        case 'customer':
        default:
          navigate('/customer', { replace: true });
          break;
      }
      return;
    }

    setAuthorized(true);
  }, [profile, loading, navigate, allowedRoles]);

  return { profile, loading, error, authorized };
};