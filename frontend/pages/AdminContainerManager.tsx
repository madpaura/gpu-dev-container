import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { containerApi, ContainerInfo, ContainerListResponse } from '@/lib/container-api';
import { serverApi, ServerInfo } from '@/lib/api';
import { 
  Search, 
  RefreshCw, 
  Play, 
  Square, 
  RotateCcw, 
  Trash2, 
  Server, 
  Container, 
  Cpu, 
  MemoryStick, 
  Network, 
  HardDrive,
  Clock,
  Activity,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  X
} from 'lucide-react';

function AdminContainerManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // State management
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [filteredContainers, setFilteredContainers] = useState<ContainerInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedContainer, setSelectedContainer] = useState<ContainerInfo | null>(null);
  const [showVolumeDetails, setShowVolumeDetails] = useState(false);
  
  // Container stats
  const [totalCount, setTotalCount] = useState(0);
  const [runningCount, setRunningCount] = useState(0);
  const [stoppedCount, setStoppedCount] = useState(0);
  
  // Action dialog state
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    container: ContainerInfo | null;
    action: 'start' | 'stop' | 'restart' | 'delete' | null;
  }>({
    open: false,
    container: null,
    action: null
  });
  
  // Load servers on component mount
  useEffect(() => {
    loadServers();
  }, []);
  
  // Load containers when server is selected
  useEffect(() => {
    if (selectedServer) {
      loadContainers();
    }
  }, [selectedServer]);
  
  // Filter and sort containers
  useEffect(() => {
    let filtered = containers;
    
    // Apply search filter
    if (searchTerm.trim()) {
      filtered = containers.filter(container =>
        container.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        container.image.toLowerCase().includes(searchTerm.toLowerCase()) ||
        container.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        container.status.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Apply sorting
    if (sortBy) {
      filtered = [...filtered].sort((a, b) => {
        let aValue: any = a[sortBy as keyof ContainerInfo];
        let bValue: any = b[sortBy as keyof ContainerInfo];
        
        // Handle different data types
        if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }
        
        if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    }
    
    setFilteredContainers(filtered);
  }, [containers, searchTerm, sortBy, sortOrder]);
  
  const loadServers = async () => {
    try {
      const response = await serverApi.getServers(user?.token);
      if (response.success && response.data) {
        setServers(response.data.servers || []);
      }
    } catch (error) {
      console.error('Error loading servers:', error);
      toast({
        title: 'Error',
        description: 'Failed to load servers',
        variant: 'destructive',
      });
    }
  };
  
  const loadContainers = async () => {
    if (!selectedServer) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const serverId = selectedServer.replace(/\./g, '-');
      const response = await containerApi.getContainers(serverId, undefined, user?.token);
      
      if (response.success) {
        setContainers(response.containers);
        setTotalCount(response.total_count);
        setRunningCount(response.running_count);
        setStoppedCount(response.stopped_count);
      } else {
        setError(response.error || 'Failed to load containers');
        setContainers([]);
        setTotalCount(0);
        setRunningCount(0);
        setStoppedCount(0);
      }
    } catch (error) {
      console.error('Error loading containers:', error);
      setError(error instanceof Error ? error.message : 'Failed to load containers');
      setContainers([]);
    } finally {
      setLoading(false);
    }
  };
  
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadContainers();
    setRefreshing(false);
  };
  
  const handleContainerAction = (container: ContainerInfo, action: 'start' | 'stop' | 'restart' | 'delete') => {
    setActionDialog({
      open: true,
      container,
      action
    });
  };
  
  const confirmAction = async () => {
    if (!actionDialog.container || !actionDialog.action || !selectedServer) return;
    
    try {
      const serverId = selectedServer.replace(/\./g, '-');
      const response = await containerApi.performContainerAction(
        serverId,
        actionDialog.container.id,
        actionDialog.action,
        actionDialog.action === 'delete', // force delete
        user?.token
      );
      
      if (response.success) {
        toast({
          title: 'Success',
          description: response.message,
        });
        
        // Refresh containers list
        await loadContainers();
      } else {
        toast({
          title: 'Error',
          description: response.error || `Failed to ${actionDialog.action} container`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error(`Error performing ${actionDialog.action}:`, error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : `Failed to ${actionDialog.action} container`,
        variant: 'destructive',
      });
    } finally {
      setActionDialog({ open: false, container: null, action: null });
    }
  };
  
  const handleRemoveAllStopped = async () => {
    const stoppedContainers = containers.filter(c => c.status !== 'running');
    if (stoppedContainers.length === 0) return;
    
    try {
      const serverId = selectedServer.replace(/\./g, '-');
      let successCount = 0;
      let errorCount = 0;
      
      for (const container of stoppedContainers) {
        try {
          const response = await containerApi.performContainerAction(
            serverId,
            container.id,
            'delete',
            true,
            user?.token
          );
          
          if (response.success) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch {
          errorCount++;
        }
      }
      
      if (successCount > 0) {
        toast({
          title: 'Success',
          description: `Removed ${successCount} stopped container${successCount !== 1 ? 's' : ''}${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
        });
      }
      
      if (errorCount > 0 && successCount === 0) {
        toast({
          title: 'Error',
          description: `Failed to remove ${errorCount} container${errorCount !== 1 ? 's' : ''}`,
          variant: 'destructive',
        });
      }
      
      // Refresh containers list
      await loadContainers();
    } catch (error) {
      console.error('Error removing stopped containers:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove stopped containers',
        variant: 'destructive',
      });
    }
  };
  
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };
  
  const getSortIcon = (column: string) => {
    if (sortBy !== column) return <ArrowUpDown className="h-4 w-4" />;
    return sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };
  
  const handleVolumeClick = (container: ContainerInfo) => {
    setSelectedContainer(container);
    setShowVolumeDetails(true);
  };
  
  const getStatusBadge = (status: string) => {
    const statusColors = {
      running: 'bg-green-500',
      exited: 'bg-gray-500',
      stopped: 'bg-red-500',
      paused: 'bg-yellow-500',
      restarting: 'bg-blue-500',
    };
    
    return (
      <Badge className={`${statusColors[status as keyof typeof statusColors] || 'bg-gray-500'} text-white`}>
        {status}
      </Badge>
    );
  };
  
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  const formatMemory = (mb: number) => {
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
  };
  
  const getActionButton = (container: ContainerInfo, action: 'start' | 'stop' | 'restart' | 'delete') => {
    const isRunning = container.status === 'running';
    
    const buttonConfigs = {
      start: {
        icon: Play,
        variant: 'outline' as const,
        disabled: isRunning,
        className: 'text-green-600 hover:text-green-700'
      },
      stop: {
        icon: Square,
        variant: 'outline' as const,
        disabled: !isRunning,
        className: 'text-yellow-600 hover:text-yellow-700'
      },
      restart: {
        icon: RotateCcw,
        variant: 'outline' as const,
        disabled: false,
        className: 'text-blue-600 hover:text-blue-700'
      },
      delete: {
        icon: Trash2,
        variant: 'outline' as const,
        disabled: false,
        className: 'text-red-600 hover:text-red-700'
      }
    };
    
    const config = buttonConfigs[action];
    const Icon = config.icon;
    
    return (
      <Button
        variant={config.variant}
        size="sm"
        disabled={config.disabled}
        className={config.className}
        onClick={() => handleContainerAction(container, action)}
      >
        <Icon className="h-4 w-4" />
      </Button>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Container Manager</h1>
          <p className="text-muted-foreground">
            Manage Docker containers across your infrastructure
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing || !selectedServer}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Server Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Server className="h-5 w-5 mr-2" />
            Server Selection
          </CardTitle>
          <CardDescription>
            Select a server to view and manage its containers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedServer} onValueChange={setSelectedServer}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Select a server..." />
            </SelectTrigger>
            <SelectContent>
              {servers.map((server) => (
                <SelectItem key={server.id} value={server.ip}>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${
                      server.status === 'online' ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                    <span>{server.ip}</span>
                    <span className="text-muted-foreground">
                      ({server.status})
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedServer && (
        <>
          {/* Container Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Containers</CardTitle>
                <Container className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalCount}</div>
                <p className="text-xs text-muted-foreground">
                  All containers on server
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Running</CardTitle>
                <Activity className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{runningCount}</div>
                <p className="text-xs text-muted-foreground">
                  Active containers
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Stopped</CardTitle>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-red-600">{stoppedCount}</div>
                    <p className="text-xs text-muted-foreground">
                      Inactive containers
                    </p>
                  </div>
                  {stoppedCount > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveAllStopped}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remove All
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Containers Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Containers</CardTitle>
                  <CardDescription>
                    {filteredContainers.length} of {totalCount} containers
                    {searchTerm && ` matching "${searchTerm}"`}
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search containers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-64"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  Loading containers...
                </div>
              ) : error ? (
                <div className="flex items-center justify-center py-8 text-red-600">
                  <AlertCircle className="h-6 w-6 mr-2" />
                  {error}
                </div>
              ) : filteredContainers.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Container className="h-6 w-6 mr-2" />
                  {searchTerm ? 'No containers match your search' : 'No containers found'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Image</TableHead>
                        <TableHead>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSort('status')}
                            className="h-auto p-0 font-semibold hover:bg-transparent"
                          >
                            Status
                            {getSortIcon('status')}
                          </Button>
                        </TableHead>
                        <TableHead>
                          <div className="flex items-center">
                            <Cpu className="h-4 w-4 mr-1" />
                            CPU %
                          </div>
                        </TableHead>
                        <TableHead>
                          <div className="flex items-center">
                            <MemoryStick className="h-4 w-4 mr-1" />
                            Memory
                          </div>
                        </TableHead>
                        <TableHead>
                          <div className="flex items-center">
                            <Network className="h-4 w-4 mr-1" />
                            Network
                          </div>
                        </TableHead>
                        <TableHead>
                          <div className="flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            Uptime
                          </div>
                        </TableHead>
                        <TableHead>Ports</TableHead>
                        <TableHead>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto p-0 font-semibold hover:bg-transparent cursor-pointer"
                          >
                            Volumes
                          </Button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredContainers.map((container) => (
                        <TableRow key={container.id}>
                          <TableCell className="font-medium">
                            <div className="space-y-2">
                              <div>
                                <div className="font-semibold">{container.name}</div>
                                <div className="text-xs text-muted-foreground font-mono">
                                  {container.id.substring(0, 12)}
                                </div>
                              </div>
                              <div className="flex items-center space-x-1">
                                {getActionButton(container, 'start')}
                                {getActionButton(container, 'stop')}
                                {getActionButton(container, 'restart')}
                                {getActionButton(container, 'delete')}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-xs truncate" title={container.image}>
                              {container.image}
                            </div>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(container.status)}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {container.cpu_usage.toFixed(1)}%
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{formatMemory(container.memory_used_mb)}</div>
                              <div className="text-xs text-muted-foreground">
                                {container.memory_usage.toFixed(1)}%
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs">
                              <div>↓ {formatBytes(container.network_rx_bytes)}</div>
                              <div>↑ {formatBytes(container.network_tx_bytes)}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{container.uptime}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs space-y-1">
                              {container.ports.slice(0, 2).map((port, idx) => (
                                <div key={idx} className="font-mono">
                                  {port.host_port ? `${port.host_port}:${port.container_port}` : port.container_port}
                                </div>
                              ))}
                              {container.ports.length > 2 && (
                                <div className="text-muted-foreground">
                                  +{container.ports.length - 2} more
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleVolumeClick(container)}
                              className="h-auto p-1 text-xs hover:bg-blue-50"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              {container.volumes.length} volume{container.volumes.length !== 1 ? 's' : ''}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Action Confirmation Dialog */}
      <AlertDialog open={actionDialog.open} onOpenChange={(open) => 
        setActionDialog({ open, container: null, action: null })
      }>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirm {actionDialog.action?.charAt(0).toUpperCase()}{actionDialog.action?.slice(1)} Container
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {actionDialog.action} container "{actionDialog.container?.name}"?
              {actionDialog.action === 'delete' && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-800">
                  <strong>Warning:</strong> This action cannot be undone. The container will be permanently removed.
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAction}
              className={actionDialog.action === 'delete' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {actionDialog.action?.charAt(0).toUpperCase()}{actionDialog.action?.slice(1)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Volume Details Dialog */}
      <Dialog open={showVolumeDetails} onOpenChange={setShowVolumeDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <HardDrive className="h-5 w-5 mr-2" />
              Volume Details - {selectedContainer?.name}
            </DialogTitle>
            <DialogDescription>
              Detailed information about mounted volumes for this container
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedContainer?.volumes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <HardDrive className="h-12 w-12 mx-auto mb-2 opacity-50" />
                No volumes mounted
              </div>
            ) : (
              <div className="space-y-3">
                {selectedContainer?.volumes.map((volume, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm">Volume {index + 1}</h4>
                      <Badge variant="outline" className="text-xs">
                        {volume.type || 'bind'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-muted-foreground">Source:</span>
                        <div className="font-mono text-xs bg-gray-100 p-1 rounded mt-1 break-all">
                          {volume.source || volume.host_path || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">Destination:</span>
                        <div className="font-mono text-xs bg-gray-100 p-1 rounded mt-1 break-all">
                          {volume.destination || volume.container_path || 'N/A'}
                        </div>
                      </div>
                    </div>
                    {volume.mode && (
                      <div className="text-xs">
                        <span className="font-medium text-muted-foreground">Mode:</span>
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {volume.mode}
                        </Badge>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminContainerManager;
