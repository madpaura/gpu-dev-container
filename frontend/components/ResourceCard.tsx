import React from 'react';
import { ProgressBar } from './ui/progress-bar';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip';

interface ResourceCardProps {
  title: string;
  icon: React.ReactNode;
  value: string;
  percentage: number;
  maxValue?: number;
  color?: string;
  tooltip?: string;
  additionalInfo?: string;
  isLoading?: boolean;
}

export const ResourceCard: React.FC<ResourceCardProps> = ({
  title,
  icon,
  value,
  percentage,
  maxValue,
  color = 'blue',
  tooltip,
  additionalInfo,
  isLoading = false
}) => {
  const getColorClasses = (color: string) => {
    switch (color) {
      case 'green':
        return 'text-green-500';
      case 'purple':
        return 'text-purple-500';
      case 'yellow':
        return 'text-yellow-500';
      case 'orange':
        return 'text-orange-500';
      case 'red':
        return 'text-red-500';
      default:
        return 'text-blue-500';
    }
  };

  const getStatusColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-orange-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`bg-card rounded-lg p-4 border border-border transition-all duration-200 hover:bg-accent ${isLoading ? 'animate-pulse' : ''}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={getColorClasses(color)}>
                {icon}
              </div>
              <span className="text-xs text-muted-foreground font-medium">{title}</span>
              <div className={`w-2 h-2 rounded-full ml-auto ${getStatusColor(percentage)}`}></div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold">{value}</span>
                <span className="text-xs text-muted-foreground">{percentage.toFixed(1)}%</span>
              </div>
              
              <ProgressBar 
                value={percentage} 
                max={100} 
                size="md"
                className={percentage >= 90 ? 'bg-red-500' : percentage >= 75 ? 'bg-orange-500' : ''}
              />
              
              {additionalInfo && (
                <div className="text-xs text-muted-foreground mt-2">
                  {additionalInfo}
                </div>
              )}
            </div>
          </div>
        </TooltipTrigger>
        {tooltip && (
          <TooltipContent side="top">
            <span className="text-xs">{tooltip}</span>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
};
