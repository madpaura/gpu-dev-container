
import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'gray' | 'white';
  isError?: boolean;
  isWarning?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  color = 'blue',
  isError = false,
  isWarning = false
}) => {
  const colorClasses = {
    blue: 'from-blue-500/20 to-blue-600/20 border-blue-500/30 text-blue-400',
    green: 'from-green-500/20 to-green-600/20 border-green-500/30 text-green-400',
    orange: 'from-orange-500/20 to-orange-600/20 border-orange-500/30 text-orange-400',
    red: 'from-red-500/20 to-red-600/20 border-red-500/30 text-red-400',
    purple: 'from-purple-500/20 to-purple-600/20 border-purple-500/30 text-purple-400',
    gray: 'from-gray-800/40 to-gray-900/40 border-gray-600/50 text-gray-300',
    white: 'from-gray-700/40 to-gray-800/40 border-gray-500/50 text-white',
  };

  // Determine background and border style based on error/warning state
  const getBackgroundStyle = () => {
    if (isError) return 'bg-red-500/20 border-red-500/50';
    if (isWarning) return 'bg-red-400/15 border-red-400/40';
    return `bg-gradient-to-br ${colorClasses[color]} border`;
  };

  return (
    <div className={`${getBackgroundStyle()} backdrop-blur-sm rounded-lg p-4 hover:scale-105 transition-all duration-200`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`p-2 bg-gradient-to-r ${colorClasses[color].replace('/20', '/10')} rounded-md`}>
          <Icon className="w-4 h-4" />
        </div>
        {change && (
          <span className={`text-xs font-medium ${change.startsWith('+') ? 'text-green-400' : 'text-red-400'}`}>
            {change}
          </span>
        )}
      </div>
      <h3 className="text-xs font-medium text-muted-foreground mb-1">{title}</h3>
      <p className="text-xl font-bold text-foreground">{value}</p>
    </div>
  );
};
