import React, { useState, useEffect, useRef } from 'react';
import {
  Server,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Terminal,
  Settings,
  FolderOpen,
  Play,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import {
  agentDeployApi,
  DeploymentConfig,
  PrerequisiteCheck,
  DeploymentStatus,
  TemplatePath,
} from '../lib/agent-deploy-api';
import { useAuth } from '../hooks/useAuth';

interface AgentSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (serverIp: string) => void;
}

type SetupStep = 'connection' | 'prerequisites' | 'configuration' | 'deployment';

export const AgentSetupDialog: React.FC<AgentSetupDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const { user } = useAuth();
  const token = user?.token || '';

  // Form state
  const [serverIp, setServerIp] = useState('');
  const [sshUser, setSshUser] = useState('');
  const [sshPassword, setSshPassword] = useState('');
  const [sshPort, setSshPort] = useState('22');
  const [showPassword, setShowPassword] = useState(false);

  // Configuration state
  const [agentPort, setAgentPort] = useState('8510');
  const [agentInstallPath, setAgentInstallPath] = useState('/opt/gpu-agent');
  const [templateSourcePath, setTemplateSourcePath] = useState('');
  const [templateDeployPath, setTemplateDeployPath] = useState('/home/user-repo');
  const [managerIp, setManagerIp] = useState('');
  const [managerPort, setManagerPort] = useState('8500');
  const [dockerImage, setDockerImage] = useState('gpu-dev-env-test');
  const [dockerTag, setDockerTag] = useState('latest');

  // UI state
  const [currentStep, setCurrentStep] = useState<SetupStep>('connection');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Connection test state
  const [connectionTested, setConnectionTested] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    success: boolean;
    hostname?: string;
    system?: string;
    message?: string;
  } | null>(null);

  // Prerequisites state
  const [prerequisites, setPrerequisites] = useState<PrerequisiteCheck[]>([]);
  const [prerequisitesLogs, setPrerequisitesLogs] = useState<string[]>([]);
  const [prerequisitesChecked, setPrerequisitesChecked] = useState(false);

  // Template paths state
  const [templatePaths, setTemplatePaths] = useState<TemplatePath[]>([]);

  // Deployment state
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentStatus | null>(null);
  const [deploymentLogs, setDeploymentLogs] = useState<string[]>([]);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [deploymentLogs, prerequisitesLogs]);

  // Fetch template paths on open
  useEffect(() => {
    if (open && token) {
      fetchTemplatePaths();
      // Try to detect manager IP
      const currentHost = window.location.hostname;
      if (currentHost && currentHost !== 'localhost') {
        setManagerIp(currentHost);
      }
    }
  }, [open, token]);

  // Poll deployment status
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (deploymentId && deploymentStatus?.status !== 'completed' && deploymentStatus?.status !== 'failed') {
      interval = setInterval(async () => {
        const result = await agentDeployApi.getDeploymentStatus(deploymentId, token);
        if (result.success && result.status) {
          setDeploymentStatus(result.status);
          setDeploymentLogs(result.status.logs);

          if (result.status.status === 'completed' || result.status.status === 'failed') {
            if (interval) clearInterval(interval);
          }
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [deploymentId, deploymentStatus?.status, token]);

  const fetchTemplatePaths = async () => {
    const result = await agentDeployApi.getTemplatePaths(token);
    if (result.success) {
      setTemplatePaths(result.templates);
      if (result.templates.length > 0) {
        setTemplateSourcePath(result.templates[0].path);
      }
    }
  };

  const handleTestConnection = async () => {
    if (!serverIp || !sshUser || !sshPassword) {
      setError('Please fill in all connection fields');
      return;
    }

    setLoading(true);
    setError('');
    setConnectionTested(false);

    const result = await agentDeployApi.testConnection(
      {
        server_ip: serverIp,
        ssh_user: sshUser,
        ssh_password: sshPassword,
        ssh_port: parseInt(sshPort),
      },
      token
    );

    setConnectionResult(result);
    setConnectionTested(true);
    setLoading(false);

    if (!result.success) {
      setError(result.message || 'Connection failed');
    }
  };

  const handleCheckPrerequisites = async () => {
    setLoading(true);
    setError('');
    setPrerequisites([]);
    setPrerequisitesLogs([]);

    const result = await agentDeployApi.checkPrerequisites(
      {
        server_ip: serverIp,
        ssh_user: sshUser,
        ssh_password: sshPassword,
        ssh_port: parseInt(sshPort),
        docker_image: dockerImage,
      },
      token
    );

    setLoading(false);

    if (result.success) {
      setPrerequisites(result.prerequisites);
      setPrerequisitesLogs(result.logs);
      setPrerequisitesChecked(true);
    } else {
      setError(result.error || 'Failed to check prerequisites');
    }
  };

  const handleStartDeployment = async () => {
    setLoading(true);
    setError('');
    setDeploymentLogs([]);

    const config: DeploymentConfig = {
      server_ip: serverIp,
      ssh_user: sshUser,
      ssh_password: sshPassword,
      ssh_port: parseInt(sshPort),
      agent_port: parseInt(agentPort),
      agent_install_path: agentInstallPath,
      template_source_path: templateSourcePath,
      template_deploy_path: templateDeployPath,
      manager_ip: managerIp,
      manager_port: parseInt(managerPort),
      docker_image: dockerImage,
      docker_tag: dockerTag,
      service_user: sshUser,
      create_venv: true,
    };

    const result = await agentDeployApi.deploy(config, token);

    setLoading(false);

    if (result.success && result.deployment_id) {
      setDeploymentId(result.deployment_id);
      setDeploymentStatus(result.status || null);
      setDeploymentLogs(result.status?.logs || []);
      setCurrentStep('deployment');
    } else {
      setError(result.error || 'Failed to start deployment');
    }
  };

  const handleClose = () => {
    if (deploymentStatus?.status === 'completed' && onSuccess) {
      onSuccess(serverIp);
    }
    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setServerIp('');
    setSshUser('');
    setSshPassword('');
    setSshPort('22');
    setCurrentStep('connection');
    setConnectionTested(false);
    setConnectionResult(null);
    setPrerequisites([]);
    setPrerequisitesLogs([]);
    setPrerequisitesChecked(false);
    setDeploymentId(null);
    setDeploymentStatus(null);
    setDeploymentLogs([]);
    setError('');
  };

  const getPrerequisiteIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />;
    }
  };

  const canProceedToPrerequisites = connectionTested && connectionResult?.success;
  const canProceedToConfiguration = prerequisitesChecked && 
    !prerequisites.some(p => p.status === 'failed' && p.required);
  const canStartDeployment = canProceedToConfiguration && managerIp;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            Setup Agent on Remote Server
          </DialogTitle>
        </DialogHeader>

        <Tabs value={currentStep} onValueChange={(v) => setCurrentStep(v as SetupStep)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="connection" className="flex items-center gap-1">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-xs flex items-center justify-center">1</span>
              Connection
            </TabsTrigger>
            <TabsTrigger value="prerequisites" disabled={!canProceedToPrerequisites} className="flex items-center gap-1">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-xs flex items-center justify-center">2</span>
              Prerequisites
            </TabsTrigger>
            <TabsTrigger value="configuration" disabled={!canProceedToConfiguration} className="flex items-center gap-1">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-xs flex items-center justify-center">3</span>
              Configuration
            </TabsTrigger>
            <TabsTrigger value="deployment" disabled={!deploymentId} className="flex items-center gap-1">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-xs flex items-center justify-center">4</span>
              Deployment
            </TabsTrigger>
          </TabsList>

          {/* Step 1: Connection */}
          <TabsContent value="connection" className="flex-1 overflow-auto space-y-4 p-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="server-ip">Server IP Address *</Label>
                <Input
                  id="server-ip"
                  placeholder="192.168.1.100"
                  value={serverIp}
                  onChange={(e) => {
                    setServerIp(e.target.value);
                    setConnectionTested(false);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ssh-port">SSH Port</Label>
                <Input
                  id="ssh-port"
                  placeholder="22"
                  value={sshPort}
                  onChange={(e) => setSshPort(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ssh-user">SSH Username *</Label>
                <Input
                  id="ssh-user"
                  placeholder="root"
                  value={sshUser}
                  onChange={(e) => {
                    setSshUser(e.target.value);
                    setConnectionTested(false);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ssh-password">SSH Password *</Label>
                <div className="relative">
                  <Input
                    id="ssh-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={sshPassword}
                    onChange={(e) => {
                      setSshPassword(e.target.value);
                      setConnectionTested(false);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <span className="text-sm text-destructive">{error}</span>
              </div>
            )}

            {connectionResult && (
              <div className={`p-4 rounded-lg border ${connectionResult.success ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {connectionResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <span className="font-medium">
                    {connectionResult.success ? 'Connection Successful' : 'Connection Failed'}
                  </span>
                </div>
                {connectionResult.success && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Hostname:</strong> {connectionResult.hostname}</p>
                    <p className="truncate"><strong>System:</strong> {connectionResult.system}</p>
                  </div>
                )}
                {!connectionResult.success && (
                  <p className="text-sm text-red-400">{connectionResult.message}</p>
                )}
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <div className="flex gap-2">
                <Button onClick={handleTestConnection} disabled={loading || !serverIp || !sshUser || !sshPassword}>
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Terminal className="w-4 h-4 mr-2" />
                  )}
                  Test Connection
                </Button>
                {canProceedToPrerequisites && (
                  <Button onClick={() => setCurrentStep('prerequisites')}>
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Step 2: Prerequisites */}
          <TabsContent value="prerequisites" className="flex-1 overflow-hidden flex flex-col space-y-4 p-1">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Check if the remote server has all required dependencies installed.
              </p>
              <Button onClick={handleCheckPrerequisites} disabled={loading} size="sm">
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {prerequisitesChecked ? 'Re-check' : 'Check Prerequisites'}
              </Button>
            </div>

            {prerequisites.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {prerequisites.map((check, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${
                      check.status === 'passed' ? 'bg-green-500/5 border-green-500/20' :
                      check.status === 'failed' ? 'bg-red-500/5 border-red-500/20' :
                      check.status === 'warning' ? 'bg-yellow-500/5 border-yellow-500/20' :
                      'bg-muted/30 border-border'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {getPrerequisiteIcon(check.status)}
                      <span className="font-medium text-sm">{check.name}</span>
                      {check.required && <Badge variant="outline" className="text-xs">Required</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{check.message}</p>
                    {check.details && (
                      <p className="text-xs text-muted-foreground mt-1 font-mono bg-muted/50 p-1 rounded">
                        {check.details}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {prerequisitesLogs.length > 0 && (
              <div className="flex-1 min-h-0">
                <Label className="text-sm mb-2 block">Logs</Label>
                <ScrollArea className="h-32 bg-black/50 rounded-lg p-3 font-mono text-xs">
                  {prerequisitesLogs.map((log, index) => (
                    <div key={index} className="text-green-400">{log}</div>
                  ))}
                </ScrollArea>
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setCurrentStep('connection')}>
                Back
              </Button>
              {canProceedToConfiguration && (
                <Button onClick={() => setCurrentStep('configuration')}>
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </TabsContent>

          {/* Step 3: Configuration */}
          <TabsContent value="configuration" className="flex-1 overflow-auto space-y-4 p-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Agent Configuration
                </h3>
                
                <div className="space-y-2">
                  <Label htmlFor="agent-port">Agent Port</Label>
                  <Input
                    id="agent-port"
                    placeholder="8510"
                    value={agentPort}
                    onChange={(e) => setAgentPort(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agent-path">Agent Install Path</Label>
                  <Input
                    id="agent-path"
                    placeholder="/opt/gpu-agent"
                    value={agentInstallPath}
                    onChange={(e) => setAgentInstallPath(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manager-ip">Manager Server IP *</Label>
                  <Input
                    id="manager-ip"
                    placeholder="192.168.1.1"
                    value={managerIp}
                    onChange={(e) => setManagerIp(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    IP address of this management server
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manager-port">Manager Port</Label>
                  <Input
                    id="manager-port"
                    placeholder="8500"
                    value={managerPort}
                    onChange={(e) => setManagerPort(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <FolderOpen className="w-4 h-4" />
                  Template & Docker
                </h3>

                <div className="space-y-2">
                  <Label htmlFor="template-source">Template Source Path</Label>
                  {templatePaths.length > 0 ? (
                    <select
                      id="template-source"
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                      value={templateSourcePath}
                      onChange={(e) => setTemplateSourcePath(e.target.value)}
                    >
                      <option value="">Select template path...</option>
                      {templatePaths.map((tp, index) => (
                        <option key={index} value={tp.path}>
                          {tp.path} ({tp.item_count} items)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id="template-source"
                      placeholder="/home/user/template"
                      value={templateSourcePath}
                      onChange={(e) => setTemplateSourcePath(e.target.value)}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    Local path on management server
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-deploy">Template Deploy Path (Remote)</Label>
                  <Input
                    id="template-deploy"
                    placeholder="/home/user-repo"
                    value={templateDeployPath}
                    onChange={(e) => setTemplateDeployPath(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Path on remote server for user workspaces
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="docker-image">Docker Image</Label>
                    <Input
                      id="docker-image"
                      placeholder="gpu-dev-env-test"
                      value={dockerImage}
                      onChange={(e) => setDockerImage(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="docker-tag">Docker Tag</Label>
                    <Input
                      id="docker-tag"
                      placeholder="latest"
                      value={dockerTag}
                      onChange={(e) => setDockerTag(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setCurrentStep('prerequisites')}>
                Back
              </Button>
              <Button onClick={handleStartDeployment} disabled={loading || !canStartDeployment}>
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Start Deployment
              </Button>
            </div>
          </TabsContent>

          {/* Step 4: Deployment */}
          <TabsContent value="deployment" className="flex-1 overflow-hidden flex flex-col space-y-4 p-1">
            {deploymentStatus && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{deploymentStatus.current_step}</h3>
                    <p className="text-sm text-muted-foreground">
                      Status: <Badge variant={
                        deploymentStatus.status === 'completed' ? 'default' :
                        deploymentStatus.status === 'failed' ? 'destructive' :
                        'secondary'
                      }>
                        {deploymentStatus.status}
                      </Badge>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold">{deploymentStatus.progress_percent}%</span>
                  </div>
                </div>

                <Progress value={deploymentStatus.progress_percent} className="h-2" />

                {deploymentStatus.error && (
                  <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <XCircle className="w-4 h-4 text-destructive" />
                    <span className="text-sm text-destructive">{deploymentStatus.error}</span>
                  </div>
                )}

                <div className="flex-1 min-h-0">
                  <Label className="text-sm mb-2 block">Deployment Logs</Label>
                  <ScrollArea className="h-64 bg-black/80 rounded-lg p-3 font-mono text-xs">
                    {deploymentLogs.map((log, index) => (
                      <div
                        key={index}
                        className={
                          log.includes('ERROR') || log.includes('[ERR]') ? 'text-red-400' :
                          log.includes('✓') ? 'text-green-400' :
                          log.includes('⚠') ? 'text-yellow-400' :
                          log.startsWith('$') ? 'text-blue-400' :
                          'text-gray-300'
                        }
                      >
                        {log}
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </ScrollArea>
                </div>

                {deploymentStatus.status === 'completed' && (
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <span className="font-medium text-green-400">Deployment Completed!</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Agent is now running at <code className="bg-muted px-1 rounded">http://{serverIp}:{agentPort}</code>
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end pt-4">
              <Button onClick={handleClose}>
                {deploymentStatus?.status === 'completed' ? 'Done' : 'Close'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
