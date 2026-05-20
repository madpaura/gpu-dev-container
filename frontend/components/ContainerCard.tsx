
import React from 'react';
import { Play, Square, RotateCcw, Trash2, MoreVertical } from 'lucide-react';

interface ContainerCardProps {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'stopped' | 'paused';
  ports: string[];
  created: string;
  cpuUsage?: number;
  memoryUsage?: number;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onDelete: () => void;
  showActions?: boolean;
}

export const ContainerCard: React.FC<ContainerCardProps> = ({
  id,
  name,
  image,
  status,
  ports,
  created,
  cpuUsage = 0,
  memoryUsage = 0,
  onStart,
  onStop,
  onRestart,
  onDelete,
  showActions = true
}) => {
  const statusColors = {
    running: 'bg-green-500/20 text-green-400 border-green-500/30',
    stopped: 'bg-red-500/20 text-red-400 border-red-500/30',
    paused: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  };

  return (
    <div className="bg-card backdrop-blur-sm border border-border rounded-xl p-6 hover:border-accent transition-all duration-200">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-foreground mb-1">{name}</h3>
          <p className="text-sm text-muted-foreground mb-2">{image}</p>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-xs font-medium rounded-full border ${statusColors[status]}`}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
            {ports.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Ports: {ports.join(', ')}
              </span>
            )}
          </div>
        </div>
        {showActions && (
          <div className="flex items-center gap-2">
            <button
              onClick={onStart}
              disabled={status === 'running'}
              className="p-2 text-green-400 hover:bg-green-500/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
            </button>
            <button
              onClick={onStop}
              disabled={status === 'stopped'}
              className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Square className="w-4 h-4" />
            </button>
            <button
              onClick={onRestart}
              className="p-2 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">CPU Usage</span>
          <span className="text-foreground">{cpuUsage.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(cpuUsage, 100)}%` }}
          />
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Memory Usage</span>
          <span className="text-foreground">{memoryUsage.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className="bg-gradient-to-r from-green-500 to-teal-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(memoryUsage, 100)}%` }}
          />
        </div>

        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">Created: {created}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">ID: {id.substring(0, 12)}...</p>
        </div>
      </div>
    </div>
  );
};
