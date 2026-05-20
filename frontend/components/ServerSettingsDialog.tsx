import React, { useState } from 'react';
import { Settings, Terminal, Key, Network, HardDrive, Shield } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { ServerInfo } from '../lib/api';
import { SSHTerminal } from './SSHTerminal';

interface ServerSettingsDialogProps {
  server: ServerInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (serverId: string, settings: any) => void;
}

export const ServerSettingsDialog: React.FC<ServerSettingsDialogProps> = ({
  server,
  open,
  onOpenChange,
  onSave,
}) => {
  const [sshSettings, setSshSettings] = useState({
    host: server?.ip || '',
    port: '22',
    username: 'root',
    keyPath: '~/.ssh/id_rsa',
    password: '',
    useKey: true,
  });

  const [networkSettings, setNetworkSettings] = useState({
    hostname: server?.id || '',
    domain: 'local',
    dnsServers: '8.8.8.8, 8.8.4.4',
    gateway: '',
  });

  const [storageSettings, setStorageSettings] = useState({
    autoCleanup: true,
    maxDiskUsage: '80',
    cleanupInterval: '24',
    retentionDays: '30',
  });

  const [securitySettings, setSecuritySettings] = useState({
    firewallEnabled: true,
    allowedPorts: '22, 80, 443, 8080',
    failbanEnabled: true,
    maxLoginAttempts: '5',
  });

  const [sshTerminalOpen, setSshTerminalOpen] = useState(false);

  const handleSave = () => {
    if (!server) return;

    const settings = {
      ssh: sshSettings,
      network: networkSettings,
      storage: storageSettings,
      security: securitySettings,
    };

    onSave(server.id, settings);
    onOpenChange(false);
  };

  if (!server) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Server Settings - {server.id}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-muted/30 p-3 rounded-lg">
            <div className="text-sm text-muted-foreground">Status</div>
            <Badge 
              className={
                server.status === 'online' 
                  ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
              }
            >
              {server.status}
            </Badge>
          </div>
          <div className="bg-muted/30 p-3 rounded-lg">
            <div className="text-sm text-muted-foreground">IP Address</div>
            <div className="font-medium">{server.ip}</div>
          </div>
          <div className="bg-muted/30 p-3 rounded-lg">
            <div className="text-sm text-muted-foreground">Containers</div>
            <div className="font-medium">{server.containers}</div>
          </div>
        </div>

        <Tabs defaultValue="ssh" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="ssh" className="flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              SSH
            </TabsTrigger>
            <TabsTrigger value="network" className="flex items-center gap-2">
              <Network className="w-4 h-4" />
              Network
            </TabsTrigger>
            <TabsTrigger value="storage" className="flex items-center gap-2">
              <HardDrive className="w-4 h-4" />
              Storage
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Security
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ssh" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ssh-host">Host</Label>
                <Input
                  id="ssh-host"
                  value={sshSettings.host}
                  onChange={(e) => setSshSettings({ ...sshSettings, host: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ssh-port">Port</Label>
                <Input
                  id="ssh-port"
                  value={sshSettings.port}
                  onChange={(e) => setSshSettings({ ...sshSettings, port: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ssh-username">Username</Label>
              <Input
                id="ssh-username"
                value={sshSettings.username}
                onChange={(e) => setSshSettings({ ...sshSettings, username: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ssh-keypath">SSH Key Path</Label>
              <Input
                id="ssh-keypath"
                value={sshSettings.keyPath}
                onChange={(e) => setSshSettings({ ...sshSettings, keyPath: e.target.value })}
                placeholder="Path to SSH private key"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ssh-password">Password (if not using key)</Label>
              <Input
                id="ssh-password"
                type="password"
                value={sshSettings.password}
                onChange={(e) => setSshSettings({ ...sshSettings, password: e.target.value })}
                placeholder="Leave empty to use SSH key"
              />
            </div>
            <div className="pt-4 border-t border-border">
              <Button 
                onClick={() => setSshTerminalOpen(true)}
                className="w-full flex items-center gap-2"
                variant="outline"
              >
                <Terminal className="w-4 h-4" />
                Open SSH Terminal
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="network" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hostname">Hostname</Label>
                <Input
                  id="hostname"
                  value={networkSettings.hostname}
                  onChange={(e) => setNetworkSettings({ ...networkSettings, hostname: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">Domain</Label>
                <Input
                  id="domain"
                  value={networkSettings.domain}
                  onChange={(e) => setNetworkSettings({ ...networkSettings, domain: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dns-servers">DNS Servers</Label>
              <Input
                id="dns-servers"
                value={networkSettings.dnsServers}
                onChange={(e) => setNetworkSettings({ ...networkSettings, dnsServers: e.target.value })}
                placeholder="Comma-separated DNS servers"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gateway">Gateway</Label>
              <Input
                id="gateway"
                value={networkSettings.gateway}
                onChange={(e) => setNetworkSettings({ ...networkSettings, gateway: e.target.value })}
                placeholder="Default gateway IP"
              />
            </div>
          </TabsContent>

          <TabsContent value="storage" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="max-disk-usage">Max Disk Usage (%)</Label>
                <Input
                  id="max-disk-usage"
                  value={storageSettings.maxDiskUsage}
                  onChange={(e) => setStorageSettings({ ...storageSettings, maxDiskUsage: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cleanup-interval">Cleanup Interval (hours)</Label>
                <Input
                  id="cleanup-interval"
                  value={storageSettings.cleanupInterval}
                  onChange={(e) => setStorageSettings({ ...storageSettings, cleanupInterval: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="retention-days">Log Retention (days)</Label>
              <Input
                id="retention-days"
                value={storageSettings.retentionDays}
                onChange={(e) => setStorageSettings({ ...storageSettings, retentionDays: e.target.value })}
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="auto-cleanup"
                checked={storageSettings.autoCleanup}
                onChange={(e) => setStorageSettings({ ...storageSettings, autoCleanup: e.target.checked })}
                className="rounded border-border"
              />
              <Label htmlFor="auto-cleanup">Enable automatic cleanup</Label>
            </div>
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="allowed-ports">Allowed Ports</Label>
              <Input
                id="allowed-ports"
                value={securitySettings.allowedPorts}
                onChange={(e) => setSecuritySettings({ ...securitySettings, allowedPorts: e.target.value })}
                placeholder="Comma-separated port numbers"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-login-attempts">Max Login Attempts</Label>
              <Input
                id="max-login-attempts"
                value={securitySettings.maxLoginAttempts}
                onChange={(e) => setSecuritySettings({ ...securitySettings, maxLoginAttempts: e.target.value })}
              />
            </div>
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="firewall-enabled"
                  checked={securitySettings.firewallEnabled}
                  onChange={(e) => setSecuritySettings({ ...securitySettings, firewallEnabled: e.target.checked })}
                  className="rounded border-border"
                />
                <Label htmlFor="firewall-enabled">Enable firewall</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="failban-enabled"
                  checked={securitySettings.failbanEnabled}
                  onChange={(e) => setSecuritySettings({ ...securitySettings, failbanEnabled: e.target.checked })}
                  className="rounded border-border"
                />
                <Label htmlFor="failban-enabled">Enable fail2ban</Label>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
      
      <SSHTerminal
        serverId={server.id}
        serverIp={server.ip}
        sshConfig={{
          host: sshSettings.host,
          port: sshSettings.port,
          username: sshSettings.username,
          password: sshSettings.password,
          key_path: sshSettings.keyPath,
        }}
        open={sshTerminalOpen}
        onOpenChange={setSshTerminalOpen}
      />
    </Dialog>
  );
};
