import { supabase } from './supabase';
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';

export type DateRange = '24h' | '7d' | '30d' | '3m' | '1y' | 'custom';
export type OrderStatus = 'pending' | 'assigned' | 'delivering' | 'delivered';

export interface SalesMetrics {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  revenueGrowth: number;
  ordersGrowth: number;
  topBarangay: string | null;
  topBarangayOrders: number;
}

export interface DailySalesData {
  date: string;
  revenue: number;
  orders: number;
  formattedDate: string;
}

export interface CategorySalesData {
  category: string;
  revenue: number;
  orders: number;
  percentage: number;
}

export interface ProductSalesData {
  product: string;
  quantity: number;
  revenue: number;
  orders: number;
}

export interface OrderStatusDistribution {
  status: OrderStatus;
  count: number;
  percentage: number;
  revenue: number;
}

export interface SalesAnalyticsData {
  metrics: SalesMetrics;
  dailySales: DailySalesData[];
  categorySales: CategorySalesData[];
  topProducts: ProductSalesData[];
  orderDistribution: OrderStatusDistribution[];
  hourlyData: Array<{ hour: number; orders: number; revenue: number }>;
}

class SalesAnalyticsService {
  private getDateRange(range: DateRange, customStart?: Date, customEnd?: Date) {
    const now = new Date();
    
    switch (range) {
      case '24h':
        return {
          start: startOfDay(now),
          end: endOfDay(now),
          previousStart: startOfDay(subDays(now, 1)),
          previousEnd: endOfDay(subDays(now, 1))
        };
      case '7d':
        return {
          start: startOfWeek(now),
          end: endOfWeek(now),
          previousStart: startOfWeek(subDays(now, 7)),
          previousEnd: endOfWeek(subDays(now, 7))
        };
      case '30d':
        return {
          start: startOfMonth(now),
          end: endOfMonth(now),
          previousStart: startOfMonth(subDays(now, 30)),
          previousEnd: endOfMonth(subDays(now, 30))
        };
      case '3m':
        return {
          start: subDays(now, 90),
          end: now,
          previousStart: subDays(now, 180),
          previousEnd: subDays(now, 90)
        };
      case '1y':
        return {
          start: startOfYear(now),
          end: endOfYear(now),
          previousStart: startOfYear(subDays(now, 365)),
          previousEnd: endOfYear(subDays(now, 365))
        };
      case 'custom':
        if (!customStart || !customEnd) {
          throw new Error('Custom date range requires start and end dates');
        }
        const daysDiff = Math.ceil((customEnd.getTime() - customStart.getTime()) / (1000 * 60 * 60 * 24));
        return {
          start: customStart,
          end: customEnd,
          previousStart: subDays(customStart, daysDiff),
          previousEnd: subDays(customEnd, daysDiff)
        };
      default:
        throw new Error('Invalid date range');
    }
  }

  async getSalesMetrics(range: DateRange, customStart?: Date, customEnd?: Date): Promise<SalesMetrics> {
    const { start, end, previousStart, previousEnd } = this.getDateRange(range, customStart, customEnd);

    // Current period metrics
    const { data: currentOrders } = await supabase
      .from('orders')
      .select('total, created_at, delivery_address')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .eq('approval_status', 'approved');

    // Previous period metrics for growth calculation
    const { data: previousOrders } = await supabase
      .from('orders')
      .select('total, created_at')
      .gte('created_at', previousStart.toISOString())
      .lte('created_at', previousEnd.toISOString())
      .eq('approval_status', 'approved');

    const currentRevenue = currentOrders?.reduce((sum, order) => sum + order.total, 0) || 0;
    const currentOrdersCount = currentOrders?.length || 0;
    const previousRevenue = previousOrders?.reduce((sum, order) => sum + order.total, 0) || 0;
    const previousOrdersCount = previousOrders?.length || 0;

    const revenueGrowth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
    const ordersGrowth = previousOrdersCount > 0 ? ((currentOrdersCount - previousOrdersCount) / previousOrdersCount) * 100 : 0;
    const averageOrderValue = currentOrdersCount > 0 ? currentRevenue / currentOrdersCount : 0;

    // Compute most ordered barangay within the selected range (based on approved orders)
    const barangayToCount: Record<string, number> = {};
    currentOrders?.forEach((order: any) => {
      const barangay: string = order?.delivery_address?.barangay || 'Unknown';
      barangayToCount[barangay] = (barangayToCount[barangay] || 0) + 1;
    });
    let topBarangay: string | null = null;
    let topBarangayOrders = 0;
    Object.entries(barangayToCount).forEach(([name, count]) => {
      if (count > topBarangayOrders) {
        topBarangay = name;
        topBarangayOrders = count;
      }
    });

    return {
      totalRevenue: currentRevenue,
      totalOrders: currentOrdersCount,
      averageOrderValue,
      revenueGrowth,
      ordersGrowth,
      topBarangay,
      topBarangayOrders
    };
  }

  async getDailySalesData(range: DateRange, customStart?: Date, customEnd?: Date): Promise<DailySalesData[]> {
    const { start, end } = this.getDateRange(range, customStart, customEnd);

    const { data: orders } = await supabase
      .from('orders')
      .select('total, created_at')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .eq('approval_status', 'approved')
      .order('created_at', { ascending: true });

    // Group orders by date
    const dailyData: { [key: string]: { revenue: number; orders: number } } = {};
    
    orders?.forEach(order => {
      const date = format(new Date(order.created_at), 'yyyy-MM-dd');
      if (!dailyData[date]) {
        dailyData[date] = { revenue: 0, orders: 0 };
      }
      dailyData[date].revenue += order.total;
      dailyData[date].orders += 1;
    });

    // Convert to array and sort
    return Object.entries(dailyData)
      .map(([date, data]) => ({
        date,
        revenue: data.revenue,
        orders: data.orders,
        formattedDate: format(new Date(date), 'MMM dd')
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async getCategorySalesData(range: DateRange, customStart?: Date, customEnd?: Date): Promise<CategorySalesData[]> {
    const { start, end } = this.getDateRange(range, customStart, customEnd);

    const { data: orderItems } = await supabase
      .from('order_items')
      .select(`
        quantity,
        price,
        product_id,
        products!inner(
          name,
          categories!inner(
            name
          )
        ),
        orders!inner(
          created_at,
          approval_status
        )
      `)
      .gte('orders.created_at', start.toISOString())
      .lte('orders.created_at', end.toISOString())
      .eq('orders.approval_status', 'approved');

    // Group by category
    const categoryData: { [key: string]: { revenue: number; orders: Set<string> } } = {};
    
    orderItems?.forEach(item => {
      const categoryName = item.products.categories.name;
      const revenue = item.quantity * item.price;
      
      if (!categoryData[categoryName]) {
        categoryData[categoryName] = { revenue: 0, orders: new Set() };
      }
      
      categoryData[categoryName].revenue += revenue;
      // Note: This is a simplified approach - in a real scenario you'd need order_id
    });

    const totalRevenue = Object.values(categoryData).reduce((sum, data) => sum + data.revenue, 0);

    return Object.entries(categoryData)
      .map(([category, data]) => ({
        category,
        revenue: data.revenue,
        orders: data.orders.size,
        percentage: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  async getTopProducts(range: DateRange, customStart?: Date, customEnd?: Date, limit: number = 10): Promise<ProductSalesData[]> {
    const { start, end } = this.getDateRange(range, customStart, customEnd);

    const { data: orderItems } = await supabase
      .from('order_items')
      .select(`
        quantity,
        price,
        products!inner(
          name
        ),
        orders!inner(
          created_at,
          approval_status
        )
      `)
      .gte('orders.created_at', start.toISOString())
      .lte('orders.created_at', end.toISOString())
      .eq('orders.approval_status', 'approved');

    // Group by product
    const productData: { [key: string]: { quantity: number; revenue: number; orders: Set<string> } } = {};
    
    orderItems?.forEach(item => {
      const productName = item.products.name;
      const revenue = item.quantity * item.price;
      
      if (!productData[productName]) {
        productData[productName] = { quantity: 0, revenue: 0, orders: new Set() };
      }
      
      productData[productName].quantity += item.quantity;
      productData[productName].revenue += revenue;
    });

    return Object.entries(productData)
      .map(([product, data]) => ({
        product,
        quantity: data.quantity,
        revenue: data.revenue,
        orders: data.orders.size
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  async getOrderStatusDistribution(range: DateRange, customStart?: Date, customEnd?: Date): Promise<OrderStatusDistribution[]> {
    const { start, end } = this.getDateRange(range, customStart, customEnd);

    const { data: orders } = await supabase
      .from('orders')
      .select('delivery_status, total')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    const statusData: { [key in OrderStatus]: { count: number; revenue: number } } = {
      pending: { count: 0, revenue: 0 },
      assigned: { count: 0, revenue: 0 },
      delivering: { count: 0, revenue: 0 },
      delivered: { count: 0, revenue: 0 }
    };

    orders?.forEach(order => {
      const status = order.delivery_status as OrderStatus;
      if (status in statusData) {
        statusData[status].count += 1;
        statusData[status].revenue += order.total;
      }
    });

    const totalOrders = orders?.length || 0;

    return Object.entries(statusData).map(([status, data]) => ({
      status: status as OrderStatus,
      count: data.count,
      percentage: totalOrders > 0 ? (data.count / totalOrders) * 100 : 0,
      revenue: data.revenue
    }));
  }

  async getHourlyData(date: Date): Promise<Array<{ hour: number; orders: number; revenue: number }>> {
    const startOfDayDate = startOfDay(date);
    const endOfDayDate = endOfDay(date);

    const { data: orders } = await supabase
      .from('orders')
      .select('total, created_at')
      .gte('created_at', startOfDayDate.toISOString())
      .lte('created_at', endOfDayDate.toISOString())
      .eq('approval_status', 'approved');

    const hourlyData: { [hour: number]: { orders: number; revenue: number } } = {};
    
    // Initialize all hours
    for (let i = 0; i < 24; i++) {
      hourlyData[i] = { orders: 0, revenue: 0 };
    }

    orders?.forEach(order => {
      const hour = new Date(order.created_at).getHours();
      hourlyData[hour].orders += 1;
      hourlyData[hour].revenue += order.total;
    });

    return Object.entries(hourlyData).map(([hour, data]) => ({
      hour: parseInt(hour),
      orders: data.orders,
      revenue: data.revenue
    }));
  }

  async getFullAnalytics(range: DateRange, customStart?: Date, customEnd?: Date): Promise<SalesAnalyticsData> {
    const [
      metrics,
      dailySales,
      categorySales,
      topProducts,
      orderDistribution,
      hourlyData
    ] = await Promise.all([
      this.getSalesMetrics(range, customStart, customEnd),
      this.getDailySalesData(range, customStart, customEnd),
      this.getCategorySalesData(range, customStart, customEnd),
      this.getTopProducts(range, customStart, customEnd),
      this.getOrderStatusDistribution(range, customStart, customEnd),
      this.getHourlyData(new Date()) // Today's hourly data
    ]);

    return {
      metrics,
      dailySales,
      categorySales,
      topProducts,
      orderDistribution,
      hourlyData
    };
  }

  // Real-time subscription for live updates
  subscribeToOrderUpdates(callback: () => void) {
    const subscription = supabase
      .channel('orders_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'orders' },
        callback
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }
}

export const salesAnalytics = new SalesAnalyticsService();
