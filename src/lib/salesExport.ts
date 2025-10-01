import { format } from 'date-fns';
import { SalesAnalyticsData, DateRange } from './salesAnalytics';
import { formatCurrency } from './utils';

export interface ExportOptions {
  format: 'csv' | 'json';
  includeCharts?: boolean;
}

class SalesExportService {
  private downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  private generateFilename(range: DateRange, format: string, customStart?: Date, customEnd?: Date): string {
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    let rangeString = range;
    
    if (range === 'custom' && customStart && customEnd) {
      rangeString = `${format(customStart, 'yyyy-MM-dd')}_to_${format(customEnd, 'yyyy-MM-dd')}`;
    }
    
    return `sales_report_${rangeString}_${timestamp}.${format}`;
  }

  exportToCSV(data: SalesAnalyticsData, range: DateRange, customStart?: Date, customEnd?: Date): void {
    const lines: string[] = [];
    
    // Header
    lines.push('fordaGO Sales Report');
    lines.push(`Generated on: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`);
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
    this.downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
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
