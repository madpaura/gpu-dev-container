import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { AlertTriangle, Container, HardDrive, Image, Network, Volume, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { serverApi, ServerInfo, CleanupSummary, CleanupOptions, CleanupResult } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

interface ServerCleanupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: ServerInfo | null;
}

interface SSHCredentials {
  username: string;
  password: string;
}

type CleanupStep = 'credentials' | 'summary' | 'options' | 'executing' | 'results';

export const ServerCleanupDialog: React.FC<ServerCleanupDialogProps> = ({
  open,
  onOpenChange,
  server
}) => {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState<CleanupStep>('credentials');
  const [credentials, setCredentials] = useState<SSHCredentials>({ username: '', password: '' });
  const [summary, setSummary] = useState<CleanupSummary | null>(null);
  const [cleanupOptions, setCleanupOptions] = useState<CleanupOptions>({
    remove_stopped_containers: false,
    remove_dangling_images: false,
    remove_unused_volumes: false,
    remove_unused_networks: false,
    docker_system_prune: false,
    remove_specific_containers: [],
    remove_specific_images: []
  });
  const [selectedContainers, setSelectedContainers] = useState<string[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CleanupResult[]>([]);
  const [progress, setProgress] = useState(0);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setCurrentStep('credentials');
      setCredentials({ username: '', password: '' });
      setSummary(null);
      setCleanupOptions({
        remove_stopped_containers: false,
        remove_dangling_images: false,
        remove_unused_volumes: false,
        remove_unused_networks: false,
        docker_system_prune: false,
        remove_specific_containers: [],
        remove_specific_images: []
      });
      setSelectedContainers([]);
      setSelectedImages([]);
      setError(null);
      setResults([]);
      setProgress(0);
    }
  }, [open]);

  const handleGetSummary = async () => {
    if (!server || !user?.token) return;

    setLoading(true);
    setError(null);

    try {
      const response = await serverApi.getCleanupSummary(user.token, server.id, {
        username: credentials.username,
        password: credentials.password
      });

      if (response.success && response.data) {
        setSummary(response.data);
        setCurrentStep('summary');
      } else {
        setError(response.error || 'Failed to get cleanup summary');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteCleanup = async () => {
    if (!server || !user?.token || !summary) return;

    setLoading(true);
    setError(null);
    setCurrentStep('executing');
    setProgress(0);

    try {
      const finalOptions: CleanupOptions = {
        ...cleanupOptions,
        remove_specific_containers: selectedContainers,
        remove_specific_images: selectedImages
      };

      const response = await serverApi.executeCleanup(user.token, server.id, {
        username: credentials.username,
        password: credentials.password,
        cleanup_options: finalOptions
      });

      if (response.success && response.data) {
        setResults(response.data.results);
        setProgress(100);
        setCurrentStep('results');
      } else {
        setError(response.error || 'Failed to execute cleanup');
      }
    } catch (err) {
      setError('Failed to execute cleanup operations');
    } finally {
      setLoading(false);
    }
  };

  const handleContainerToggle = (containerId: string) => {
    setSelectedContainers(prev => 
      prev.includes(containerId) 
        ? prev.filter(id => id !== containerId)
        : [...prev, containerId]
    );
  };

  const handleImageToggle = (imageId: string) => {
    setSelectedImages(prev => 
      prev.includes(imageId) 
        ? prev.filter(id => id !== imageId)
        : [...prev, imageId]
    );
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderCredentialsStep = () => (
    <div className="space-y-4">
      <div className="text-sm text-gray-600">
        Enter SSH credentials to connect to <strong>{server?.id}</strong> ({server?.ip}) for cleanup analysis.
      </div>
      
      <div className="space-y-4">
        <div>
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            type="text"
            value={credentials.username}
            onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
            placeholder="SSH username"
          />
        </div>
        
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={credentials.password}
            onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
            placeholder="SSH password"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button 
          onClick={handleGetSummary}
          disabled={!credentials.username || !credentials.password || loading}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Get Cleanup Summary
        </Button>
      </div>
    </div>
  );

  const renderSummaryStep = () => (
    <div className="space-y-4">
      <div className="text-sm text-gray-600">
        Cleanup analysis for <strong>{server?.id}</strong>. Review the current state before proceeding.
      </div>

      <Tabs defaultValue="containers" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="containers">
            <Container className="mr-2 h-4 w-4" />
            Containers ({(summary?.containers?.running?.length || 0) + (summary?.containers?.stopped?.length || 0)})
          </TabsTrigger>
          <TabsTrigger value="images">
            <Image className="mr-2 h-4 w-4" />
            Images ({(summary?.docker_images?.images?.length || 0) + (summary?.docker_images?.dangling_images?.length || 0)})
          </TabsTrigger>
          <TabsTrigger value="disk">
            <HardDrive className="mr-2 h-4 w-4" />
            Disk Usage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="containers" className="space-y-2">
          <div className="max-h-64 overflow-y-auto space-y-2">
            {/* Running Containers */}
            {summary?.containers?.running?.map((container) => (
              <div key={container.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="font-medium">{container.names}</div>
                  <div className="text-sm text-gray-500">
                    {container.image} • {container.status}
                  </div>
                </div>
                <Badge variant="default">
                  Running
                </Badge>
              </div>
            ))}
            {/* Stopped Containers */}
            {summary?.containers?.stopped?.map((container) => (
              <div key={container.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="font-medium">{container.names}</div>
                  <div className="text-sm text-gray-500">
                    {container.image} • {container.status}
                  </div>
                </div>
                <Badge variant="secondary">
                  Stopped
                </Badge>
              </div>
            ))}
            {/* No containers message */}
            {(!summary?.containers?.running?.length && !summary?.containers?.stopped?.length) && (
              <div className="text-center text-gray-500 py-4">
                No containers found
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="images" className="space-y-2">
          <div className="max-h-64 overflow-y-auto space-y-2">
            {/* Regular Images */}
            {summary?.docker_images?.images?.map((image) => (
              <div key={image.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="font-medium">{image.repository}:{image.tag}</div>
                  <div className="text-sm text-gray-500">
                    {image.id.substring(0, 12)} • {image.size}
                  </div>
                </div>
              </div>
            ))}
            {/* Dangling Images */}
            {summary?.docker_images?.dangling_images?.map((image) => (
              <div key={image.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="font-medium">{image.repository}:{image.tag}</div>
                  <div className="text-sm text-gray-500">
                    {image.id.substring(0, 12)} • {image.size}
                  </div>
                </div>
                <Badge variant="destructive">Dangling</Badge>
              </div>
            ))}
            {/* No images message */}
            {(!summary?.docker_images?.images?.length && !summary?.docker_images?.dangling_images?.length) && (
              <div className="text-center text-gray-500 py-4">
                No images found
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="disk" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="text-sm font-medium">Docker System Usage</div>
              <div className="text-2xl font-bold">{formatBytes(summary?.disk_usage?.docker_system_usage || 0)}</div>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="text-sm font-medium">Root Disk Usage</div>
              <div className="text-2xl font-bold">{summary?.disk_usage?.root_usage_percent || 0}%</div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setCurrentStep('credentials')}>
          Back
        </Button>
        <Button onClick={() => setCurrentStep('options')}>
          Configure Cleanup
        </Button>
      </div>
    </div>
  );

  const renderOptionsStep = () => (
    <div className="space-y-4">
      <div className="text-sm text-gray-600">
        Select cleanup operations to perform on <strong>{server?.id}</strong>.
      </div>

      <div className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="remove_stopped_containers"
              checked={cleanupOptions.remove_stopped_containers}
              onCheckedChange={(checked) => 
                setCleanupOptions(prev => ({ ...prev, remove_stopped_containers: !!checked }))
              }
            />
            <Label htmlFor="remove_stopped_containers">Remove stopped containers</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="remove_dangling_images"
              checked={cleanupOptions.remove_dangling_images}
              onCheckedChange={(checked) => 
                setCleanupOptions(prev => ({ ...prev, remove_dangling_images: !!checked }))
              }
            />
            <Label htmlFor="remove_dangling_images">Remove dangling images</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="remove_unused_volumes"
              checked={cleanupOptions.remove_unused_volumes}
              onCheckedChange={(checked) => 
                setCleanupOptions(prev => ({ ...prev, remove_unused_volumes: !!checked }))
              }
            />
            <Label htmlFor="remove_unused_volumes">Remove unused volumes</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="remove_unused_networks"
              checked={cleanupOptions.remove_unused_networks}
              onCheckedChange={(checked) => 
                setCleanupOptions(prev => ({ ...prev, remove_unused_networks: !!checked }))
              }
            />
            <Label htmlFor="remove_unused_networks">Remove unused networks</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="docker_system_prune"
              checked={cleanupOptions.docker_system_prune}
              onCheckedChange={(checked) => 
                setCleanupOptions(prev => ({ ...prev, docker_system_prune: !!checked }))
              }
            />
            <Label htmlFor="docker_system_prune">Docker system prune</Label>
          </div>
        </div>

        <div className="border-t pt-4">
          <h4 className="font-medium mb-2">Specific Containers to Remove</h4>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {/* Show stopped containers for selection */}
            {summary?.containers?.stopped?.map((container) => (
              <div key={container.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`container-${container.id}`}
                  checked={selectedContainers.includes(container.id)}
                  onCheckedChange={() => handleContainerToggle(container.id)}
                />
                <Label htmlFor={`container-${container.id}`} className="text-sm">
                  {container.names} ({container.image})
                </Label>
              </div>
            ))}
            {/* Show running containers for selection too */}
            {summary?.containers?.running?.map((container) => (
              <div key={container.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`container-${container.id}`}
                  checked={selectedContainers.includes(container.id)}
                  onCheckedChange={() => handleContainerToggle(container.id)}
                />
                <Label htmlFor={`container-${container.id}`} className="text-sm">
                  {container.names} ({container.image}) - Running
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t pt-4">
          <h4 className="font-medium mb-2">Specific Images to Remove</h4>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {/* Show regular images for selection */}
            {summary?.docker_images?.images?.map((image) => (
              <div key={image.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`image-${image.id}`}
                  checked={selectedImages.includes(image.id)}
                  onCheckedChange={() => handleImageToggle(image.id)}
                />
                <Label htmlFor={`image-${image.id}`} className="text-sm">
                  {image.repository}:{image.tag} ({image.size})
                </Label>
              </div>
            ))}
            {/* Show dangling images for selection */}
            {summary?.docker_images?.dangling_images?.map((image) => (
              <div key={image.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`image-${image.id}`}
                  checked={selectedImages.includes(image.id)}
                  onCheckedChange={() => handleImageToggle(image.id)}
                />
                <Label htmlFor={`image-${image.id}`} className="text-sm">
                  {image.repository}:{image.tag} ({image.size}) - Dangling
                </Label>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setCurrentStep('summary')}>
          Back
        </Button>
        <Button onClick={handleExecuteCleanup}>
          Execute Cleanup
        </Button>
      </div>
    </div>
  );

  const renderExecutingStep = () => (
    <div className="space-y-4">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin mb-4" />
        <div className="text-lg font-medium">Executing Cleanup Operations</div>
        <div className="text-sm text-gray-600">
          Performing cleanup on <strong>{server?.id}</strong>...
        </div>
      </div>

      <Progress value={progress} className="w-full" />

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}
    </div>
  );

  const renderResultsStep = () => (
    <div className="space-y-4">
      <div className="text-sm text-gray-600">
        Cleanup operations completed on <strong>{server?.id}</strong>.
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {results.map((result, index) => (
          <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
            {result.success ? (
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
            )}
            <div className="flex-1">
              <div className="font-medium">{result.operation}</div>
              {result.output && (
                <div className="text-sm text-gray-600 mt-1">{result.output}</div>
              )}
              {result.error && (
                <div className="text-sm text-red-600 mt-1">{result.error}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </div>
    </div>
  );

  const getStepContent = () => {
    switch (currentStep) {
      case 'credentials':
        return renderCredentialsStep();
      case 'summary':
        return renderSummaryStep();
      case 'options':
        return renderOptionsStep();
      case 'executing':
        return renderExecutingStep();
      case 'results':
        return renderResultsStep();
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Server Cleanup - {server?.id}</DialogTitle>
        </DialogHeader>
        {getStepContent()}
      </DialogContent>
    </Dialog>
  );
};
