import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

type InputProps = {
  label?: string;
  helperText?: string;
  error?: string;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>;

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      className,
      fullWidth = false,
      icon,
      iconPosition = 'left',
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
        <div className="relative">
          {icon && iconPosition === 'left' && (
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              'block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm',
              error && 'border-error-300 focus:border-error-500 focus:ring-error-500',
              icon && iconPosition === 'left' && 'pl-10',
              icon && iconPosition === 'right' && 'pr-10',
              className
            )}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={
              (props.id ? `${props.id}-helper` : undefined) ||
              (error && props.id ? `${props.id}-error` : undefined)
            }
            {...props}
          />
          {icon && iconPosition === 'right' && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400">
              {icon}
            </div>
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