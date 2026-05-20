import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, Maximize2, Minimize2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { serverApi } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

interface SSHTerminalProps {
  serverId: string;
  serverIp: string;
  sshConfig: {
    host?: string;
    port?: string;
    username?: string;
    password?: string;
    key_path?: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SSHTerminal: React.FC<SSHTerminalProps> = ({
  serverId,
  serverIp,
  sshConfig,
  open,
  onOpenChange,
}) => {
  const { user } = useAuth();
  const token = user?.token;
  
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [output, setOutput] = useState<string>('');
  const [currentCommand, setCurrentCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isMaximized, setIsMaximized] = useState(false);
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  // Focus input when terminal opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Connect to SSH when dialog opens
  useEffect(() => {
    if (open && !connected && !connecting && token) {
      connectSSH();
    }
  }, [open, token]);

  // Poll for output when connected
  useEffect(() => {
    if (connected && sessionId && token) {
      outputIntervalRef.current = setInterval(async () => {
        try {
          const response = await serverApi.sshGetOutput(sessionId, token);
          if (response.success && response.data) {
            if (response.data.output) {
              setOutput(prev => prev + response.data.output);
            }
            if (!response.data.connected) {
              setConnected(false);
              setSessionId(null);
            }
          }
        } catch (error) {
          console.error('Error fetching SSH output:', error);
        }
      }, 500);
    } else if (outputIntervalRef.current) {
      clearInterval(outputIntervalRef.current);
      outputIntervalRef.current = null;
    }

    return () => {
      if (outputIntervalRef.current) {
        clearInterval(outputIntervalRef.current);
      }
    };
  }, [connected, sessionId, token]);

  const connectSSH = async () => {
    if (!token) return;
    
    setConnecting(true);
    setOutput('Connecting to SSH...\n');
    
    try {
      const response = await serverApi.sshConnect(serverId, sshConfig, token);
      if (response.success && response.data) {
        setSessionId(response.data.session_id);
        setConnected(true);
        setOutput(prev => prev + `Connected to ${serverIp}\n`);
      } else {
        setOutput(prev => prev + `Connection failed: ${response.error}\n`);
      }
    } catch (error) {
      setOutput(prev => prev + `Connection error: ${error}\n`);
    } finally {
      setConnecting(false);
    }
  };

  const disconnectSSH = async () => {
    if (!token || !sessionId) return;
    
    try {
      await serverApi.sshDisconnect(sessionId, token);
    } catch (error) {
      console.error('Error disconnecting SSH:', error);
    } finally {
      setConnected(false);
      setSessionId(null);
      if (outputIntervalRef.current) {
        clearInterval(outputIntervalRef.current);
        outputIntervalRef.current = null;
      }
    }
  };

  const executeCommand = async (command: string) => {
    if (!token || !sessionId || !connected) return;
    
    // Add command to history
    if (command.trim() && !commandHistory.includes(command.trim())) {
      setCommandHistory(prev => [...prev, command.trim()]);
    }
    setHistoryIndex(-1);
    
    // Show command in output
    setOutput(prev => prev + `$ ${command}\n`);
    
    try {
      const response = await serverApi.sshExecute(sessionId, command, token);
      if (!response.success) {
        setOutput(prev => prev + `Error: ${response.error}\n`);
      }
    } catch (error) {
      setOutput(prev => prev + `Error executing command: ${error}\n`);
    }
    
    setCurrentCommand('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeCommand(currentCommand);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setCurrentCommand(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setCurrentCommand('');
        } else {
          setHistoryIndex(newIndex);
          setCurrentCommand(commandHistory[newIndex]);
        }
      }
    }
  };

  const handleClose = () => {
    if (connected) {
      disconnectSSH();
    }
    setOutput('');
    setCurrentCommand('');
    setCommandHistory([]);
    setHistoryIndex(-1);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent 
        className={`${isMaximized ? 'max-w-[95vw] max-h-[95vh]' : 'max-w-4xl max-h-[80vh]'} p-0`}
      >
        <DialogHeader className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              SSH Terminal - {serverIp}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
              <span className="text-sm text-muted-foreground">
                {connecting ? 'Connecting...' : connected ? 'Connected' : 'Disconnected'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMaximized(!isMaximized)}
                className="h-8 w-8 p-0"
              >
                {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col h-full">
          {/* Terminal Output */}
          <div 
            ref={terminalRef}
            className={`bg-black text-green-400 font-mono text-sm p-4 overflow-y-auto ${
              isMaximized ? 'h-[calc(95vh-200px)]' : 'h-96'
            }`}
            style={{ fontFamily: 'Monaco, "Lucida Console", monospace' }}
          >
            <pre className="whitespace-pre-wrap">{output}</pre>
          </div>

          {/* Command Input */}
          <div className="border-t border-border p-4">
            <div className="flex items-center gap-2">
              <span className="text-green-400 font-mono text-sm">$</span>
              <Input
                ref={inputRef}
                value={currentCommand}
                onChange={(e) => setCurrentCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={connected ? "Enter command..." : "Not connected"}
                disabled={!connected}
                className="bg-black text-green-400 border-gray-600 font-mono text-sm"
                style={{ fontFamily: 'Monaco, "Lucida Console", monospace' }}
              />
              <Button
                onClick={() => executeCommand(currentCommand)}
                disabled={!connected || !currentCommand.trim()}
                size="sm"
              >
                Execute
              </Button>
            </div>
            
            {!connected && !connecting && (
              <div className="mt-2">
                <Button onClick={connectSSH} size="sm" variant="outline">
                  Reconnect
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
