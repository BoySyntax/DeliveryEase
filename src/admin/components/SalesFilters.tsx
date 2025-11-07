import { useState } from 'react';
import { DateRange } from '../../lib/salesAnalytics';
import { Card, CardContent } from '../../ui/components/Card';
import Button from '../../ui/components/Button';
import { Calendar, Download, RefreshCw, FileText, FileSpreadsheet } from 'lucide-react';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';

interface SalesFiltersProps {
  currentRange: DateRange;
  onRangeChange: (range: DateRange, customStart?: Date, customEnd?: Date) => void;
  onExportCSV?: () => void;
  onExportJSON?: () => void;
  onExportToday?: () => void;
  onExportThisMonth?: () => void;
  onExportDetailed?: () => void;
  onRefresh?: () => void;
  loading?: boolean;
}

const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '3m', label: 'Last 3 Months' },
  { value: '1y', label: 'Last Year' },
  { value: 'custom', label: 'Custom Range' },
];

export default function SalesFilters({
  currentRange,
  onRangeChange,
  onExportCSV,
  onExportJSON,
  onExportToday,
  onExportThisMonth,
  onExportDetailed,
  onRefresh,
  loading
}: SalesFiltersProps) {
  const [showCustomDates, setShowCustomDates] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const handleRangeChange = (range: DateRange) => {
    if (range === 'custom') {
      setShowCustomDates(true);
    } else {
      setShowCustomDates(false);
      onRangeChange(range);
    }
  };

  const applyCustomRange = () => {
    if (customStart && customEnd) {
      const startDate = new Date(customStart);
      const endDate = new Date(customEnd);
      
      if (startDate <= endDate) {
        onRangeChange('custom', startDate, endDate);
        setShowCustomDates(false);
      } else {
        alert('Start date must be before end date');
      }
    } else {
      alert('Please select both start and end dates');
    }
  };

  const cancelCustomRange = () => {
    setShowCustomDates(false);
    setCustomStart('');
    setCustomEnd('');
  };

  return (
    <div className="space-y-4">
      {/* Main Controls Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Date Range Selector */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Period:</span>
              <div className="flex flex-wrap gap-1">
                {DATE_RANGES.map((range) => (
                  <button
                    key={range.value}
                    onClick={() => handleRangeChange(range.value)}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                      currentRange === range.value && !showCustomDates
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {onRefresh && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  disabled={loading}
                  icon={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}
                >
                  Refresh
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Download Options Card */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-blue-600" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Download Sales Report</h3>
                <p className="text-xs text-gray-600">Export detailed sales data for analysis</p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* Quick Download Options */}
              {onExportToday && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onExportToday}
                  className="text-green-600 border-green-300 hover:bg-green-50"
                  icon={<FileSpreadsheet className="h-4 w-4" />}
                >
                  Today's Sales
                </Button>
              )}
              
              {onExportThisMonth && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onExportThisMonth}
                  className="text-blue-600 border-blue-300 hover:bg-blue-50"
                  icon={<FileSpreadsheet className="h-4 w-4" />}
                >
                  This Month
                </Button>
              )}

              {/* Format Options */}
              {onExportCSV && (
                <Button
                  size="sm"
                  onClick={onExportCSV}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  icon={<FileSpreadsheet className="h-4 w-4" />}
                >
                  Download CSV
                </Button>
              )}
              
              {onExportJSON && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onExportJSON}
                  className="text-gray-600 border-gray-300 hover:bg-gray-50"
                  icon={<FileText className="h-4 w-4" />}
                >
                  Download JSON
                </Button>
              )}

              {/* Detailed Export */}
              {onExportDetailed && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onExportDetailed}
                  className="text-purple-600 border-purple-300 hover:bg-purple-50"
                  icon={<FileText className="h-4 w-4" />}
                >
                  Detailed Orders
                </Button>
              )}

            </div>
          </div>
        </CardContent>
      </Card>

      {/* Custom Date Range Inputs */}
      {showCustomDates && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">From:</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  max={format(new Date(), 'yyyy-MM-dd')}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">To:</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  max={format(new Date(), 'yyyy-MM-dd')}
                  min={customStart}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={applyCustomRange}
                  disabled={!customStart || !customEnd}
                >
                  Apply
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cancelCustomRange}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
