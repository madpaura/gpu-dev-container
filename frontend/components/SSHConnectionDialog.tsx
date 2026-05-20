import React, { useState } from 'react';
import { Terminal, Key } from 'lucide-react';
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
import { ServerInfo } from '../lib/api';

interface SSHConnectionDialogProps {
  server: ServerInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (sshConfig: {
    host: string;
    port: string;
    username: string;
    password: string;
    key_path: string;
  }) => void;
}

export const SSHConnectionDialog: React.FC<SSHConnectionDialogProps> = ({
  server,
  open,
  onOpenChange,
  onConnect,
}) => {
  const [sshConfig, setSshConfig] = useState({
    host: server?.ip || '',
    port: '22',
    username: 'vishwa',
    password: '12qwaszx',
    key_path: '',
  });

  const [usePassword, setUsePassword] = useState(true);

  // Update host when server changes
  React.useEffect(() => {
    if (server) {
      setSshConfig(prev => ({ ...prev, host: server.ip }));
    }
  }, [server]);

  const handleConnect = () => {
    onConnect(sshConfig);
    onOpenChange(false);
  };

  if (!server) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            SSH Connection - {server.id}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ssh-host">Host</Label>
              <Input
                id="ssh-host"
                value={sshConfig.host}
                onChange={(e) => setSshConfig({ ...sshConfig, host: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ssh-port">Port</Label>
              <Input
                id="ssh-port"
                value={sshConfig.port}
                onChange={(e) => setSshConfig({ ...sshConfig, port: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ssh-username">Username</Label>
            <Input
              id="ssh-username"
              value={sshConfig.username}
              onChange={(e) => setSshConfig({ ...sshConfig, username: e.target.value })}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="use-password"
                name="auth-method"
                checked={usePassword}
                onChange={() => setUsePassword(true)}
                className="rounded border-border"
              />
              <Label htmlFor="use-password">Use Password</Label>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="use-key"
                name="auth-method"
                checked={!usePassword}
                onChange={() => setUsePassword(false)}
                className="rounded border-border"
              />
              <Label htmlFor="use-key">Use SSH Key</Label>
            </div>
          </div>

          {usePassword ? (
            <div className="space-y-2">
              <Label htmlFor="ssh-password">Password</Label>
              <Input
                id="ssh-password"
                type="password"
                value={sshConfig.password}
                onChange={(e) => setSshConfig({ ...sshConfig, password: e.target.value })}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="ssh-keypath">SSH Key Path</Label>
              <Input
                id="ssh-keypath"
                value={sshConfig.key_path}
                onChange={(e) => setSshConfig({ ...sshConfig, key_path: e.target.value })}
                placeholder="~/.ssh/id_rsa"
              />
            </div>
          )}

          <div className="bg-muted/30 p-3 rounded-lg">
            <div className="text-sm text-muted-foreground mb-2">Quick Connect Presets:</div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSshConfig({
                  host: server.ip,
                  port: '22',
                  username: 'vishwa',
                  password: '12qwaszx',
                  key_path: '',
                })}
              >
                vishwa@{server.ip}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSshConfig({
                  host: server.ip,
                  port: '22',
                  username: 'root',
                  password: '',
                  key_path: '~/.ssh/id_rsa',
                })}
              >
                root (key)
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConnect} className="flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
