import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

type InputProps = {
  label?: string;
  helperText?: string;
  error?: string;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  startAdornment?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>;

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      icon,
      helperText,
      error,
      className,
      fullWidth = false,
      startAdornment,
      ...props
    },
    ref
  ) => {
    return (
      <div className={cn(fullWidth && 'w-full')}>
        {label && (
          <label 
            htmlFor={props.id} 
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {startAdornment && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 select-none">
              {startAdornment}
            </span>
          )}
          <input
            ref={ref}
            className={cn(
              'block w-full',
              icon ? 'pr-10' : '', // Add right padding if icon exists
              startAdornment ? 'pl-12' : '', // Add left padding if adornment exists
              'rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm',
              error && 'border-error-300 focus:border-error-500 focus:ring-error-500',
              className
            )}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={
              (props.id ? `${props.id}-helper` : undefined) ||
              (error && props.id ? `${props.id}-error` : undefined)
            }
            {...props}
          />
          {icon && (
            <span className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
              {icon}
            </span>
          )}
        </div>
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

Input.displayName = 'Input';

export default Input;