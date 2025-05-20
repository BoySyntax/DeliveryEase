import { cn } from '../../lib/utils';

type LoaderProps = {
  size?: 'small' | 'medium' | 'large';
  fullScreen?: boolean;
  label?: string;
};

export default function Loader({ size = 'medium', fullScreen = false, label }: LoaderProps) {
  const sizeClasses = {
    small: 'w-4 h-4 border-2',
    medium: 'w-8 h-8 border-3',
    large: 'w-12 h-12 border-4',
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center',
        fullScreen && 'fixed inset-0 bg-white bg-opacity-80 z-50'
      )}
    >
      <div
        className={cn(
          'animate-spin rounded-full border-t-transparent border-primary-500',
          sizeClasses[size]
        )}
      />
      {label && <p className="mt-2 text-sm text-gray-600">{label}</p>}
    </div>
  );
}