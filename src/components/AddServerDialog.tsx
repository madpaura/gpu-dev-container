import React, { useState } from 'react';
import { Plus, Server, AlertCircle, Settings, Rocket } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { AgentSetupDialog } from './AgentSetupDialog';

interface AddServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddServer: (serverData: {
    name: string;
    ip: string;
    port: string;
    description: string;
    tags: string[];
  }) => Promise<void>;
}

export const AddServerDialog: React.FC<AddServerDialogProps> = ({
  open,
  onOpenChange,
  onAddServer,
}) => {
  const [serverData, setServerData] = useState({
    name: '',
    ip: '',
    port: '8511',
    description: '',
    tags: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'existing' | 'setup'>('existing');
  const [agentSetupOpen, setAgentSetupOpen] = useState(false);

  const resetForm = () => {
    setServerData({
      name: '',
      ip: '',
      port: '8511',
      description: '',
      tags: '',
    });
    setError('');
  };

  const validateForm = () => {
    if (!serverData.name.trim()) {
      setError('Server name is required');
      return false;
    }
    if (!serverData.ip.trim()) {
      setError('IP address is required');
      return false;
    }
    
    // Basic IP validation
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(serverData.ip.trim())) {
      setError('Please enter a valid IP address');
      return false;
    }

    const port = parseInt(serverData.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      setError('Please enter a valid port number (1-65535)');
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError('');

    try {
      const tags = serverData.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

      await onAddServer({
        name: serverData.name.trim(),
        ip: serverData.ip.trim(),
        port: serverData.port.trim(),
        description: serverData.description.trim(),
        tags,
      });

      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Failed to add server');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
      setActiveTab('existing');
    }
    onOpenChange(newOpen);
  };

  const handleAgentSetupSuccess = async (serverIp: string) => {
    // After successful agent setup, add the server to the list
    try {
      await onAddServer({
        name: `Agent Server ${serverIp}`,
        ip: serverIp,
        port: '8510',
        description: 'Deployed via Agent Setup',
        tags: ['auto-deployed'],
      });
      onOpenChange(false);
    } catch (err) {
      // Server might already be added, just close
      onOpenChange(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add New Server
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'existing' | 'setup')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="existing" className="flex items-center gap-2">
                <Server className="w-4 h-4" />
                Existing Agent
              </TabsTrigger>
              <TabsTrigger value="setup" className="flex items-center gap-2">
                <Rocket className="w-4 h-4" />
                Setup New Agent
              </TabsTrigger>
            </TabsList>

            <TabsContent value="existing" className="space-y-4 mt-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-destructive" />
                  <span className="text-sm text-destructive">{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="server-name">Server Name *</Label>
                <Input
                  id="server-name"
                  placeholder="e.g., Production Server 1"
                  value={serverData.name}
                  onChange={(e) => setServerData({ ...serverData, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="server-ip">IP Address *</Label>
                  <Input
                    id="server-ip"
                    placeholder="192.168.1.100"
                    value={serverData.ip}
                    onChange={(e) => setServerData({ ...serverData, ip: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="server-port">Agent Port</Label>
                  <Input
                    id="server-port"
                    placeholder="8510"
                    value={serverData.port}
                    onChange={(e) => setServerData({ ...serverData, port: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="server-description">Description</Label>
                <Textarea
                  id="server-description"
                  placeholder="Brief description of this server..."
                  value={serverData.description}
                  onChange={(e) => setServerData({ ...serverData, description: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="server-tags">Tags</Label>
                <Input
                  id="server-tags"
                  placeholder="production, docker (comma-separated)"
                  value={serverData.tags}
                  onChange={(e) => setServerData({ ...serverData, tags: e.target.value })}
                />
              </div>

              <div className="bg-muted/30 p-3 rounded-lg">
                <div className="text-sm text-muted-foreground mb-2">Quick Setup:</div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setServerData({
                      ...serverData,
                      name: 'Local Server',
                      ip: '127.0.0.1',
                      port: '8510',
                      tags: 'local, development',
                    })}
                  >
                    Local
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setServerData({
                      ...serverData,
                      name: 'Production Server',
                      port: '8510',
                      tags: 'production, docker',
                    })}
                  >
                    Production
                  </Button>
                </div>
              </div>

              <DialogFooter className="pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={loading} className="flex items-center gap-2">
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Server className="w-4 h-4" />
                      Add Server
                    </>
                  )}
                </Button>
              </DialogFooter>
            </TabsContent>

            <TabsContent value="setup" className="mt-4">
              <div className="space-y-4">
                <div className="bg-muted/30 p-4 rounded-lg">
                  <h3 className="font-medium mb-2 flex items-center gap-2">
                    <Rocket className="w-4 h-4" />
                    Deploy Agent to New Server
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    This wizard will help you deploy the GPU agent to a new server. It will:
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Connect via SSH to the remote server</li>
                    <li>Check prerequisites (Python, Docker, etc.)</li>
                    <li>Transfer and install the agent</li>
                    <li>Copy template files for user workspaces</li>
                    <li>Configure and start the agent service</li>
                  </ul>
                </div>

                <div className="flex justify-center">
                  <Button 
                    onClick={() => {
                      onOpenChange(false);
                      setAgentSetupOpen(true);
                    }}
                    className="flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    Start Agent Setup Wizard
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AgentSetupDialog
        open={agentSetupOpen}
        onOpenChange={setAgentSetupOpen}
        onSuccess={handleAgentSetupSuccess}
      />
    </>
  );
};
