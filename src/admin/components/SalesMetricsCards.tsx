import { Card, CardContent } from '../../ui/components/Card';
import { SalesMetrics } from '../../lib/salesAnalytics';
import { formatCurrency } from '../../lib/utils';
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, BarChart3, MapPin } from 'lucide-react';

interface SalesMetricsCardsProps {
  metrics: SalesMetrics;
  loading?: boolean;
}

export default function SalesMetricsCards({ metrics, loading }: SalesMetricsCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-8 bg-gray-200 rounded mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-20"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const formatGrowth = (growth: number) => {
    const isPositive = growth >= 0;
    const icon = isPositive ? (
      <TrendingUp className="h-4 w-4" />
    ) : (
      <TrendingDown className="h-4 w-4" />
    );
    
    const colorClass = isPositive ? 'text-primary-600' : 'text-red-600';
    const bgClass = isPositive ? 'bg-green-100' : 'bg-red-100';
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${colorClass} ${bgClass}`}>
        {icon}
        {Math.abs(growth).toFixed(1)}%
      </span>
    );
  };

  const metricsData = [
    {
      title: 'Total Revenue',
      value: formatCurrency(metrics.totalRevenue),
      growth: metrics.revenueGrowth,
      icon: <DollarSign className="h-6 w-6 text-primary-600" />,
      bgColor: 'bg-green-50',
    },
    {
      title: 'Total Orders',
      value: metrics.totalOrders.toLocaleString(),
      growth: metrics.ordersGrowth,
      icon: <ShoppingBag className="h-6 w-6 text-blue-600" />,
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Average Order Value',
      value: formatCurrency(metrics.averageOrderValue),
      growth: metrics.revenueGrowth - metrics.ordersGrowth, // AOV growth approximation
      icon: <BarChart3 className="h-6 w-6 text-purple-600" />,
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Top Barangay',
      value: metrics.topBarangay ? `${metrics.topBarangay} (${metrics.topBarangayOrders})` : 'N/A',
      growth: 0,
      icon: <MapPin className="h-6 w-6 text-orange-600" />,
      bgColor: 'bg-orange-50',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {metricsData.map((metric, index) => (
        <Card key={index} className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 mb-1">
                  {metric.title}
                </p>
                <p className="text-2xl font-bold text-gray-900 mb-2">
                  {metric.value}
                </p>
                {index < 3 && (
                  <div className="flex items-center gap-2">
                    {formatGrowth(metric.growth)}
                    <span className="text-xs text-gray-500">vs previous period</span>
                  </div>
                )}
              </div>
              <div className={`p-3 rounded-lg ${metric.bgColor}`}>
                {metric.icon}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
