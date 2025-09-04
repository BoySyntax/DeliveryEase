import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

type Option = {
  value: string;
  label: string;
};

type SelectProps = {
  label?: string;
  options: Option[];
  helperText?: string;
  error?: string;
  fullWidth?: boolean;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>;

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      options,
      helperText,
      error,
      className,
      fullWidth = false,
      ...props
    },
    ref
  ) => {
    return (
      <div className={cn('relative', fullWidth && 'w-full')}>
        {label && (
          <label 
            htmlFor={props.id} 
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={cn(
            'block w-full rounded-md border-2 border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm',
            error && 'border-error-300 focus:border-error-500 focus:ring-error-500',
            className
          )}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={
            (props.id ? `${props.id}-helper` : undefined) ||
            (error && props.id ? `${props.id}-error` : undefined)
          }
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {(helperText || error) && (
          <p
            id={props.id ? `${props.id}-${error ? 'error' : 'helper'}` : undefined}
            className={cn(
              'mt-1 text-sm',
              error ? 'text-error-500' : 'text-gray-500'
            )}
          >
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Select;