import { useState, useEffect } from 'react';
import { supabase } from './supabase';

export interface LowStockProduct {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  unit_quantity: number | null;
  image_url: string | null;
}

export function useLowStockNotifications() {
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLowStockProducts = async () => {
      try {
        setLoading(true);
        
        // Fetch products with low stock (quantity <= 10) or out of stock (quantity = 0)
        const { data, error } = await supabase
          .from('products')
          .select('id, name, quantity, unit, unit_quantity, image_url')
          .lte('quantity', 10) // Low stock threshold: 10 or less
          .order('quantity', { ascending: true });

        if (error) {
          throw error;
        }

        setLowStockProducts(data || []);
        setError(null);
      } catch (err) {
        console.error('Error fetching low stock products:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch low stock products');
      } finally {
        setLoading(false);
      }
    };

    fetchLowStockProducts();

    // Refresh every 30 seconds
    const interval = setInterval(fetchLowStockProducts, 30000);

    return () => clearInterval(interval);
  }, []);

  const outOfStockCount = lowStockProducts.filter(p => p.quantity === 0).length;
  const lowStockCount = lowStockProducts.filter(p => p.quantity > 0 && p.quantity <= 10).length;
  const totalNotifications = outOfStockCount + lowStockCount;

  return {
    lowStockProducts,
    outOfStockCount,
    lowStockCount,
    totalNotifications,
    loading,
    error
  };
}
