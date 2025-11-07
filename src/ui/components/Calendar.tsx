import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CalendarProps {
  selectedDate: string; // YYYY-MM-DD format
  onDateSelect: (date: string) => void;
  highlightedDates?: string[]; // Array of dates with activity in YYYY-MM-DD format
  className?: string;
}

export default function Calendar({ 
  selectedDate, 
  onDateSelect, 
  highlightedDates = [],
  className 
}: CalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // Keep calendar view in sync when selectedDate changes externally
  useEffect(() => {
    if (!selectedDate) return;
    const d = new Date(selectedDate);
    if (!isNaN(d.getTime())) {
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [selectedDate]);
  
  // Parse selected date
  const selectedDateObj = new Date(selectedDate);
  
  // Get month/year for current view
  const currentYear = currentMonth.getFullYear();
  const currentMonthIndex = currentMonth.getMonth();
  
  // Get first day of month and number of days
  const firstDayOfMonth = new Date(currentYear, currentMonthIndex, 1);
  const lastDayOfMonth = new Date(currentYear, currentMonthIndex + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday
  
  // Generate calendar days
  const calendarDays = [];
  
  // Add empty cells for days before the first day of the month
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(null);
  }
  
  // Add days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }
  
  // Navigation functions
  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentYear, currentMonthIndex - 1, 1));
  };
  
  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentYear, currentMonthIndex + 1, 1));
  };
  
  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    onDateSelect(today.toISOString().split('T')[0]);
  };
  
  // Handle date selection
  const handleDateClick = (day: number) => {
    const dateString = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onDateSelect(dateString);
  };
  
  // Check if a date has activity
  const hasActivity = (day: number) => {
    const dateString = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return highlightedDates.includes(dateString);
  };
  
  // Check if a date is selected
  const isSelected = (day: number) => {
    const dateString = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return dateString === selectedDate;
  };
  
  // Check if a date is today
  const isToday = (day: number) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      currentMonthIndex === today.getMonth() &&
      currentYear === today.getFullYear()
    );
  };
  
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  // Build a year range based on highlightedDates if provided, otherwise around current year
  const { minYear, maxYear } = useMemo(() => {
    let minY = currentYear - 5;
    let maxY = currentYear + 1;
    if (highlightedDates && highlightedDates.length > 0) {
      for (const ds of highlightedDates) {
        const y = Number(ds.slice(0, 4));
        if (!Number.isNaN(y)) {
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      // Give a small buffer
      minY = Math.min(minY, currentYear - 10);
      maxY = Math.max(maxY, currentYear + 2);
    }
    return { minYear: minY, maxYear: maxY };
  }, [highlightedDates, currentYear]);
  
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = minYear; y <= maxYear; y++) years.push(y);
    return years;
  }, [minYear, maxYear]);
  
  return (
    <div className={cn('bg-white rounded-lg border border-gray-200 shadow-sm', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <button
          onClick={goToPreviousMonth}
          className="p-1 hover:bg-gray-100 rounded-md transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        
        <div className="flex items-center gap-3">
          {/* Month selector */}
          <select
            aria-label="Select month"
            className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
            value={currentMonthIndex}
            onChange={(e) => {
              const newMonth = Number(e.target.value);
              setCurrentMonth(new Date(currentYear, newMonth, 1));
            }}
          >
            {monthNames.map((name, idx) => (
              <option key={name} value={idx}>{name}</option>
            ))}
          </select>
          {/* Year selector */}
          <select
            aria-label="Select year"
            className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
            value={currentYear}
            onChange={(e) => {
              const newYear = Number(e.target.value);
              setCurrentMonth(new Date(newYear, currentMonthIndex, 1));
            }}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={goToToday}
            className="px-2 py-1 text-xs bg-primary-100 text-primary-700 rounded-md hover:bg-primary-200 transition-colors"
          >
            Today
          </button>
        </div>
        
        <button
          onClick={goToNextMonth}
          className="p-1 hover:bg-gray-100 rounded-md transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5 text-gray-600" />
        </button>
      </div>
      
      {/* Day names header */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {dayNames.map((dayName) => (
          <div key={dayName} className="p-2 text-center text-sm font-medium text-gray-500">
            {dayName}
          </div>
        ))}
      </div>
      
      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {calendarDays.map((day, index) => {
          if (day === null) {
            return <div key={index} className="p-2" />;
          }
          
          const hasActivityForDay = hasActivity(day);
          const isSelectedDay = isSelected(day);
          const isTodayDay = isToday(day);
          
          return (
            <button
              key={index}
              onClick={() => handleDateClick(day)}
              className={cn(
                'p-2 text-sm transition-colors relative',
                'hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1',
                isSelectedDay && 'bg-primary-500 text-white hover:bg-primary-600',
                !isSelectedDay && isTodayDay && 'bg-blue-50 text-blue-700 font-semibold',
                !isSelectedDay && !isTodayDay && 'text-gray-900'
              )}
            >
              {day}
              {/* Activity indicator */}
              {hasActivityForDay && !isSelectedDay && (
                <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-red-500 rounded-full" />
              )}
              {hasActivityForDay && isSelectedDay && (
                <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
