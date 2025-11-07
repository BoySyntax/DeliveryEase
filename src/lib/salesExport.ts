import { format as formatDate } from 'date-fns';
import { SalesAnalyticsData, DateRange } from './salesAnalytics';
import { formatCurrency } from './utils';
import { supabase } from './supabase';

export interface ExportOptions {
  format: 'csv' | 'json';
  includeCharts?: boolean;
}

class SalesExportService {
  private downloadFile(content: string, filename: string, mimeType: string) {
    try {
      console.log('Starting download:', { filename, contentLength: content.length, mimeType });
      
      const blob = new Blob([content], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      console.log('Link created and appended, clicking...');
      
      // Trigger download
      link.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        console.log('Download cleanup completed');
      }, 100);
      
    } catch (error) {
      console.error('Download failed:', error);
      alert('Download failed. Please try again.');
    }
  }

  private generateFilename(range: DateRange, fileFormat: string, customStart?: Date, customEnd?: Date): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let rangeString = range;
    
    if (range === 'custom' && customStart && customEnd) {
      const startStr = customStart.toISOString().slice(0, 10);
      const endStr = customEnd.toISOString().slice(0, 10);
      rangeString = `${startStr}_to_${endStr}`;
    }
    
    return `sales_report_${rangeString}_${timestamp}.${fileFormat}`;
  }

  exportToCSV(data: SalesAnalyticsData, range: DateRange, customStart?: Date, customEnd?: Date): void {
    console.log('exportToCSV called with:', { range, customStart, customEnd, dataExists: !!data });
    
    try {
      const lines: string[] = [];
      
      // Header
      lines.push('fordaGO Sales Report');
      lines.push(`Generated on: ${new Date().toLocaleString()}`);
      lines.push(`Date Range: ${this.getDateRangeString(range, customStart, customEnd)}`);
      lines.push('');
    
    // Metrics Section
    lines.push('SALES METRICS');
    lines.push('Metric,Value');
    lines.push(`Total Revenue,${data.metrics.totalRevenue}`);
    lines.push(`Total Orders,${data.metrics.totalOrders}`);
    lines.push(`Average Order Value,${data.metrics.averageOrderValue.toFixed(2)}`);
    lines.push(`Revenue Growth,${data.metrics.revenueGrowth.toFixed(2)}%`);
    lines.push(`Orders Growth,${data.metrics.ordersGrowth.toFixed(2)}%`);
    lines.push('');
    
    // Daily Sales Section
    lines.push('DAILY SALES DATA');
    lines.push('Date,Revenue,Orders');
    data.dailySales.forEach(day => {
      lines.push(`${day.date},${day.revenue},${day.orders}`);
    });
    lines.push('');
    
    // Category Sales Section
    lines.push('CATEGORY SALES');
    lines.push('Category,Revenue,Orders,Percentage');
    data.categorySales.forEach(category => {
      lines.push(`${category.category},${category.revenue},${category.orders},${category.percentage.toFixed(2)}%`);
    });
    lines.push('');
    
    // Top Products Section
    lines.push('TOP PRODUCTS');
    lines.push('Product,Quantity Sold,Revenue,Orders');
    data.topProducts.forEach(product => {
      lines.push(`"${product.product}",${product.quantity},${product.revenue},${product.orders}`);
    });
    lines.push('');
    
    // Order Status Distribution
    lines.push('ORDER STATUS DISTRIBUTION');
    lines.push('Status,Count,Percentage,Revenue');
    data.orderDistribution.forEach(status => {
      lines.push(`${status.status},${status.count},${status.percentage.toFixed(2)}%,${status.revenue}`);
    });
    lines.push('');
    
    // Hourly Data
    lines.push('HOURLY DATA (Today)');
    lines.push('Hour,Orders,Revenue');
    data.hourlyData.forEach(hour => {
      lines.push(`${hour.hour}:00,${hour.orders},${hour.revenue}`);
    });
    
      const csvContent = lines.join('\n');
      const filename = this.generateFilename(range, 'csv', customStart, customEnd);
      console.log('CSV content generated, starting download...', { filename, contentLength: csvContent.length });
      this.downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
    } catch (error) {
      console.error('Error in exportToCSV:', error);
      alert('Export failed. Please try again.');
    }
  }

  private getDateRangeString(range: DateRange, customStart?: Date, customEnd?: Date): string {
    if (range === 'custom' && customStart && customEnd) {
      return `${customStart.toISOString().slice(0, 10)} to ${customEnd.toISOString().slice(0, 10)}`;
    }
    
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    switch (range) {
      case '24h':
        return `Last 24 hours (${today})`;
      case '7d':
        return `Last 7 days (ending ${today})`;
      case '30d':
        return `Last 30 days (ending ${today})`;
      case '3m':
        return `Last 3 months (ending ${today})`;
      case '1y':
        return `Last year (ending ${today})`;
      default:
        return range;
    }
  }

  exportToJSON(data: SalesAnalyticsData, range: DateRange, customStart?: Date, customEnd?: Date): void {
    const exportData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        dateRange: range,
        customStart: customStart?.toISOString(),
        customEnd: customEnd?.toISOString(),
        source: 'fordaGO Admin Dashboard'
      },
      metrics: {
        totalRevenue: data.metrics.totalRevenue,
        totalOrders: data.metrics.totalOrders,
        averageOrderValue: data.metrics.averageOrderValue,
        revenueGrowth: data.metrics.revenueGrowth,
        ordersGrowth: data.metrics.ordersGrowth
      },
      dailySales: data.dailySales,
      categorySales: data.categorySales,
      topProducts: data.topProducts,
      orderDistribution: data.orderDistribution,
      hourlyData: data.hourlyData
    };
    
    const jsonContent = JSON.stringify(exportData, null, 2);
    const filename = this.generateFilename(range, 'json', customStart, customEnd);
    this.downloadFile(jsonContent, filename, 'application/json;charset=utf-8;');
  }

  generateSummaryReport(data: SalesAnalyticsData): string {
    const totalRevenue = formatCurrency(data.metrics.totalRevenue);
    const revenueGrowth = data.metrics.revenueGrowth >= 0 ? '↑' : '↓';
    const ordersGrowth = data.metrics.ordersGrowth >= 0 ? '↑' : '↓';
    
    const topCategory = data.categorySales[0];
    const topProduct = data.topProducts[0];
    
    return `
📊 Sales Summary Report

💰 Revenue: ${totalRevenue} (${revenueGrowth} ${Math.abs(data.metrics.revenueGrowth).toFixed(1)}%)
📦 Orders: ${data.metrics.totalOrders.toLocaleString()} (${ordersGrowth} ${Math.abs(data.metrics.ordersGrowth).toFixed(1)}%)
💵 Average Order: ${formatCurrency(data.metrics.averageOrderValue)}

🏆 Top Category: ${topCategory?.category || 'N/A'} (${formatCurrency(topCategory?.revenue || 0)})
⭐ Top Product: ${topProduct?.product || 'N/A'} (${topProduct?.quantity || 0} sold)

📈 Peak Sales Day: ${data.dailySales.reduce((max, day) => day.revenue > max.revenue ? day : max, data.dailySales[0])?.formattedDate || 'N/A'}
    `.trim();
  }

  async shareReport(data: SalesAnalyticsData, range: DateRange): Promise<void> {
    if (navigator.share) {
      const summary = this.generateSummaryReport(data);
      
      try {
        await navigator.share({
          title: 'fordaGO Sales Report',
          text: summary,
          url: window.location.href
        });
      } catch (error) {
        // Fallback to clipboard
        this.copyToClipboard(summary);
      }
    } else {
      // Fallback to clipboard
      this.copyToClipboard(this.generateSummaryReport(data));
    }
  }

  async exportDetailedOrdersCSV(range: DateRange, customStart?: Date, customEnd?: Date): Promise<void> {
    try {
      // Get date range
      const { start, end } = this.getDateRange(range, customStart, customEnd);
      
      // Fetch detailed order data
      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          total,
          delivery_status,
          approval_status,
          delivery_address,
          customer:profiles!orders_customer_id_fkey(
            name,
            phone
          ),
          items:order_items(
            quantity,
            price,
            product:products(
              name,
              categories!inner(
                name
              )
            )
          )
        `)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .eq('approval_status', 'approved')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching orders:', error);
        return;
      }

      const lines: string[] = [];
      
      // Header
      lines.push('fordaGO Detailed Sales Report');
      lines.push(`Generated on: ${new Date().toLocaleString()}`);
      lines.push(`Date Range: ${this.getDateRangeString(range, customStart, customEnd)}`);
      lines.push('');
      
      // Summary
      const totalRevenue = orders?.reduce((sum, order) => sum + order.total, 0) || 0;
      const totalOrders = orders?.length || 0;
      lines.push('SUMMARY');
      lines.push(`Total Orders,${totalOrders}`);
      lines.push(`Total Revenue,${totalRevenue}`);
      lines.push('');
      
      // Detailed Orders
      lines.push('DETAILED ORDERS');
      lines.push('Order ID,Date,Customer,Phone,Status,Total,Address,Products');
      
      orders?.forEach(order => {
        const orderDate = new Date(order.created_at).toLocaleString();
        const customerName = order.customer?.name || 'Unknown';
        const customerPhone = order.customer?.phone || 'N/A';
        const address = order.delivery_address ? 
          `${order.delivery_address.street || ''}, ${order.delivery_address.barangay || ''}, ${order.delivery_address.city || ''}`.trim() : 
          'N/A';
        
        // Format products
        const products = order.items?.map(item => 
          `${item.product.name} (${item.quantity}x ${item.price})`
        ).join('; ') || 'No products';
        
        lines.push(`"${order.id}","${orderDate}","${customerName}","${customerPhone}","${order.delivery_status}","${order.total}","${address}","${products}"`);
      });
      
      const csvContent = lines.join('\n');
      const filename = this.generateFilename(range, 'csv', customStart, customEnd).replace('sales_report', 'detailed_orders');
      this.downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
    } catch (error) {
      console.error('Error exporting detailed orders:', error);
    }
  }

  private getDateRange(range: DateRange, customStart?: Date, customEnd?: Date) {
    const now = new Date();
    
    switch (range) {
      case '24h':
        return {
          start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          end: now
        };
      case '7d':
        return {
          start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          end: now
        };
      case '30d':
        return {
          start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          end: now
        };
      case '3m':
        return {
          start: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          end: now
        };
      case '1y':
        return {
          start: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
          end: now
        };
      case 'custom':
        if (!customStart || !customEnd) {
          throw new Error('Custom date range requires start and end dates');
        }
        return {
          start: customStart,
          end: customEnd
        };
      default:
        throw new Error('Invalid date range');
    }
  }

  private copyToClipboard(text: string): void {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        alert('Report summary copied to clipboard!');
      }).catch(() => {
        this.fallbackCopyToClipboard(text);
      });
    } else {
      this.fallbackCopyToClipboard(text);
    }
  }

  private fallbackCopyToClipboard(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
      alert('Report summary copied to clipboard!');
    } catch (err) {
      alert('Could not copy to clipboard. Please copy manually.');
      console.error('Fallback copy failed:', err);
    }
    
    document.body.removeChild(textArea);
  }
}

export const salesExport = new SalesExportService();
