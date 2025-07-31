import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import { formatCurrency } from '../../lib/utils';
import { Package, ShoppingBag, Truck, Users } from 'lucide-react';

type OrderStatus = 'pending' | 'assigned' | 'delivering' | 'delivered';

type DashboardStats = {
  totalOrders: number;
  totalProducts: number;
  totalDrivers: number;
  totalRevenue: number;
  ordersByStatus: {
    pending: number;
    assigned: number;
    delivering: number;
    delivered: number;
  };
};

type OrderStatusResponse = {
  status: OrderStatus;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      // Get total orders
      const { count: totalOrders } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true });

      // Get total products
      const { count: totalProducts } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

      // Get total drivers
      const { count: totalDrivers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'driver');

      // Get total revenue
      const { data: orders } = await supabase
        .from('orders')
        .select('total')
        .eq('status', 'delivered');

      const totalRevenue = orders?.reduce((sum, order) => sum + order.total, 0) || 0;

      // Get orders by status
      const { data: ordersByStatus } = await supabase
        .from('orders')
        .select('status') as { data: OrderStatusResponse[] | null };

      const statusCounts = {
        pending: 0,
        assigned: 0,
        delivering: 0,
        delivered: 0,
      };

      ordersByStatus?.forEach((order) => {
        if (order.status in statusCounts) {
          statusCounts[order.status]++;
        }
      });

      setStats({
        totalOrders: totalOrders || 0,
        totalProducts: totalProducts || 0,
        totalDrivers: totalDrivers || 0,
        totalRevenue,
        ordersByStatus: statusCounts,
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
      title: 'Total Orders',
      value: stats.totalOrders,
      icon: <Package className="h-6 w-6 text-primary-500" />,
    },
    {
      title: 'Total Products',
      value: stats.totalProducts,
      icon: <ShoppingBag className="h-6 w-6 text-primary-500" />,
    },
    {
      title: 'Active Drivers',
      value: stats.totalDrivers,
      icon: <Truck className="h-6 w-6 text-primary-500" />,
    },
    {
      title: 'Total Revenue',
      value: formatCurrency(stats.totalRevenue),
      icon: <Users className="h-6 w-6 text-primary-500" />,
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Orders by Status
            </h2>
            <div className="space-y-4">
              {Object.entries(stats.ordersByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center">
                  <div className="flex-1">
                    <div className="flex items-center">
                      <span className="capitalize text-sm font-medium text-gray-700">
                        {status}
                      </span>
                      <span className="ml-auto text-sm text-gray-500">
                        {count} orders
                      </span>
                    </div>
                    <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-primary-500 h-2 rounded-full"
                        style={{
                          width: `${(count / stats.totalOrders) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>


      </div>
    </div>
  );
}