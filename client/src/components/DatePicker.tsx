import { useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface DatePickerProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  maxDate?: Date;
  minDate?: Date;
}

export default function DatePicker({ selectedDate, onDateChange, maxDate = new Date(), minDate }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const previousMonth = () => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() - 1);
    if (minDate && newDate < minDate) return;
    onDateChange(newDate);
  };

  const nextMonth = () => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() + 1);
    if (maxDate && newDate > maxDate) return;
    onDateChange(newDate);
  };

  const selectDate = (day: number) => {
    const newDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
    if (maxDate && newDate > maxDate) return;
    if (minDate && newDate < minDate) return;
    onDateChange(newDate);
    setIsOpen(false);
  };

  const daysInMonth = getDaysInMonth(selectedDate);
  const firstDay = getFirstDayOfMonth(selectedDate);
  const monthName = selectedDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const isToday = (day: number) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (day: number) => {
    return (
      day === selectedDate.getDate() &&
      selectedDate.getMonth() === selectedDate.getMonth() &&
      selectedDate.getFullYear() === selectedDate.getFullYear()
    );
  };

  const isDisabled = (day: number) => {
    const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
    if (maxDate && date > maxDate) return true;
    if (minDate && date < minDate) return true;
    return false;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
      >
        <Calendar className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-medium">{formatDate(selectedDate)}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4 w-72">
          <div className="flex items-center justify-between mb-4">
            <button onClick={previousMonth} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-semibold">{monthName}</span>
            <button onClick={nextMonth} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="text-xs font-medium text-gray-500 text-center py-1">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              return (
                <button
                  key={day}
                  onClick={() => selectDate(day)}
                  disabled={isDisabled(day)}
                  className={cn(
                    'w-8 h-8 text-sm rounded-lg flex items-center justify-center transition',
                    isSelected(day)
                      ? 'bg-groww-primary text-white'
                      : isToday(day)
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700',
                    isDisabled(day) && 'opacity-30 cursor-not-allowed'
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
