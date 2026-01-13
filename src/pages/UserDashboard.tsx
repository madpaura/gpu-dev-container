import React, { useState, useEffect } from 'react';
import { Terminal, RefreshCw, Play, RotateCcw, BookOpen, Copy, Check, FileText, RefreshCcw, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { VSCodeIcon } from '../components/icons/VSCodeIcon';
import { JupyterIcon } from '../components/icons/JupyterIcon';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../components/ui/tooltip';
import { StatusBar } from '../components/StatusBar';
import { LogsWindow } from '../components/LogsWindow';
import { ResourceMonitor } from '../components/ResourceMonitor';
import { userServicesApi, UserServicesDataFlat, GPUInfo } from '../lib/api';
import { useSidebar } from '../hooks/useSidebar';
import { API_ENDPOINTS, getEndpointUrl } from '../config/endpoints';
import { Button } from '../components/ui/button';

interface SystemStats {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
  };
  host: {
    cpuUsage: number;
    memoryUsage: number;
    loadAverage: number;
    swapUsage: number;
  };
}

interface Application {
  id: string;
  name: string;
  icon: React.ComponentType<any>;
  status: 'running' | 'stopped' | 'starting';
  port?: number;
  url?: string;
  description: string;
}

export const UserDashboard: React.FC = () => {
  const { user } = useAuth();
  const { collapsed } = useSidebar();
  const [stats, setStats] = useState<SystemStats>({
    cpu: { usage: 0, cores: 0 },
    memory: { used: 0, total: 0, percentage: 0 },
    disk: { used: 0, total: 0, percentage: 0 },
    host: {
      cpuUsage: 0,
      memoryUsage: 0,
      loadAverage: 0,
      swapUsage: 0
    }
  });

  const [userServices, setUserServices] = useState<UserServicesDataFlat | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [containerAction, setContainerAction] = useState<string | null>(null);
  const [logsWindowOpen, setLogsWindowOpen] = useState(false);
  const [logsWindowMinimized, setLogsWindowMinimized] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);
  const [showRecreateModal, setShowRecreateModal] = useState(false);
  const [recreateWithWipe, setRecreateWithWipe] = useState(false);

  // Fetch user services data on component mount
  useEffect(() => {
    const fetchUserServices = async () => {
      if (!user?.token) return;

      try {
        setLoading(true);
        setError(null);
        const response = await userServicesApi.getUserServices(user.token);

        if (response.success && response.data) {
          console.log('UserDashboard: Raw response.data:', response.data);

          // Check if data is already the correct structure or needs unwrapping
          const userData = (response.data as any).data
            ? (response.data as any).data as UserServicesDataFlat
            : response.data as unknown as UserServicesDataFlat;

          console.log('UserDashboard: Processed userData:', userData);
          setUserServices(userData);

          // Update stats with real server data if available
          if (userData && userData.server_stats) {
            const serverStats = userData.server_stats;
            setStats({
              cpu: {
                usage: serverStats.host_cpu_used || 0,
                cores: serverStats.cpu_count || 0
              },
              memory: {
                used: serverStats.host_memory_used || 0,
                total: serverStats.total_memory || 0,
                percentage: serverStats.total_memory > 0 ?
                  (serverStats.host_memory_used / serverStats.total_memory) * 100 : 0
              },
              disk: {
                used: serverStats.used_disk || 0,
                total: serverStats.total_disk || 0,
                percentage: serverStats.total_disk > 0 ?
                  (serverStats.used_disk / serverStats.total_disk) * 100 : 0
              },
              host: {
                cpuUsage: serverStats.host_cpu_used || 0,
                memoryUsage: serverStats.total_memory > 0 ?
                  (serverStats.host_memory_used / serverStats.total_memory) * 100 : 0,
                loadAverage: 0, // Not available in current server_stats
                swapUsage: 0 // Not available in current server_stats
              }
            });
          }
        } else {
          setError(response.error || 'Failed to fetch user services');
        }
      } catch (err) {
        setError('Failed to fetch user services');
        console.error('Error fetching user services:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserServices();
  }, [user?.token]);

  // Build applications array from backend data
  const applications: Application[] = [
    {
      id: 'code-server',
      name: 'code-server',
      icon: VSCodeIcon,
      status: userServices?.services?.vscode?.available ? userServices.services.vscode.status : 'stopped',
      port: 8081,
      url: userServices?.services?.vscode?.url || undefined,
      description: 'VS Code in the browser'
    },
    {
      id: 'jupyter',
      name: 'Jupyter Notebook',
      icon: JupyterIcon,
      status: userServices?.services?.jupyter?.available ? userServices.services.jupyter.status : 'stopped',
      port: 8888,
      url: userServices?.services?.jupyter?.url || undefined,
      description: 'Python data science environment'
    },
    {
      id: 'ollama',
      name: 'Ollama API',
      icon: BookOpen,
      status: 'running',
      url: API_ENDPOINTS.ollama.documentation,
      description: `${API_ENDPOINTS.ollama.description} - Endpoint: ${API_ENDPOINTS.ollama.url}`
    }
  ];

  const handleApplicationClick = (app: Application) => {
    if (app.status === 'running' && app.url) {
      window.open(app.url, '_blank');
    }
  };

  const handleCopyEndpoint = async (endpointKey: string) => {
    try {
      const url = getEndpointUrl(endpointKey);
      await navigator.clipboard.writeText(url);
      setCopiedEndpoint(endpointKey);
      setTimeout(() => setCopiedEndpoint(null), 2000);
    } catch (err) {
      console.error('Failed to copy endpoint:', err);
    }
  };

  const handleViewNotebook = (endpointKey: string) => {
    if (!user?.name) return;

    // Check if Jupyter is available
    const jupyterService = userServices?.services?.jupyter;
    if (!jupyterService?.available || jupyterService.status !== 'running') {
      setError('Jupyter service is not available. Please start your container first.');
      return;
    }

    // Construct the notebook URL based on user and endpoint
    const username = user.name;
    const notebookUrl = `${window.location.protocol}//${window.location.hostname}/user/${username}/jupyter/lab/tree/workspace/${endpointKey}/${endpointKey}-api-sample.ipynb`;

    window.open(notebookUrl, '_blank');
  };

  const handleRefresh = async () => {
    if (!user?.token) return;

    try {
      setLoading(true);
      setError(null);
      const response = await userServicesApi.getUserServices(user.token);

      if (response.success && response.data) {
        // Check if data is already the correct structure or needs unwrapping
        const userData = (response.data as any).data
          ? (response.data as any).data as UserServicesDataFlat
          : response.data as unknown as UserServicesDataFlat;

        setUserServices(userData);

        // Update stats with real server data if available
        if (userData && userData.server_stats) {
          const serverStats = userData.server_stats;
          setStats({
            cpu: {
              usage: serverStats.host_cpu_used || 0,
              cores: serverStats.cpu_count || 0
            },
            memory: {
              used: serverStats.host_memory_used || 0,
              total: serverStats.total_memory || 0,
              percentage: serverStats.total_memory > 0 ?
                (serverStats.host_memory_used / serverStats.total_memory) * 100 : 0
            },
            disk: {
              used: serverStats.used_disk || 0,
              total: serverStats.total_disk || 0,
              percentage: serverStats.total_disk > 0 ?
                (serverStats.used_disk / serverStats.total_disk) * 100 : 0
            },
            host: {
              cpuUsage: serverStats.host_cpu_used || 0,
              memoryUsage: serverStats.total_memory > 0 ?
                (serverStats.host_memory_used / serverStats.total_memory) * 100 : 0,
              loadAverage: 0, // Not available in current server_stats
              swapUsage: 0 // Not available in current server_stats
            }
          });
        }
      } else {
        setError(response.error || 'Failed to fetch user services');
      }
    } catch (err) {
      setError('Failed to fetch user services');
      console.error('Error fetching user services:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleContainerAction = async (action: 'start' | 'restart') => {
    if (!user?.token) return;

    try {
      setContainerAction(action);
      setError(null);

      const response = action === 'start'
        ? await userServicesApi.startContainer(user.token)
        : await userServicesApi.restartContainer(user.token);

      if (response.success) {
        // Refresh data after successful action
        await handleRefresh();
      } else {
        setError(response.error || `Failed to ${action} container`);
      }
    } catch (err) {
      setError(`Failed to ${action} container`);
      console.error(`Error ${action}ing container:`, err);
    } finally {
      setContainerAction(null);
    }
  };

  const handleRecreateContainer = async (wipeData: boolean) => {
    if (!user?.token) return;

    try {
      setContainerAction('recreate');
      setError(null);
      setShowRecreateModal(false);

      const response = await userServicesApi.recreateContainer(user.token, wipeData);

      if (response.success) {
        // Show success message
        const message = wipeData
          ? 'Container recreated successfully with fresh data!'
          : 'Container recreated successfully with your data preserved!';
        // Refresh data after successful action
        await handleRefresh();
        // Could add a toast notification here if available
        console.log(message);
      } else {
        setError(response.error || 'Failed to recreate container');
      }
    } catch (err) {
      setError('Failed to recreate container');
      console.error('Error recreating container:', err);
    } finally {
      setContainerAction(null);
      setRecreateWithWipe(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-green-500';
      case 'stopped':
        return 'bg-red-500';
      case 'starting':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const formatBytes = (bytes: number, decimals = 1) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pb-8 p-6 mb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${userServices?.container?.status === 'running' ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-lg font-medium">Dashboard</span>
            {loading && <span className="text-xs text-muted-foreground">Loading...</span>}
          </div>
          <div className="flex items-center gap-4">
            {error && (
              <button
                onClick={handleRefresh}
                className="text-xs text-red-500 hover:text-red-400"
              >
                Retry
              </button>
            )}

            {/* Container Management Buttons */}
            {userServices?.container?.name && userServices.container.name !== 'NA' && (
              <div className="flex items-center gap-2">
                {userServices.container.status !== 'running' && (
                  <button
                    onClick={() => handleContainerAction('start')}
                    disabled={containerAction === 'start' || loading}
                    className="flex items-center gap-1 px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {containerAction === 'start' ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                    Start
                  </button>
                )}

                <button
                  onClick={() => handleContainerAction('restart')}
                  disabled={containerAction === 'restart' || loading}
                  className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {containerAction === 'restart' ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3 h-3" />
                  )}
                  Restart
                </button>

                <button
                  onClick={() => setShowRecreateModal(true)}
                  disabled={containerAction === 'recreate' || loading}
                  className="flex items-center gap-1 px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {containerAction === 'recreate' ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCcw className="w-3 h-3" />
                  )}
                  Recreate
                </button>
              </div>
            )}

            <button
              onClick={handleRefresh}
              className="text-muted-foreground hover:text-foreground"
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-red-700 dark:text-red-300 text-sm">{error}</span>
              <button
                onClick={handleRefresh}
                className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 text-xs"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Applications Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {applications.map((app) => {
            const isAvailable = app.status === 'running' && app.url;
            const isLoading = loading && !userServices;

            return (
              <TooltipProvider delayDuration={200} key={app.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      onClick={() => !isLoading && handleApplicationClick(app)}
                      className={`
                      relative bg-card rounded-lg p-4 border border-border transition-all duration-200
                      ${isAvailable ? 'hover:bg-accent cursor-pointer' : 'opacity-60 cursor-not-allowed'}
                      ${isLoading ? 'animate-pulse' : ''}
                    `}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`p-2 rounded ${isAvailable ? 'bg-primary' : 'bg-gray-400'}`}>
                          <app.icon className={`w-5 h-5 ${isAvailable ? 'text-primary-foreground' : 'text-gray-600'}`} />
                        </div>
                        <div className={`w-2 h-2 rounded-full ${getStatusColor(app.status)}`}></div>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-medium text-sm">{app.name}</h3>
                        {app.id === 'ollama' && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewNotebook('ollama');
                              }}
                              className="p-1 hover:bg-accent rounded transition-colors"
                              title="View sample notebook"
                            >
                              <FileText className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyEndpoint('ollama');
                              }}
                              className="p-1 hover:bg-accent rounded transition-colors"
                              title="Copy API endpoint"
                            >
                              {copiedEndpoint === 'ollama' ? (
                                <Check className="w-3 h-3 text-green-500" />
                              ) : (
                                <Copy className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{app.description}</p>
                      {!isAvailable && !isLoading && (
                        <div className="absolute inset-0 bg-gray-900/20 rounded-lg flex items-center justify-center">
                          <span className="text-xs text-gray-500 font-medium">
                            {userServices?.container?.status === 'running' ? 'Service Unavailable' :
                              userServices?.container?.status === 'stopped' ? 'Container Stopped' :
                                userServices?.container?.status === 'exited' ? 'Container Exited' :
                                  'Container Not Running'}
                          </span>
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <span className="font-mono text-xs">
                      {isAvailable ? app.url : 'URL unavailable'}
                    </span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>

        {/* Resource Monitoring */}
        <div className="mb-6">
          <ResourceMonitor
            cpuUsage={stats.cpu.usage}
            cpuCores={stats.cpu.cores}
            memoryUsed={stats.memory.used}
            memoryTotal={stats.memory.total}
            memoryPercentage={stats.memory.percentage}
            diskUsed={stats.disk.used}
            diskTotal={stats.disk.total}
            diskPercentage={stats.disk.percentage}
            gpuInfo={userServices?.server_stats?.gpu_info}
            isLoading={loading}
          />
        </div>

        {/* Logs Section */}
        <div className="bg-card rounded-lg border border-border">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Logs</span>
            </div>
            <button
              onClick={() => {
                setLogsWindowOpen(true);
                setLogsWindowMinimized(false);
              }}
              className="text-xs text-primary hover:text-primary/80"
            >
              Open logs window
            </button>
          </div>
          <div className="p-4">
            <div className="font-mono text-xs text-muted-foreground space-y-1">
              <div className="text-center py-4">
                <button
                  onClick={() => {
                    setLogsWindowOpen(true);
                    setLogsWindowMinimized(false);
                  }}
                  className="text-primary hover:text-primary/80"
                >
                  Click to open real-time logs window
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Bar - Fixed at Bottom */}
      <StatusBar userServices={userServices} containerAction={containerAction} sidebarCollapsed={collapsed} />

      {/* Logs Window */}
      {logsWindowOpen && (
        <LogsWindow
          isMinimized={logsWindowMinimized}
          onMinimize={() => setLogsWindowMinimized(!logsWindowMinimized)}
          onClose={() => setLogsWindowOpen(false)}
        />
      )}

      {/* Recreate Container Modal */}
      {showRecreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-purple-500/10 to-blue-500/10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/20">
                  <RefreshCcw className="w-5 h-5 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold">Recreate Container</h3>
              </div>
              <button
                onClick={() => setShowRecreateModal(false)}
                className="p-1 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <p className="text-muted-foreground text-sm">
                Choose how you want to recreate your container:
              </p>

              {/* Option 1: Keep Data */}
              <button
                onClick={() => handleRecreateContainer(false)}
                disabled={containerAction === 'recreate'}
                className="w-full p-4 rounded-lg border-2 border-border hover:border-blue-500 hover:bg-blue-500/5 transition-all text-left group"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20 group-hover:bg-blue-500/30 transition-colors">
                    <RotateCcw className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground mb-1">Keep My Data</h4>
                    <p className="text-xs text-muted-foreground">
                      Recreate the container while preserving all your workspace files, projects, and settings.
                    </p>
                  </div>
                </div>
              </button>

              {/* Option 2: Fresh Start */}
              <button
                onClick={() => handleRecreateContainer(true)}
                disabled={containerAction === 'recreate'}
                className="w-full p-4 rounded-lg border-2 border-border hover:border-orange-500 hover:bg-orange-500/5 transition-all text-left group"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/20 group-hover:bg-orange-500/30 transition-colors">
                    <AlertTriangle className="w-5 h-5 text-orange-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground mb-1">Fresh Start</h4>
                    <p className="text-xs text-muted-foreground">
                      Recreate the container and wipe all data. Your workspace will be reset to default state.
                    </p>
                    <div className="mt-2 flex items-center gap-1.5 text-orange-400 text-xs font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      <span>This action cannot be undone</span>
                    </div>
                  </div>
                </div>
              </button>
            </div>

            {/* Modal Footer */}
            <div className="px-6 pb-6">
              <button
                onClick={() => setShowRecreateModal(false)}
                className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
