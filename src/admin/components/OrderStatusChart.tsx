import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent } from '../../ui/components/Card';
import { OrderStatusDistribution } from '../../lib/salesAnalytics';
import { formatCurrency } from '../../lib/utils';

interface OrderStatusChartProps {
  data: OrderStatusDistribution[];
  title: string;
  height?: number;
}

const STATUS_COLORS = {
  pending: '#F59E0B',
  assigned: '#0a2767',
  delivering: '#8B5CF6',
  delivered: '#10B981'
};

export default function OrderStatusChart({ data, title, height = 300 }: OrderStatusChartProps) {
  const formatTooltipValue = (value: number, name: string) => {
    if (name === 'revenue') {
      return formatCurrency(value);
    }
    return value;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900 capitalize">{label}</p>
          <p className="text-sm text-blue-600">
            Orders: {data.count}
          </p>
          <p className="text-sm text-green-600">
            Revenue: {formatCurrency(data.revenue)}
          </p>
          <p className="text-sm text-gray-600">
            Percentage: {data.percentage.toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">{title}</h3>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="status" 
                stroke="#666"
                fontSize={12}
                tickFormatter={(value) => value.charAt(0).toUpperCase() + value.slice(1)}
              />
              <YAxis 
                yAxisId="left"
                stroke="#666"
                fontSize={12}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                stroke="#666"
                fontSize={12}
                tickFormatter={(value) => formatCurrency(value)}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar 
                yAxisId="left"
                dataKey="count" 
                name="Orders"
                fill="#0a2767"
                radius={[4, 4, 0, 0]}
              />
              <Bar 
                yAxisId="right"
                dataKey="revenue" 
                name="Revenue"
                fill="#10B981"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-500">
            No order status data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
