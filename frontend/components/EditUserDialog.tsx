import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Separator } from './ui/separator';
import { AdminUser, ServerForUsers, adminApi } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { CheckCircle, XCircle, Server, Cpu, HardDrive, Zap, Loader2 } from 'lucide-react';

interface EditUserDialogProps {
  user: AdminUser | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (userId: string, userData: Partial<AdminUser>) => Promise<void>;
  onApprove?: (userId: string, serverAssignment: string, resources: ResourceAllocation) => Promise<void>;
  onCreate?: (userData: {
    name: string;
    email: string;
    password?: string;
    role: string;
    status: string;
    server: string;
    resources: ResourceAllocation;
  }) => Promise<void>;
  mode?: 'edit' | 'create';
}

interface ResourceAllocation {
  cpu: string;
  ram: string;
  gpu: string;
}

const resourcePresets = {
  basic: { cpu: '2 cores', ram: '4GB', gpu: '0 cores, 0GB' },
  standard: { cpu: '4 cores', ram: '8GB', gpu: '1 core, 12GB' },
  premium: { cpu: '8 cores', ram: '16GB', gpu: '2 cores, 24GB' },
  custom: { cpu: '', ram: '', gpu: '' }
};

// Server options will be fetched from API

export const EditUserDialog: React.FC<EditUserDialogProps> = ({
  user,
  isOpen,
  onClose,
  onSave,
  onApprove,
  onCreate,
  mode = 'edit'
}) => {
  const { user: currentUser } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: '',
    status: '',
    password: ''
  });
  
  const [selectedServer, setSelectedServer] = useState('');
  const [resourcePreset, setResourcePreset] = useState<keyof typeof resourcePresets>('standard');
  const [customResources, setCustomResources] = useState<ResourceAllocation>(resourcePresets.standard);
  const [isLoading, setIsLoading] = useState(false);
  const [servers, setServers] = useState<ServerForUsers[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);

  // Fetch servers when dialog opens
  useEffect(() => {
    if (isOpen && currentUser?.token) {
      fetchServers();
    }
  }, [isOpen, currentUser?.token]);

  const fetchServers = async () => {
    if (!currentUser?.token) return;
    
    setLoadingServers(true);
    try {
      const response = await adminApi.getServersForUsers(currentUser.token);
      if (response.success && response.data) {
        setServers(response.data.servers);
      }
    } catch (error) {
      console.error('Failed to fetch servers:', error);
    } finally {
      setLoadingServers(false);
    }
  };

  useEffect(() => {
    if (mode === 'create') {
      // Reset form for create mode
      setFormData({
        name: '',
        email: '',
        role: 'User',
        status: 'Stopped',
        password: ''
      });
      setSelectedServer(servers.length > 0 ? servers[0].id : '');
      setResourcePreset('standard');
      setCustomResources(resourcePresets.standard);
    } else if (user) {
      setFormData({
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        password: ''
      });
      
      // Set default server based on current assignment
      const currentServer = servers.find(s => s.name === user.server || s.ip === user.server);
      setSelectedServer(currentServer?.id || (servers.length > 0 ? servers[0].id : ''));
      
      // Set resources based on current allocation
      const currentResources = { cpu: user.resources.cpu, ram: user.resources.ram, gpu: user.resources.gpu };
      setCustomResources(currentResources);
      
      // Try to match with a preset
      const matchingPreset = Object.entries(resourcePresets).find(([key, preset]) => 
        key !== 'custom' && 
        preset.cpu === currentResources.cpu && 
        preset.ram === currentResources.ram && 
        preset.gpu === currentResources.gpu
      );
      
      setResourcePreset(matchingPreset ? matchingPreset[0] as keyof typeof resourcePresets : 'custom');
    }
  }, [user, mode, servers]);

  const handleResourcePresetChange = (preset: keyof typeof resourcePresets) => {
    setResourcePreset(preset);
    if (preset !== 'custom') {
      setCustomResources(resourcePresets[preset]);
    }
  };

  const handleSave = async () => {
    if (mode === 'create') {
      await handleCreate();
      return;
    }
    
    if (!user) return;
    
    setIsLoading(true);
    try {
      const userData: Partial<AdminUser> = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        status: formData.status
      };
      
      await onSave(user.id, userData);
      onClose();
    } catch (error) {
      console.error('Error saving user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!onCreate) return;
    
    setIsLoading(true);
    try {
      const selectedServerData = servers.find(s => s.id === selectedServer);
      const isAdminRole = ['QVP', 'Admin'].includes(formData.role);
      
      onCreate?.({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: formData.role,
        status: isAdminRole ? 'Running' : formData.status,  // Admin/QVP users are always "Running"
        server: isAdminRole ? '' : (selectedServerData?.name || selectedServerData?.ip || 'Server 1'),
        resources: isAdminRole ? { cpu: '', ram: '', gpu: '' } : (resourcePreset === 'custom' ? customResources : resourcePresets[resourcePreset])
      });
      onClose();
    } catch (error) {
      console.error('Error creating user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!user || !onApprove) return;
    
    setIsLoading(true);
    try {
      const selectedServerData = servers.find(s => s.id === selectedServer);
      // Send just the IP address, not the server name with "Server" prefix
      const serverIp = selectedServerData?.ip || '127.0.0.1';
      onApprove(user.id, serverIp, 
                resourcePreset === 'custom' ? customResources : resourcePresets[resourcePreset]);
      onClose();
    } catch (error) {
      console.error('Error approving user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const isPendingApproval = mode === 'edit' && (user?.role === 'Pending' || user?.status === 'Stopped');
  const isCreateMode = mode === 'create';
  const selectedServerData = servers.find(s => s.id === selectedServer);
  
  // QVP and Admin users don't need container assignment
  const needsContainerAssignment = !['QVP', 'Admin'].includes(formData.role);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCreateMode ? 'Create New User' : `Edit User: ${user?.name}`}
            {isPendingApproval && (
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                Pending Approval
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter user name"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Enter email address"
                  />
                </div>
              </div>
              
              {isCreateMode && (
                <div>
                  <Label htmlFor="password">Password (optional)</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Leave empty for default password (defaultpass123)"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    If left empty, default password "defaultpass123" will be used
                  </p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="role">Role</Label>
                  <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Admin">Admin (Full Access)</SelectItem>
                      <SelectItem value="QVP">QVP (Restricted Admin)</SelectItem>
                      <SelectItem value="Developer">Developer</SelectItem>
                      <SelectItem value="User">User</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Running">Running</SelectItem>
                      <SelectItem value="Stopped">Stopped</SelectItem>
                      <SelectItem value="Error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Server Assignment - Only show for non-admin roles that need containers */}
          {needsContainerAssignment && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Server className="w-5 h-5" />
                Server Assignment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <Label htmlFor="server">Assigned Server</Label>
                <Select value={selectedServer} onValueChange={setSelectedServer} disabled={loadingServers}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingServers ? "Loading servers..." : "Select server"} />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingServers ? (
                      <SelectItem value="loading" disabled>
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Loading servers...</span>
                        </div>
                      </SelectItem>
                    ) : servers.length === 0 ? (
                      <SelectItem value="no-servers" disabled>
                        <span>No servers available</span>
                      </SelectItem>
                    ) : (
                      servers.map((server) => (
                        <SelectItem key={server.id} value={server.id}>
                          <div className="flex items-center gap-2">
                            <Server className="w-4 h-4" />
                            <span>{server.name}</span>
                            <Badge variant={server.status === 'online' ? 'default' : 'secondary'}>
                              {server.status}
                            </Badge>
                            <Badge 
                              variant={server.availability === 'available' ? 'default' : 
                                      server.availability === 'limited' ? 'secondary' : 'destructive'}
                            >
                              {server.availability}
                            </Badge>
                            <span className="text-sm text-muted-foreground">({server.location})</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {selectedServerData && (
                  <div className="mt-2 p-3 bg-muted rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{selectedServerData.name}</span>
                      <Badge variant={selectedServerData.status === 'online' ? 'default' : 'destructive'}>
                        {selectedServerData.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Location: {selectedServerData.location}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          )}

          {/* Resource Allocation - Only show for non-admin roles that need containers */}
          {needsContainerAssignment && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Resource Allocation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="preset">Resource Preset</Label>
                <Select value={resourcePreset} onValueChange={handleResourcePresetChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic (2 CPU, 4GB RAM, No GPU)</SelectItem>
                    <SelectItem value="standard">Standard (4 CPU, 8GB RAM, 1 GPU)</SelectItem>
                    <SelectItem value="premium">Premium (8 CPU, 16GB RAM, 2 GPU)</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="cpu" className="flex items-center gap-2">
                    <Cpu className="w-4 h-4" />
                    CPU
                  </Label>
                  <Input
                    id="cpu"
                    value={customResources.cpu}
                    onChange={(e) => setCustomResources({ ...customResources, cpu: e.target.value })}
                    disabled={resourcePreset !== 'custom'}
                  />
                </div>
                <div>
                  <Label htmlFor="ram" className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4" />
                    RAM
                  </Label>
                  <Input
                    id="ram"
                    value={customResources.ram}
                    onChange={(e) => setCustomResources({ ...customResources, ram: e.target.value })}
                    disabled={resourcePreset !== 'custom'}
                  />
                </div>
                <div>
                  <Label htmlFor="gpu" className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    GPU
                  </Label>
                  <Input
                    id="gpu"
                    value={customResources.gpu}
                    onChange={(e) => setCustomResources({ ...customResources, gpu: e.target.value })}
                    disabled={resourcePreset !== 'custom'}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          
          {isPendingApproval && onApprove && (
            <Button 
              onClick={handleApprove} 
              disabled={isLoading}
              className="bg-green-600 hover:bg-green-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve & Assign
                </>
              )}
            </Button>
          )}
          
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? (isCreateMode ? 'Creating...' : 'Saving...') : (isCreateMode ? 'Create User' : 'Save Changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
