import React from 'react';
import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  showPercentage?: boolean;
  color?: 'default' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const getColorClasses = (color: string, value: number, max: number) => {
  const percentage = (value / max) * 100;
  
  if (color === 'default') {
    if (percentage >= 80) return 'bg-red-500';
    if (percentage >= 60) return 'bg-yellow-500';
    return 'bg-green-500';
  }
  
  switch (color) {
    case 'success':
      return 'bg-green-500';
    case 'warning':
      return 'bg-yellow-500';
    case 'danger':
      return 'bg-red-500';
    default:
      return 'bg-primary';
  }
};

const getSizeClasses = (size: string) => {
  switch (size) {
    case 'sm':
      return 'h-1';
    case 'lg':
      return 'h-3';
    default:
      return 'h-2';
  }
};

export function ProgressBar({
  value,
  max = 100,
  className,
  showPercentage = false,
  color = 'default',
  size = 'md'
}: ProgressBarProps) {
  const percentage = Math.min((value / max) * 100, 100);
  const colorClass = getColorClasses(color, value, max);
  const sizeClass = getSizeClasses(size);

  return (
    <div className={cn('w-full', className)}>
      <div className={cn(
        'relative w-full overflow-hidden rounded-full bg-secondary',
        sizeClass
      )}>
        <div
          className={cn('h-full transition-all duration-300 ease-in-out', colorClass)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showPercentage && (
        <div className="mt-1 text-xs text-muted-foreground text-right">
          {percentage.toFixed(1)}%
        </div>
      )}
    </div>
  );
}
