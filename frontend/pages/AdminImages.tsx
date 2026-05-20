import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Trash2, 
  RefreshCw, 
  ChevronDown, 
  ChevronRight,
  History,
  Layers,
  HardDrive,
  Calendar,
  Hash,
  Copy,
  Check
} from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { dockerApi, DockerImage as BackendDockerImage, DockerImagesResponse, ServerListItem, DockerImageDetails } from '@/lib/docker-api';

// Extended image type with server info
interface ImageWithServer extends BackendDockerImage {
  server_id: string;
  server_name: string;
}

export const AdminImages: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const [searchTerm, setSearchTerm] = useState('');
  const [images, setImages] = useState<ImageWithServer[]>([]);
  const [selectedImage, setSelectedImage] = useState<ImageWithServer | null>(null);
  const [imageDetails, setImageDetails] = useState<DockerImageDetails | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [servers, setServers] = useState<ServerListItem[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Helper to get short ID (first 12 chars after sha256:)
  const getShortId = (id: string) => {
    if (id.startsWith('sha256:')) {
      return id.substring(7, 19); // Get 12 chars after 'sha256:'
    }
    return id.substring(0, 12);
  };

  // Copy to clipboard helper (with fallback for HTTP)
  const copyToClipboard = (text: string, label: string) => {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          setCopiedText(label);
          setTimeout(() => setCopiedText(null), 2000);
        }).catch(() => {
          // Fallback if clipboard API fails
          fallbackCopy(text, label);
        });
      } else {
        // Fallback for HTTP or older browsers
        fallbackCopy(text, label);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Fallback copy method using textarea
  const fallbackCopy = (text: string, label: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2000);
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
    document.body.removeChild(textArea);
  };

  // Load servers list on component mount
  useEffect(() => {
    loadServers();
  }, []);

  // Load images when server selection changes
  useEffect(() => {
    if (servers.length > 0) {
      loadImages();
    }
  }, [selectedServer, servers]);

  const loadServers = async () => {
    if (!user?.token) return;
    
    try {
      setLoading(true);
      const response = await dockerApi.getServersList(user.token);
      if (response.success && response.data) {
        setServers(response.data.servers);
      } else {
        setError(response.error || 'Failed to load servers');
      }
    } catch (err) {
      setError('Failed to load servers');
    } finally {
      setLoading(false);
    }
  };

  const loadImages = async () => {
    if (!user?.token) return;
    
    try {
      setLoading(true);
      setError(null);
      // Clear images at the start of loading to ensure clean state
      setImages([]);
      const serverId = selectedServer === 'all' ? undefined : selectedServer;
      const response = await dockerApi.getDockerImages(user.token, serverId);
      
      if (response.success && response.data) {
        // Check if there's an error in the response data itself
        const responseData = response.data as any;
        if (responseData.error) {
          setImages([]); // Clear images first
          setError(responseData.error);
          return;
        }
        
        // Check if servers array is empty but we expected data
        if (response.data.servers.length === 0 && response.data.total_servers === 0) {
          setError('No servers available or all servers are offline');
          setImages([]);
          return;
        }
        
        // Flatten images from all servers, keeping server info
        const allImages: ImageWithServer[] = [];
        response.data.servers.forEach(serverData => {
          if (serverData.error) {
            // Individual server has an error, but continue with other servers
            console.warn(`Server ${serverData.server_id} error:`, serverData.error);
          } else if (serverData.images) {
            // Find server name from servers list
            const serverInfo = servers.find(s => s.id === serverData.server_id);
            const serverName = serverInfo?.name || serverData.server_id;
            
            // Add server info to each image
            const imagesWithServer = serverData.images.map(img => ({
              ...img,
              server_id: serverData.server_id,
              server_name: serverName
            }));
            allImages.push(...imagesWithServer);
          }
        });
        setImages(allImages);
      } else {
        setError(response.error || 'Failed to load Docker images');
        setImages([]); // Clear images on error
      }
    } catch (err) {
      setError('Failed to load Docker images');
      setImages([]); // Clear images on error
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadImages();
    setRefreshing(false);
  };

  const filteredImages = images.filter(image =>
    image.repository.toLowerCase().includes(searchTerm.toLowerCase()) ||
    image.tag.toLowerCase().includes(searchTerm.toLowerCase()) ||
    image.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleRowExpansion = (imageId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(imageId)) {
      newExpanded.delete(imageId);
    } else {
      newExpanded.add(imageId);
    }
    setExpandedRows(newExpanded);
  };

  const handleDeleteImage = async (image: ImageWithServer) => {
    if (!user?.token) return;
    
    const confirmDelete = window.confirm(
      `Are you sure you want to delete image ${image.repository}:${image.tag}?\n\nImage ID: ${getShortId(image.id)}`
    );
    
    if (!confirmDelete) return;
    
    try {
      setLoading(true);
      const response = await dockerApi.deleteDockerImage(
        image.server_id,
        image.id,
        user.token,
        false // force
      );
      
      if (response.success) {
        // Remove the deleted image from the list
        setImages(prev => prev.filter(img => !(img.id === image.id && img.server_id === image.server_id)));
        setError(null);
      } else {
        // If failed, try with force option
        const forceDelete = window.confirm(
          `Failed to delete image: ${response.error}\n\nDo you want to force delete?`
        );
        
        if (forceDelete) {
          const forceResponse = await dockerApi.deleteDockerImage(
            image.server_id,
            image.id,
            user.token,
            true // force
          );
          
          if (forceResponse.success) {
            setImages(prev => prev.filter(img => !(img.id === image.id && img.server_id === image.server_id)));
            setError(null);
          } else {
            setError(forceResponse.error || 'Failed to delete image');
          }
        }
      }
    } catch (err) {
      setError('Failed to delete image');
      console.error('Delete error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePullImage = (repository: string, tag: string) => {
    console.log('Pulling image:', `${repository}:${tag}`);
    // Implement pull logic
  };

  const handleViewDetails = async (image: ImageWithServer) => {
    if (!user?.token) return;
    
    setSelectedImage(image);
    setDetailsDialogOpen(true);
    setLoadingDetails(true);
    setImageDetails(null);
    
    try {
      const response = await dockerApi.getDockerImageDetails(image.server_id, image.id, user.token);
      if (response.success && response.data) {
        setImageDetails(response.data);
      } else {
        setError(response.error || 'Failed to load image details');
      }
    } catch (err) {
      setError('Failed to load image details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const totalSize = images.reduce((sum, image) => sum + (image.size || 0), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Docker Images</h1>
            <p className="text-muted-foreground">Manage Docker images, layers, and history</p>
          </div>
        </div>

      {/* Error Alert */}
      {error && (
        <Alert className="border-gray-600 bg-gray-800/50">
          <AlertDescription className="text-gray-300">{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Images"
          value={images.length.toString()}
          icon={HardDrive}
          color="white"
          isError={images.length === 0 && !loading}
        />
        <StatCard
          title="Total Size"
          value={formatBytes(totalSize)}
          icon={Layers}
          color="white"
          isWarning={totalSize > 10 * 1024 * 1024 * 1024} // Warning if > 10GB
        />
        <StatCard
          title="Latest Tag"
          value={images.filter(img => img.tag === 'latest').length.toString()}
          icon={Hash}
          color="gray"
          isWarning={images.filter(img => img.tag === 'latest').length === 0 && images.length > 0}
        />
        <StatCard
          title="Last Updated"
          value="2h ago"
          icon={Calendar}
          color="gray"
          isWarning={true} // Always show warning for static "2h ago" value
        />
      </div>

      {/* Search and Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Docker Images</CardTitle>
            <div className="flex items-center space-x-2">
              <Select value={selectedServer} onValueChange={setSelectedServer}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select server" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Servers</SelectItem>
                  {servers.map((server) => (
                    <SelectItem key={server.id} value={server.id}>
                      {server.name} ({server.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search images..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-[250px]"
                />
              </div>
              <Button 
                onClick={handleRefresh} 
                disabled={loading || refreshing}
                className="bg-gray-800 hover:bg-black text-white"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Server</TableHead>
                <TableHead>Repository</TableHead>
                <TableHead>Tag</TableHead>
                <TableHead>Image ID</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredImages.map((image, index) => (
                  <TableRow key={`${image.id}-${image.repository}-${image.tag}-${index}`} className="hover:bg-muted/50">
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleRowExpansion(image.id)}
                      >
                        {expandedRows.has(image.id) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{image.server_name}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{image.repository}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Badge className="bg-gray-800 text-white border-gray-600">{image.tag}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => copyToClipboard(`${image.repository}:${image.tag}`, `tag-${image.id}-${image.tag}-${index}`)}
                          title="Copy image:tag"
                        >
                          {copiedText === `tag-${image.id}-${image.tag}-${index}` ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {getShortId(image.id)}
                    </TableCell>
                    <TableCell>{formatBytes(image.size || 0)}</TableCell>
                    <TableCell>{formatDate(image.created)}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white"
                          onClick={() => handleViewDetails(image)}
                        >
                          <Layers className="h-4 w-4 mr-1" />
                          Details
                        </Button>
                        {can('delete_image') && (
                          <Button
                            size="sm"
                            className="bg-gray-800 hover:bg-black text-white"
                            onClick={() => handleDeleteImage(image)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
              ))}
              {filteredImages.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {loading ? 'Loading images...' : error ? 'No images to display due to error' : 'No Docker images found'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Image Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Image Details
            </DialogTitle>
          </DialogHeader>
          
          {loadingDetails ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading details...</span>
            </div>
          ) : selectedImage && imageDetails ? (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Repository</label>
                  <p className="font-medium">{selectedImage.repository}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Tag</label>
                  <div className="flex items-center gap-2">
                    <Badge>{selectedImage.tag}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(`${selectedImage.repository}:${selectedImage.tag}`, 'dialog-tag')}
                      title="Copy image:tag"
                    >
                      {copiedText === 'dialog-tag' ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Image ID</label>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm">{getShortId(selectedImage.id)}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(selectedImage.id, 'dialog-id')}
                      title="Copy full image ID"
                    >
                      {copiedText === 'dialog-id' ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Server</label>
                  <div><Badge variant="outline">{selectedImage.server_name}</Badge></div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Size</label>
                  <p>{formatBytes(selectedImage.size || 0)}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Created</label>
                  <p>{formatDate(selectedImage.created)}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Architecture</label>
                  <p>{imageDetails.architecture || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">OS</label>
                  <p>{imageDetails.os || 'N/A'}</p>
                </div>
              </div>

              {/* Layers */}
              {imageDetails.layers && imageDetails.layers.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Layers ({imageDetails.layers.length})
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">#</TableHead>
                          <TableHead>Layer ID</TableHead>
                          <TableHead>Size</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {imageDetails.layers.map((layer, idx) => (
                          <TableRow key={layer.id || idx}>
                            <TableCell>{idx + 1}</TableCell>
                            <TableCell className="font-mono text-sm">{layer.id ? getShortId(layer.id) : 'N/A'}</TableCell>
                            <TableCell>{layer.size}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* History */}
              {imageDetails.history && imageDetails.history.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <History className="w-4 h-4" />
                    History ({imageDetails.history.length})
                  </h3>
                  <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Command</TableHead>
                          <TableHead className="w-24">Size</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {imageDetails.history.map((entry, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-xs max-w-md truncate" title={entry.created_by}>
                              {entry.created_by?.substring(0, 100) || 'N/A'}
                            </TableCell>
                            <TableCell>{entry.size > 0 ? formatBytes(entry.size) : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No details available
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};