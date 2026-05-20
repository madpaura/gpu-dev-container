
import React from 'react';
import { Container, Play, Square, RotateCcw, Download, Settings, HelpCircle } from 'lucide-react';
import { StatCard } from '../components/StatCard';

export const UserContainers: React.FC = () => {
  const stats = [
    { title: 'Total Containers', value: 3, change: '0', icon: Container, color: 'blue' as const },
    { title: 'Running', value: 2, change: '0', icon: Play, color: 'green' as const },
    { title: 'CPU Usage', value: '45%', change: '+5%', icon: Container, color: 'orange' as const },
    { title: 'Memory Usage', value: '2.4GB', change: '+0.2GB', icon: Container, color: 'purple' as const },
  ];

  const containers = [
    {
      id: 1,
      name: 'Code Server',
      description: 'VS Code in browser',
      port: '8080',
      cpu: '23%',
      memory: '512MB',
      status: 'Running' as const,
      icon: '💻',
    },
    {
      id: 2,
      name: 'Jupyter Notebook',
      description: 'Python data science environment',
      port: '8888',
      cpu: '12%',
      memory: '1.2GB',
      status: 'Running' as const,
      icon: '📓',
    },
    {
      id: 3,
      name: 'PostgreSQL',
      description: 'Database server',
      port: '5432',
      cpu: '0%',
      memory: '0MB',
      status: 'Stopped' as const,
      icon: '🗃️',
    },
  ];

  const gpuInfo = {
    cores: 4,
    load: '78%',
    memory: '6.2GB / 8GB',
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">My Services</h1>
        <p className="text-muted-foreground">Manage your assigned containers and hosted services</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* GPU Info Card */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            ⚡ GPU Cores
          </h3>
          <div className="space-y-4">
            <div className="text-3xl font-bold text-foreground">{gpuInfo.cores}</div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">GPU Load</span>
                <span className="text-foreground font-medium">{gpuInfo.load}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full" style={{ width: gpuInfo.load }}></div>
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">GPU Memory</span>
              <span className="text-foreground font-medium">{gpuInfo.memory}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div className="bg-primary h-2 rounded-full" style={{ width: '77.5%' }}></div>
            </div>
          </div>
        </div>

        {/* Resource Usage Chart Placeholder */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Resource Usage</h3>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <div className="text-4xl mb-2">📊</div>
              <p>Resource usage chart would go here</p>
            </div>
          </div>
        </div>
      </div>

      {/* Containers List */}
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-foreground">My Services</h2>
          <button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2">
            <Container className="w-4 h-4" />
            Request New Service
          </button>
        </div>

        <div className="space-y-4">
          {containers.map((container) => (
            <div key={container.id} className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-2xl">{container.icon}</div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{container.name}</h3>
                    <p className="text-muted-foreground text-sm">{container.description}</p>
                    <p className="text-muted-foreground text-xs mt-1">
                      Port: {container.port} • CPU: {container.cpu} • Memory: {container.memory}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    container.status === 'Running' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                  }`}>
                    {container.status}
                  </span>
                  
                  <div className="flex gap-2">
                    {container.status === 'Running' && (
                      <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                    {container.status === 'Stopped' ? (
                      <button className="p-2 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors">
                        <Play className="w-4 h-4" />
                      </button>
                    ) : (
                      <button className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                        <Square className="w-4 h-4" />
                      </button>
                    )}
                    <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
