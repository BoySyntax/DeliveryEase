import { cn } from '../../lib/utils';

type CardProps = {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
};

export function Card({ children, className, hoverEffect = false }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-lg shadow-sm overflow-hidden',
        hoverEffect && 'transition-transform hover:shadow-md hover:-translate-y-1',
        className
      )}
    >
      {children}
    </div>
  );
}

type CardHeaderProps = {
  children: React.ReactNode;
  className?: string;
};

export function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div className={cn('p-4 border-b', className)}>
      {children}
    </div>
  );
}

type CardTitleProps = {
  children: React.ReactNode;
  className?: string;
};

export function CardTitle({ children, className }: CardTitleProps) {
  return (
    <h3 className={cn('text-lg font-medium', className)}>
      {children}
    </h3>
  );
}

type CardContentProps = {
  children: React.ReactNode;
  className?: string;
};

export function CardContent({ children, className }: CardContentProps) {
  return (
    <div className={cn('p-4', className)}>
      {children}
    </div>
  );
}

type CardFooterProps = {
  children: React.ReactNode;
  className?: string;
};

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={cn('p-4 border-t bg-gray-50', className)}>
      {children}
    </div>
  );
}

export default { Card, CardHeader, CardTitle, CardContent, CardFooter };