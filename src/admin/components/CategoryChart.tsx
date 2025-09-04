import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Card, CardContent } from '../../ui/components/Card';
import { CategorySalesData } from '../../lib/salesAnalytics';
import { formatCurrency } from '../../lib/utils';

interface CategoryChartProps {
  data: CategorySalesData[];
  title: string;
  height?: number;
}

const COLORS = [
  '#0a2767', // brand blue
  '#059669', // emerald green
  '#dc2626', // red
  '#7c3aed', // violet
  '#ea580c', // orange
  '#0891b2', // cyan
  '#be185d', // pink
  '#65a30d', // lime
];

export default function CategoryChart({ data, title, height = 300 }: CategoryChartProps) {
  const formatTooltipValue = (value: number, name: string) => {
    if (name === 'revenue') {
      return formatCurrency(value);
    }
    return `${value.toFixed(1)}%`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900">{data.category}</p>
          <p className="text-sm text-primary-600">
            Revenue: {formatCurrency(data.revenue)}
          </p>
          <p className="text-sm text-gray-600">
            Share: {data.percentage.toFixed(1)}%
          </p>
          <p className="text-sm text-gray-600">
            Orders: {data.orders}
          </p>
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percentage }: any) => {
    if (percentage < 5) return null; // Don't show labels for small slices
    
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
      >
        {`${percentage.toFixed(0)}%`}
      </text>
    );
  };

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">{title}</h3>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={100}
                fill="#8884d8"
                dataKey="percentage"
                nameKey="category"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                formatter={(value, entry) => {
                  const payload = entry.payload as CategorySalesData;
                  return (
                    <span style={{ color: entry.color }}>
                      {payload.category} ({formatCurrency(payload.revenue)})
                    </span>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-500">
            No category data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
