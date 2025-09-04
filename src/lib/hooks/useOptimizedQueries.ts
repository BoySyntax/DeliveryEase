import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';

// Optimized hooks for common database operations

export const useOrders = (customerId?: string) => {
  return useQuery({
    queryKey: ['orders', customerId],
    queryFn: async () => {
      if (!customerId) return [];
      
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          order_status_code,
          approval_status,
          delivery_status,
          total,
          items:order_items (
            quantity,
            price,
            product:products (
              name,
              image_url
            )
          )
        `)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!customerId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useProducts = (categoryId?: string, searchQuery?: string) => {
  return useQuery({
    queryKey: ['products', categoryId, searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select(`
          id,
          name,
          description,
          price,
          image_url,
          quantity,
          category_id,
          category:categories(name)
        `)
        .eq('is_active', true);

      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }

      if (searchQuery) {
        query = query.ilike('name', `%${searchQuery}%`);
      }

      const { data, error } = await query.order('name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useCategories = () => {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, image_url')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data || [];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - categories don't change often
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
};

export const useActiveBatch = (driverId?: string) => {
  return useQuery({
    queryKey: ['activeBatch', driverId],
    queryFn: async () => {
      if (!driverId) return null;

      const { data, error } = await supabase
        .from('order_batches')
        .select(`
          id,
          barangay,
          total_weight,
          status,
          created_at,
          orders:orders!inner(
            id,
            total,
            delivery_status,
            delivery_address,
            customer:profiles!orders_customer_id_fkey(id, name)
          )
        `)
        .eq('driver_id', driverId)
        .eq('status', 'assigned')
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      return data;
    },
    enabled: !!driverId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
  });
};

export const useCart = (customerId?: string) => {
  return useQuery({
    queryKey: ['cart', customerId],
    queryFn: async () => {
      if (!customerId) return null;

      // Get the latest cart
      const { data: cart, error: cartError } = await supabase
        .from('carts')
        .select('id')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cartError && cartError.code !== 'PGRST116') throw cartError;

      if (!cart) return null;

      // Get cart items
      const { data: items, error: itemsError } = await supabase
        .from('cart_items')
        .select(`
          id,
          quantity,
          product:products (
            id,
            name,
            price,
            image_url,
            quantity
          )
        `)
        .eq('cart_id', cart.id);

      if (itemsError) throw itemsError;
      return { cart, items: items || [] };
    },
    enabled: !!customerId,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Mutation hooks for data updates
export const useUpdateOrderStatus = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const { error } = await supabase
        .from('orders')
        .update({ delivery_status: status })
        .eq('id', orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['activeBatch'] });
    },
  });
};

export const useAddToCart = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ customerId, productId, quantity }: { 
      customerId: string; 
      productId: string; 
      quantity: number; 
    }) => {
      // Get or create cart
      let { data: cart, error: cartError } = await supabase
        .from('carts')
        .select('id')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cartError && cartError.code === 'PGRST116') {
        // Create new cart
        const { data: newCart, error: createError } = await supabase
          .from('carts')
          .insert({ customer_id: customerId })
          .select('id')
          .single();

        if (createError) throw createError;
        cart = newCart;
      } else if (cartError) {
        throw cartError;
      }

      // Add item to cart
      const { error } = await supabase
        .from('cart_items')
        .upsert({
          cart_id: cart.id,
          product_id: productId,
          quantity: quantity,
        });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cart', variables.customerId] });
    },
  });
};
