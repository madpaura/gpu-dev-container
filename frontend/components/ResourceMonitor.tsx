import React from 'react';
import { Cpu, MemoryStick, HardDrive, Thermometer } from 'lucide-react';
import { GpuIcon } from './icons/GpuIcon';
import { ResourceCard } from './ResourceCard';

interface GPUInfo {
  available: boolean;
  count?: number;
  gpus?: Array<{
    index: number;
    name: string;
    utilization: number;
    memory_used: number;
    memory_total: number;
    memory_utilization: number;
    temperature: number;
    power_draw: number;
    power_limit: number;
  }>;
  total_memory?: number;
  total_memory_used?: number;
  avg_utilization?: number;
  avg_memory_utilization?: number;
  error?: string;
}

interface ResourceMonitorProps {
  cpuUsage: number;
  cpuCores: number;
  memoryUsed: number;
  memoryTotal: number;
  memoryPercentage: number;
  diskUsed: number;
  diskTotal: number;
  diskPercentage: number;
  gpuInfo?: GPUInfo;
  isLoading?: boolean;
}

export const ResourceMonitor: React.FC<ResourceMonitorProps> = ({
  cpuUsage,
  cpuCores,
  memoryUsed,
  memoryTotal,
  memoryPercentage,
  diskUsed,
  diskTotal,
  diskPercentage,
  gpuInfo,
  isLoading = false
}) => {
  const formatBytes = (bytes: number, decimals = 1) => {
    if (bytes === 0) return '0 GB';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const formatMemory = (memory: number) => {
    if (memory < 1) return `${(memory * 1024).toFixed(0)} MB`;
    return `${memory.toFixed(1)} GB`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">System Resources</h3>
        
        {/* Main Resource Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* CPU Usage */}
          <ResourceCard
            title="CPU Usage"
            icon={<Cpu className="w-4 h-4" />}
            value={`${cpuUsage.toFixed(1)}%`}
            percentage={cpuUsage}
            color="blue"
            tooltip={`${cpuCores} cores available`}
            additionalInfo={`${cpuCores} cores total`}
            isLoading={isLoading}
          />

          {/* Memory Usage */}
          <ResourceCard
            title="Memory Usage"
            icon={<MemoryStick className="w-4 h-4" />}
            value={`${formatMemory(memoryUsed)} / ${formatMemory(memoryTotal)}`}
            percentage={memoryPercentage}
            color="purple"
            tooltip={`${memoryPercentage.toFixed(1)}% of total memory used`}
            isLoading={isLoading}
          />

          {/* Disk Usage */}
          <ResourceCard
            title="Disk Usage"
            icon={<HardDrive className="w-4 h-4" />}
            value={`${formatMemory(diskUsed)} / ${formatMemory(diskTotal)}`}
            percentage={diskPercentage}
            color="yellow"
            tooltip={`${diskPercentage.toFixed(1)}% of disk space used`}
            isLoading={isLoading}
          />

          {/* GPU Usage */}
          {gpuInfo?.available ? (
            <ResourceCard
              title="GPU Usage"
              icon={<GpuIcon className="w-4 h-4" />}
              value={`${gpuInfo.avg_utilization?.toFixed(1) || 0}%`}
              percentage={gpuInfo.avg_utilization || 0}
              color="green"
              tooltip={`${gpuInfo.count} GPU${gpuInfo.count !== 1 ? 's' : ''} available`}
              additionalInfo={`${gpuInfo.count} GPU${gpuInfo.count !== 1 ? 's' : ''} detected`}
              isLoading={isLoading}
            />
          ) : (
            <div className="bg-card rounded-lg p-4 border border-border opacity-60">
              <div className="flex items-center gap-2 mb-3">
                <GpuIcon className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-muted-foreground">GPU Usage</span>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Not Available</div>
                <div className="text-xs text-muted-foreground">
                  {gpuInfo?.error === 'nvidia-smi not found' ? 'No NVIDIA GPU detected' : 'GPU monitoring unavailable'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* GPU Details Section */}
        {gpuInfo?.available && gpuInfo.gpus && gpuInfo.gpus.length > 0 && (
          <div className="bg-card rounded-lg p-4 border border-border">
            <div className="flex items-center gap-2 mb-4">
              <GpuIcon className="w-4 h-4 text-green-500" />
              <span className="text-sm font-medium">GPU Details</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {gpuInfo.gpus.map((gpu, index) => (
                <div key={index} className="bg-background rounded-lg p-3 border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{gpu.name}</span>
                    <span className="text-xs text-muted-foreground">GPU {gpu.index}</span>
                  </div>
                  
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Utilization:</span>
                      <span className={`font-medium ${gpu.utilization > 80 ? 'text-red-500' : gpu.utilization > 50 ? 'text-yellow-500' : 'text-green-500'}`}>
                        {gpu.utilization.toFixed(1)}%
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Memory:</span>
                      <span className="font-medium">
                        {gpu.memory_used.toFixed(0)} / {gpu.memory_total.toFixed(0)} MB ({gpu.memory_utilization.toFixed(1)}%)
                      </span>
                    </div>
                    
                    {gpu.temperature > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Temperature:</span>
                        <span className={`font-medium ${gpu.temperature > 80 ? 'text-red-500' : gpu.temperature > 70 ? 'text-yellow-500' : 'text-green-500'}`}>
                          {gpu.temperature}°C
                        </span>
                      </div>
                    )}
                    
                    {gpu.power_draw > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Power:</span>
                        <span className="font-medium">
                          {gpu.power_draw.toFixed(0)} / {gpu.power_limit.toFixed(0)} W
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {/* GPU Summary */}
            <div className="mt-4 pt-4 border-t border-border">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div className="text-center">
                  <div className="text-muted-foreground">Total Memory</div>
                  <div className="font-medium">{(gpuInfo.total_memory || 0).toFixed(0)} MB</div>
                </div>
                <div className="text-center">
                  <div className="text-muted-foreground">Memory Used</div>
                  <div className="font-medium">{(gpuInfo.total_memory_used || 0).toFixed(0)} MB</div>
                </div>
                <div className="text-center">
                  <div className="text-muted-foreground">Avg Utilization</div>
                  <div className="font-medium">{(gpuInfo.avg_utilization || 0).toFixed(1)}%</div>
                </div>
                <div className="text-center">
                  <div className="text-muted-foreground">Avg Memory</div>
                  <div className="font-medium">{(gpuInfo.avg_memory_utilization || 0).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
