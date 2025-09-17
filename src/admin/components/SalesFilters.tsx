import { useState } from 'react';
import { DateRange } from '../../lib/salesAnalytics';
import { Card, CardContent } from '../../ui/components/Card';
import Button from '../../ui/components/Button';
import { Calendar, Download, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

interface SalesFiltersProps {
  currentRange: DateRange;
  onRangeChange: (range: DateRange, customStart?: Date, customEnd?: Date) => void;
  onExport?: () => void;
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
  onExport,
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
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-4">
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

        </div>

        {/* Custom Date Range Inputs */}
        {showCustomDates && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
