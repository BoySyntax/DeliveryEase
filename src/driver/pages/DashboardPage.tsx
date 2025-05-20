import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import { formatCurrency } from '../../lib/utils';
import { Package, CheckCircle } from 'lucide-react';

type DashboardStats = {
  activeOrders: number;
  completedOrders: number;
  totalEarnings: number;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get active orders (assigned or delivering)
      const { count: activeOrders } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('driver_id', user.id)
        .in('status', ['assigned', 'delivering']);

      // Get completed orders
      const { data: completedOrdersData } = await supabase
        .from('orders')
        .select('total')
        .eq('driver_id', user.id)
        .eq('status', 'delivered');

      const completedOrders = completedOrdersData?.length || 0;
      const totalEarnings = completedOrdersData?.reduce((sum, order) => sum + order.total, 0) || 0;

      setStats({
        activeOrders: activeOrders || 0,
        completedOrders,
        totalEarnings,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <Loader label="Loading dashboard..." />;
  }

  if (!stats) {
    return <div>Failed to load dashboard statistics.</div>;
  }

  const statCards = [
    {
      title: 'Active Orders',
      value: stats.activeOrders,
      icon: <Package className="h-6 w-6 text-primary-500" />,
    },
    {
      title: 'Completed Orders',
      value: stats.completedOrders,
      icon: <CheckCircle className="h-6 w-6 text-primary-500" />,
    },
    {
      title: 'Total Earnings',
      value: formatCurrency(stats.totalEarnings),
      icon: <Package className="h-6 w-6 text-primary-500" />,
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="mt-2 text-3xl font-semibold text-gray-900">
                    {stat.value}
                  </p>
                </div>
                {stat.icon}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}