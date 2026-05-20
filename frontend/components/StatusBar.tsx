import React from 'react';
import { Monitor, Cpu, MemoryStick, HardDrive, Activity, Wifi, GitBranch } from 'lucide-react';
import { UserServicesDataFlat } from '../lib/api';

interface StatusBarProps {
  userServices?: UserServicesDataFlat;
  containerAction?: string | null;
  sidebarCollapsed?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({ userServices, containerAction, sidebarCollapsed = false }) => {
  const formatUptime = (uptime: string) => {
    return uptime || '0h 0m';
  };

  const getContainerStatusInfo = () => {
    if (!userServices?.container) {
      return { status: 'No Container', color: 'text-gray-500', bgColor: 'bg-gray-500' };
    }

    const status = userServices.container.status;
    switch (status) {
      case 'running':
        return { status: 'Running', color: 'text-green-400', bgColor: 'bg-green-500' };
      case 'stopped':
        return { status: 'Stopped', color: 'text-red-400', bgColor: 'bg-red-500' };
      case 'starting':
        return { status: 'Starting', color: 'text-yellow-400', bgColor: 'bg-yellow-500' };
      default:
        return { status: 'Unknown', color: 'text-gray-400', bgColor: 'bg-gray-500' };
    }
  };

  const containerInfo = getContainerStatusInfo();
  const serverStats = userServices?.server_stats;

  return (
    <div className={`fixed bottom-0 left-0 right-0 h-6 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs flex items-center justify-between px-4 border-t border-slate-300 dark:border-slate-700 z-50 transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
      {/* Left side - Container and Server Info */}
      <div className="flex items-center gap-4">
        {/* Container Status */}
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full ${containerInfo.bgColor}`}></div>
          <span className="font-medium">{containerInfo.status}</span>
          {containerAction && (
            <span className="text-slate-500 dark:text-slate-400">({containerAction}...)</span>
          )}
        </div>

        {/* Server Info */}
        {userServices?.container?.server && userServices.container.server !== 'NA' && (
          <div className="flex items-center gap-1">
            <Monitor className="w-3 h-3" />
            <span>{userServices.container.server}</span>
          </div>
        )}

        {/* Container Name */}
        {userServices?.container?.name && userServices.container.name !== 'NA' && (
          <div className="flex items-center gap-1">
            <GitBranch className="w-3 h-3" />
            <span className="truncate max-w-32">{userServices.container.name}</span>
          </div>
        )}
      </div>

      {/* Right side - System Stats */}
      <div className="flex items-center gap-4">
        {/* Running Containers */}
        {serverStats && (
          <div className="flex items-center gap-1">
            <Activity className="w-3 h-3" />
            <span>{serverStats.running_containers} containers</span>
          </div>
        )}

        {/* CPU Usage */}
        {serverStats && (
          <div className="flex items-center gap-1">
            <Cpu className="w-3 h-3" />
            <span>{serverStats.host_cpu_used?.toFixed(1)}%</span>
          </div>
        )}

        {/* Memory Usage */}
        {serverStats && (
          <div className="flex items-center gap-1">
            <MemoryStick className="w-3 h-3" />
            <span>{serverStats.host_memory_used?.toFixed(1)}GB</span>
          </div>
        )}

        {/* Disk Usage */}
        {serverStats && (
          <div className="flex items-center gap-1">
            <HardDrive className="w-3 h-3" />
            <span>{((serverStats.used_disk / serverStats.total_disk) * 100).toFixed(1)}%</span>
          </div>
        )}

        {/* Uptime */}
        {serverStats?.uptime && (
          <div className="flex items-center gap-1">
            <Activity className="w-3 h-3" />
            <span>{formatUptime(serverStats.uptime)}</span>
          </div>
        )}

        {/* Connection Status */}
        <div className="flex items-center gap-1">
          <Wifi className="w-3 h-3" />
          <span>{userServices?.nginx_available ? 'Connected' : 'Offline'}</span>
        </div>
      </div>
    </div>
  );
};
