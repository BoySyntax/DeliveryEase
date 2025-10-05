import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import { formatCurrency } from '../../lib/utils';
import { Package, ShoppingBag, Truck, Users } from 'lucide-react';
import { salesAnalytics, DateRange, SalesAnalyticsData } from '../../lib/salesAnalytics';
import { salesExport } from '../../lib/salesExport';
import SalesMetricsCards from '../components/SalesMetricsCards';
import CategoryChart from '../components/CategoryChart';
import OrderStatusChart from '../components/OrderStatusChart';
import TopProductsTable from '../components/TopProductsTable';
import SalesFilters from '../components/SalesFilters';

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
  delivery_status: OrderStatus;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [salesData, setSalesData] = useState<SalesAnalyticsData | null>(null);
  const [salesLoading, setSalesLoading] = useState(true);
  const [currentRange, setCurrentRange] = useState<DateRange>('7d');
  const [customStart, setCustomStart] = useState<Date>();
  const [customEnd, setCustomEnd] = useState<Date>();

  const loadSalesData = useCallback(async (range: DateRange, start?: Date, end?: Date) => {
    setSalesLoading(true);
    try {
      const data = await salesAnalytics.getFullAnalytics(range, start, end);
      setSalesData(data);
    } catch (error) {
      console.error('Error loading sales data:', error);
    } finally {
      setSalesLoading(false);
    }
  }, []);


  useEffect(() => {
    loadStats();
    loadSalesData(currentRange, customStart, customEnd);

    // Subscribe to real-time updates
    const unsubscribe = salesAnalytics.subscribeToOrderUpdates(() => {
      loadStats();
      loadSalesData(currentRange, customStart, customEnd);
    });

    return () => {
      unsubscribe();
    };
  }, [currentRange, customStart, customEnd, loadSalesData]);

  const handleRangeChange = (range: DateRange, start?: Date, end?: Date) => {
    setCurrentRange(range);
    setCustomStart(start);
    setCustomEnd(end);
  };

  const handleExport = () => {
    if (salesData) {
      salesExport.exportToCSV(salesData, currentRange, customStart, customEnd);
    }
  };

  const handleRefresh = () => {
    loadStats();
    loadSalesData(currentRange, customStart, customEnd);
  };

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

      // Get total revenue from delivered orders
      const { data: orders } = await supabase
        .from('orders')
        .select('total')
        .eq('delivery_status', 'delivered');

      const totalRevenue = orders?.reduce((sum, order) => sum + order.total, 0) || 0;

      // Get orders by delivery status
      const { data: ordersByStatus } = await supabase
        .from('orders')
        .select('delivery_status') as { data: OrderStatusResponse[] | null };

      const statusCounts = {
        pending: 0,
        assigned: 0,
        delivering: 0,
        delivered: 0,
      };

      ordersByStatus?.forEach((order) => {
        if (order.delivery_status in statusCounts) {
          statusCounts[order.delivery_status]++;
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

  if (loading || salesLoading) {
    return <Loader label="Loading dashboard..." />;
  }

  if (!stats || !salesData) {
    return <div>Failed to load dashboard data.</div>;
  }

  const statCards = [
    {
      title: 'All-time Orders',
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
      title: 'All-time Delivered Revenue',
      value: formatCurrency(stats.totalRevenue),
      icon: <Users className="h-6 w-6 text-primary-500" />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Sales Dashboard</h1>
      </div>

      {/* Filters */}
      <SalesFilters
        currentRange={currentRange}
        onRangeChange={handleRangeChange}
        onExport={handleExport}
        onRefresh={handleRefresh}
        loading={salesLoading}
      />

      {/* Sales Metrics Cards */}
      <SalesMetricsCards metrics={salesData.metrics} loading={salesLoading} />

      {/* Legacy Stats Cards */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">Delivery Overview</h2>
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
      </div>

      {/* Sales Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CategoryChart
          data={salesData.categorySales}
          title="Sales by Category"
          height={350}
        />
        <OrderStatusChart
          data={salesData.orderDistribution}
          title="Order Status Distribution"
          height={350}
        />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <TopProductsTable
          data={salesData.topProducts}
          title="Top Selling Products"
          limit={8}
        />
      </div>

      {/* Legacy Order Status */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Orders by Status (Legacy View)
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
  );
}