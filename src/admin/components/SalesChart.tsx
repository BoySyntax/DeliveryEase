import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent } from '../../ui/components/Card';
import { DailySalesData } from '../../lib/salesAnalytics';
import { formatCurrency } from '../../lib/utils';

interface SalesChartProps {
  data: DailySalesData[];
  title: string;
  showRevenue?: boolean;
  showOrders?: boolean;
  height?: number;
}

export default function SalesChart({ 
  data, 
  title, 
  showRevenue = true, 
  showOrders = true,
  height = 300 
}: SalesChartProps) {
  const formatTooltipValue = (value: number, name: string) => {
    if (name === 'revenue') {
      return formatCurrency(value);
    }
    return value;
  };

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">{title}</h3>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="formattedDate" 
              stroke="#666"
              fontSize={12}
            />
            <YAxis 
              yAxisId="left"
              stroke="#666"
              fontSize={12}
              tickFormatter={(value) => showRevenue ? formatCurrency(value) : value.toString()}
            />
            {showOrders && showRevenue && (
              <YAxis 
                yAxisId="right"
                orientation="right"
                stroke="#666"
                fontSize={12}
              />
            )}
            <Tooltip 
              formatter={formatTooltipValue}
              labelStyle={{ color: '#666' }}
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
            />
            <Legend />
            {showRevenue && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="revenue"
                stroke="#0a2767"
                strokeWidth={2}
                dot={{ fill: '#0a2767', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#0a2767', strokeWidth: 2 }}
                name="Revenue"
              />
            )}
            {showOrders && (
              <Line
                yAxisId={showRevenue ? "right" : "left"}
                type="monotone"
                dataKey="orders"
                stroke="#10B981"
                strokeWidth={2}
                dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#10B981', strokeWidth: 2 }}
                name="Orders"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
