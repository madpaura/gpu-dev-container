import React, { useState, useEffect } from 'react';
import { Server, RefreshCw, Plus, Settings, Monitor, Play, Square, Trash2, AlertTriangle, Container, HardDrive, Terminal } from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { serverApi, ServerInfo, ServerStats } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { ServerSettingsDialog } from '../components/ServerSettingsDialog';
import { SSHTerminal } from '../components/SSHTerminal';
import { SSHConnectionDialog } from '../components/SSHConnectionDialog';
import { AddServerDialog } from '../components/AddServerDialog';
import { ServerCleanupDialog } from '../components/ServerCleanupDialog';

export const AdminServers: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const token = user?.token;
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<ServerInfo | null>(null);
  const [sshTerminalOpen, setSshTerminalOpen] = useState(false);
  const [sshServer, setSshServer] = useState<ServerInfo | null>(null);
  const [sshConnectionDialogOpen, setSshConnectionDialogOpen] = useState(false);
  const [sshConfig, setSshConfig] = useState<any>(null);
  const [addServerDialogOpen, setAddServerDialogOpen] = useState(false);
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupServer, setCleanupServer] = useState<ServerInfo | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<ServerInfo | null>(null);

  const fetchServerData = async () => {
    if (!token) return;
    
    try {
      setError(null);
      const [serversResponse, statsResponse] = await Promise.all([
        serverApi.getServers(token),
        serverApi.getServerStats(token)
      ]);

      if (serversResponse.success && serversResponse.data) {
        setServers(serversResponse.data.servers);
      } else {
        setError(serversResponse.error || 'Failed to fetch servers');
      }

      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data.stats);
      } else {
        console.warn('Failed to fetch server stats:', statsResponse.error);
      }
    } catch (err) {
      setError('Network error occurred');
      console.error('Error fetching server data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchServerData();
  };

  const handleServerAction = async (serverId: string, action: string) => {
    if (!token) return;
    
    // Handle cleanup actions by opening the cleanup dialog
    if (action === 'remove_containers' || action === 'cleanup_disk') {
      const server = servers.find(s => s.id === serverId);
      if (server) {
        setCleanupServer(server);
        setCleanupDialogOpen(true);
      }
      return;
    }
    
    // Handle delete action with confirmation
    if (action === 'delete') {
      const server = servers.find(s => s.id === serverId);
      if (server) {
        setServerToDelete(server);
        setDeleteConfirmOpen(true);
      }
      return;
    }
    
    try {
      const response = await serverApi.performServerAction(serverId, action, token);
      if (response.success) {
        await fetchServerData();
      } else {
        setError(response.error || 'Failed to perform server action');
      }
    } catch (err) {
      setError('Failed to perform server action');
      console.error('Error performing server action:', err);
    }
  };

  const handleConfirmedDelete = async () => {
    if (!token || !serverToDelete) return;
    
    try {
      const response = await serverApi.performServerAction(serverToDelete.id, 'delete', token);
      if (response.success) {
        setDeleteConfirmOpen(false);
        setServerToDelete(null);
        await fetchServerData();
        setError(null);
      } else {
        setError(response.error || 'Failed to delete server');
      }
    } catch (err) {
      setError('Failed to delete server');
      console.error('Error deleting server:', err);
    }
  };

  const handleOpenSettings = (server: ServerInfo) => {
    setSelectedServer(server);
    setSettingsDialogOpen(true);
  };

  const handleSaveSettings = async (serverId: string, settings: any) => {
    if (!token) return;
    
    try {
      // For now, just log the settings - this could be enhanced to save to backend
      console.log('Saving settings for server:', serverId, settings);
      
      // You could add an API call here to save server settings
      // const response = await serverApi.saveServerSettings(serverId, settings, token);
      
      // Show success message or handle response
      setError(null);
    } catch (err) {
      setError('Failed to save server settings');
      console.error('Error saving server settings:', err);
    }
  };

  const handleOpenSSHTerminal = (server: ServerInfo) => {
    setSshServer(server);
    setSshConnectionDialogOpen(true);
  };

  const handleSSHConnect = (config: any) => {
    setSshConfig(config);
    setSshTerminalOpen(true);
  };

  const handleAddServer = async (serverData: {
    name: string;
    ip: string;
    port: string;
    description: string;
    tags: string[];
  }) => {
    if (!token) throw new Error('No authentication token');
    
    try {
      const response = await serverApi.addServer(serverData, token);
      
      if (response.success) {
        // Refresh server data to show the new server
        await fetchServerData();
        setError(null);
      } else {
        throw new Error(response.error || 'Failed to add server');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add server');
      throw err;
    }
  };

  useEffect(() => {
    fetchServerData();
  }, [token]);

  // Convert stats to StatCard format
  const statCards = stats ? [
    { 
      title: 'Total Servers', 
      value: stats.totalServers, 
      change: stats.totalServersChange, 
      icon: Server, 
      color: 'white' as const,
      isError: stats.totalServers === 0
    },
    { 
      title: 'Online', 
      value: stats.onlineServers, 
      change: stats.onlineServersChange, 
      icon: Monitor, 
      color: 'white' as const,
      isError: stats.onlineServers === 0 && stats.totalServers > 0,
      isWarning: stats.onlineServers < stats.totalServers / 2 && stats.onlineServers > 0
    },
    { 
      title: 'Offline', 
      value: stats.offlineServers, 
      change: stats.offlineServersChange, 
      icon: AlertTriangle, 
      color: 'gray' as const,
      isError: stats.offlineServers > 0,
      isWarning: stats.offlineServers > stats.totalServers / 2
    },
    { 
      title: 'Maintenance', 
      value: stats.maintenanceServers, 
      change: stats.maintenanceServersChange, 
      icon: Settings, 
      color: 'gray' as const,
      isWarning: stats.maintenanceServers > 0
    },
  ] : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading server data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-400 mb-4">{error}</p>
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <Badge className="bg-white/10 text-white border-white/20">Online</Badge>;
      case 'offline':
        return <Badge className="bg-gray-500/10 text-gray-400 border-gray-500/20">Offline</Badge>;
      case 'maintenance':
        return <Badge className="bg-gray-300/10 text-gray-300 border-gray-300/20">Maintenance</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getServerIcon = (type: string) => {
    const iconProps = { className: "w-4 h-4" };
    switch (type) {
      case 'web':
        return <div className="w-3 h-3 bg-white rounded-sm" />;
      case 'database':
        return <div className="w-3 h-3 bg-gray-300 rounded-sm" />;
      case 'api':
        return <div className="w-3 h-3 bg-gray-500 rounded-sm" />;
      case 'cache':
        return <div className="w-3 h-3 bg-gray-700 rounded-sm" />;
      default:
        return <div className="w-3 h-3 bg-muted rounded-sm" />;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Server Management</h1>
          <p className="text-muted-foreground">Monitor and manage your server infrastructure</p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {can('add_server') && (
            <Button className="gap-2" onClick={() => setAddServerDialogOpen(true)}>
              <Plus className="w-4 h-4" />
              Add Server
            </Button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </div>


      {/* Server List */}
      <div className="bg-card backdrop-blur-sm border border-border rounded-xl p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground mb-2">Server List</h2>
          <p className="text-muted-foreground">Manage your server infrastructure</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Server</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">CPU</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Memory</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Disk</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Uptime</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {servers.map((server) => (
                <tr key={server.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {getServerIcon(server.type)}
                      <div>
                        <div className="font-medium text-foreground">{server.id}</div>
                        <div className="text-sm text-muted-foreground">{server.ip}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {server.containers} container{server.containers !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {getStatusBadge(server.status)}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Progress value={server.cpu} className="w-16 h-2" />
                      <span className="text-sm text-foreground">{server.cpu}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Progress value={server.memory} className="w-16 h-2" />
                      <span className="text-sm text-foreground">{server.memory}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Progress value={server.disk} className="w-16 h-2" />
                      <span className="text-sm text-foreground">{server.disk}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm text-foreground">{server.uptime}</span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      {can('cleanup_server') && (
                        <>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                            onClick={() => handleServerAction(server.id, 'remove_containers')}
                            title="Remove All Running Containers"
                          >
                            <Container className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                            onClick={() => handleServerAction(server.id, 'cleanup_disk')}
                            title="Clean Up Disk"
                          >
                            <HardDrive className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                        onClick={() => handleOpenSSHTerminal(server)}
                        title="SSH Into Server"
                      >
                        <Terminal className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0"
                        onClick={() => handleOpenSettings(server)}
                        title="Settings"
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                      {can('delete_server') && (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                          onClick={() => handleServerAction(server.id, 'delete')}
                          title="Delete Server"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ServerSettingsDialog
        server={selectedServer}
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
        onSave={handleSaveSettings}
      />

      {sshServer && sshConfig && (
        <SSHTerminal
          serverId={sshServer.id}
          serverIp={sshServer.ip}
          sshConfig={sshConfig}
          open={sshTerminalOpen}
          onOpenChange={setSshTerminalOpen}
        />
      )}

      <SSHConnectionDialog
        server={sshServer}
        open={sshConnectionDialogOpen}
        onOpenChange={setSshConnectionDialogOpen}
        onConnect={handleSSHConnect}
      />

      <AddServerDialog
        open={addServerDialogOpen}
        onOpenChange={setAddServerDialogOpen}
        onAddServer={handleAddServer}
      />

      <ServerCleanupDialog
        open={cleanupDialogOpen}
        onOpenChange={setCleanupDialogOpen}
        server={cleanupServer}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Server</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the server <strong>{serverToDelete?.ip}</strong>?
              This action cannot be undone and will remove the server from your infrastructure.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeleteConfirmOpen(false);
              setServerToDelete(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmedDelete}
              className="bg-gray-800 hover:bg-black text-white"
            >
              Delete Server
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};