import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { 
  uploadServerApi, 
  fileBrowserApi, 
  versionApi, 
  uploadApi,
  UploadServer, 
  FileItem, 
  VersionsData,
  GuestOSUpload
} from '@/lib/upload-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Server,
  Upload,
  Folder,
  File,
  FolderOpen,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowLeft,
  HardDrive,
  History,
  FileUp,
  ChevronRight,
  Home,
} from 'lucide-react';

// ==================== Stat Card Component ====================

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
}

const StatCard = ({ title, value, icon, description }: StatCardProps) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      {icon}
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
    </CardContent>
  </Card>
);

// ==================== Main Component ====================

const AdminGuestOS = () => {
  const { user } = useAuth();
  const { can } = usePermissions();

  // State
  const [activeTab, setActiveTab] = useState('servers');
  const [servers, setServers] = useState<UploadServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<UploadServer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Server dialog state
  const [serverDialogOpen, setServerDialogOpen] = useState(false);
  const [isEditingServer, setIsEditingServer] = useState(false);
  const [testingConnection, setTestingConnection] = useState<number | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<number, 'online' | 'offline' | 'testing'>>({});

  // File browser state
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [versions, setVersions] = useState<VersionsData | null>(null);

  // Upload state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<GuestOSUpload[]>([]);

  // Delete state
  const [deleteServerDialogOpen, setDeleteServerDialogOpen] = useState(false);
  const [deleteFileDialogOpen, setDeleteFileDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  // Form data
  const [serverFormData, setServerFormData] = useState({
    name: '',
    ip_address: '',
    port: 22,
    protocol: 'sftp' as 'sftp' | 'scp' | 'local',
    username: '',
    password: '',
    ssh_key: '',
    base_path: '',
    version_file_path: '',
  });

  const [uploadFormData, setUploadFormData] = useState({
    image_name: '',
    version: '',
    changelog: '',
    files: [] as File[],
  });

  // Multi-file upload state
  const [multiUploadFiles, setMultiUploadFiles] = useState<Array<{
    file: File;
    image_name: string;
    version: string;
    changelog: string;
    status: 'pending' | 'uploading' | 'completed' | 'failed';
    progress: number;
    error?: string;
  }>>([]);
  const [multiUploadMode, setMultiUploadMode] = useState(false);
  const [currentUploadIndex, setCurrentUploadIndex] = useState(-1);

  // ==================== Data Fetching ====================

  const fetchServers = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const response = await uploadServerApi.getServers(user.token);
      if (response.success && response.servers) {
        setServers(response.servers);
      } else {
        setError(response.error || 'Failed to fetch servers');
      }
    } catch (err) {
      setError('Failed to fetch servers');
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  const fetchFiles = useCallback(async (path = '') => {
    if (!user?.token || !selectedServer) return;
    setLoadingFiles(true);
    try {
      const response = await fileBrowserApi.browse(user.token, selectedServer.id, path);
      if (response.success && response.path !== undefined) {
        setCurrentPath(response.path || '');
        setFiles(response.items || []);
      } else {
        setError(response.error || 'Failed to browse files');
      }
    } catch (err) {
      setError('Failed to browse files');
    } finally {
      setLoadingFiles(false);
    }
  }, [user?.token, selectedServer]);

  const fetchVersions = useCallback(async () => {
    if (!user?.token || !selectedServer) return;
    try {
      const response = await versionApi.getVersions(user.token, selectedServer.id);
      if (response.success && response.versions) {
        setVersions(response.versions);
      }
    } catch (err) {
      console.error('Failed to fetch versions');
    }
  }, [user?.token, selectedServer]);

  const fetchUploadHistory = useCallback(async () => {
    if (!user?.token || !selectedServer) return;
    try {
      const response = await uploadApi.getUploadHistory(user.token, selectedServer.id);
      if (response.success && response.uploads) {
        setUploadHistory(response.uploads);
      }
    } catch (err) {
      console.error('Failed to fetch upload history');
    }
  }, [user?.token, selectedServer]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  useEffect(() => {
    if (selectedServer) {
      fetchFiles('');
      fetchVersions();
      fetchUploadHistory();
    }
  }, [selectedServer, fetchFiles, fetchVersions, fetchUploadHistory]);

  // ==================== Server Handlers ====================

  const handleOpenServerDialog = (server?: UploadServer) => {
    if (server) {
      setIsEditingServer(true);
      setSelectedServer(server);
      setServerFormData({
        name: server.name,
        ip_address: server.ip_address,
        port: server.port,
        protocol: server.protocol,
        username: server.username || '',
        password: '',
        ssh_key: '',
        base_path: server.base_path,
        version_file_path: server.version_file_path || '',
      });
    } else {
      setIsEditingServer(false);
      setServerFormData({
        name: '',
        ip_address: '',
        port: 22,
        protocol: 'sftp',
        username: '',
        password: '',
        ssh_key: '',
        base_path: '',
        version_file_path: '',
      });
    }
    setServerDialogOpen(true);
  };

  const handleSaveServer = async () => {
    if (!user?.token) return;
    try {
      if (isEditingServer && selectedServer) {
        const response = await uploadServerApi.updateServer(user.token, selectedServer.id, serverFormData);
        if (!response.success) {
          setError(response.error || 'Failed to update server');
          return;
        }
      } else {
        const response = await uploadServerApi.createServer(user.token, serverFormData);
        if (!response.success) {
          setError(response.error || 'Failed to create server');
          return;
        }
      }
      setServerDialogOpen(false);
      fetchServers();
    } catch (err) {
      setError('Failed to save server');
    }
  };

  const handleDeleteServer = async () => {
    if (!user?.token || !selectedServer) return;
    try {
      const response = await uploadServerApi.deleteServer(user.token, selectedServer.id);
      if (response.success) {
        setDeleteServerDialogOpen(false);
        setSelectedServer(null);
        fetchServers();
      } else {
        setError(response.error || 'Failed to delete server');
      }
    } catch (err) {
      setError('Failed to delete server');
    }
  };

  const handleTestConnection = async (server: UploadServer) => {
    if (!user?.token) return;
    setTestingConnection(server.id);
    setConnectionStatus(prev => ({ ...prev, [server.id]: 'testing' }));
    try {
      const response = await uploadServerApi.testConnection(user.token, server.id);
      setConnectionStatus(prev => ({
        ...prev,
        [server.id]: response.success ? 'online' : 'offline'
      }));
    } catch (err) {
      setConnectionStatus(prev => ({ ...prev, [server.id]: 'offline' }));
    } finally {
      setTestingConnection(null);
    }
  };

  // ==================== File Browser Handlers ====================

  const handleNavigate = (item: FileItem) => {
    if (item.type === 'directory') {
      const newPath = currentPath ? `${currentPath}/${item.name}` : item.name;
      fetchFiles(newPath);
    }
  };

  const handleGoBack = () => {
    const parts = currentPath.split('/');
    parts.pop();
    fetchFiles(parts.join('/'));
  };

  const handleGoHome = () => {
    fetchFiles('');
  };

  const handleDeleteFile = async () => {
    if (!user?.token || !selectedServer || !fileToDelete) return;
    try {
      const fullPath = currentPath ? `${currentPath}/${fileToDelete}` : fileToDelete;
      const response = await fileBrowserApi.deleteFile(user.token, selectedServer.id, fullPath);
      if (response.success) {
        setDeleteFileDialogOpen(false);
        setFileToDelete(null);
        fetchFiles(currentPath);
      } else {
        setError(response.error || 'Failed to delete file');
      }
    } catch (err) {
      setError('Failed to delete file');
    }
  };

  // ==================== Upload Handlers ====================

  const handleOpenUploadDialog = async () => {
    if (!user?.token || !selectedServer) return;
    
    // Get next version for the first image in versions
    let defaultImageName = '';
    let defaultVersion = '0.1';
    
    if (versions?.images) {
      const imageNames = Object.keys(versions.images);
      if (imageNames.length > 0) {
        defaultImageName = imageNames[0];
        const response = await versionApi.getNextVersion(user.token, selectedServer.id, defaultImageName);
        if (response.success && response.next_version) {
          defaultVersion = response.next_version;
        }
      }
    }
    
    setUploadFormData({
      image_name: defaultImageName,
      version: defaultVersion,
      changelog: '',
      files: [],
    });
    setUploadProgress(0);
    setMultiUploadFiles([]);
    setMultiUploadMode(false);
    setCurrentUploadIndex(-1);
    setSingleModeFileProgress([]);
    setUploadDialogOpen(true);
  };

  const handleImageNameChange = async (imageName: string) => {
    setUploadFormData(prev => ({ ...prev, image_name: imageName }));
    
    if (!user?.token || !selectedServer) return;
    
    // Get next version for this image
    const response = await versionApi.getNextVersion(user.token, selectedServer.id, imageName);
    if (response.success && response.next_version) {
      setUploadFormData(prev => ({ ...prev, version: response.next_version! }));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (fileList && fileList.length > 0) {
      const filesArray = Array.from(fileList);
      setUploadFormData(prev => ({ ...prev, files: [...prev.files, ...filesArray] }));
    }
    // Reset input so same files can be selected again
    e.target.value = '';
  };

  const handleRemoveFile = (index: number) => {
    setUploadFormData(prev => ({
      ...prev,
      files: prev.files.filter((_, i) => i !== index)
    }));
  };

  const handleMultiFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !user?.token || !selectedServer) return;

    const newFiles: typeof multiUploadFiles = [];
    
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      // Try to detect image name from filename (e.g., centos.qcow2 -> centos)
      const baseName = file.name.replace(/\.(qcow2|img|bin|iso|raw|vmdk)$/i, '');
      let imageName = baseName;
      let version = '0.1';
      
      // Check if this matches a known image type
      if (versions?.images) {
        const knownImages = Object.keys(versions.images);
        const matchedImage = knownImages.find(name => 
          baseName.toLowerCase().includes(name.toLowerCase())
        );
        if (matchedImage) {
          imageName = matchedImage;
          // Get next version for this image
          const response = await versionApi.getNextVersion(user.token, selectedServer.id, matchedImage);
          if (response.success && response.next_version) {
            version = response.next_version;
          }
        }
      }
      
      newFiles.push({
        file,
        image_name: imageName,
        version,
        changelog: '',
        status: 'pending',
        progress: 0,
      });
    }
    
    setMultiUploadFiles(prev => [...prev, ...newFiles]);
    setMultiUploadMode(true);
  };

  const handleRemoveMultiFile = (index: number) => {
    setMultiUploadFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateMultiFile = async (index: number, field: 'image_name' | 'version' | 'changelog', value: string) => {
    setMultiUploadFiles(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });

    // If image name changed, fetch new version
    if (field === 'image_name' && user?.token && selectedServer) {
      const response = await versionApi.getNextVersion(user.token, selectedServer.id, value);
      if (response.success && response.next_version) {
        setMultiUploadFiles(prev => {
          const updated = [...prev];
          updated[index] = { ...updated[index], version: response.next_version! };
          return updated;
        });
      }
    }
  };

  const handleMultiUpload = async () => {
    if (!user?.token || !selectedServer || multiUploadFiles.length === 0) return;
    
    setUploading(true);
    
    for (let i = 0; i < multiUploadFiles.length; i++) {
      const fileData = multiUploadFiles[i];
      if (fileData.status === 'completed') continue;
      
      setCurrentUploadIndex(i);
      setMultiUploadFiles(prev => {
        const updated = [...prev];
        updated[i] = { ...updated[i], status: 'uploading', progress: 0 };
        return updated;
      });
      
      try {
        const response = await uploadApi.uploadFile(
          user.token,
          selectedServer.id,
          fileData.file,
          fileData.image_name,
          fileData.version,
          fileData.changelog,
          (progress) => {
            setMultiUploadFiles(prev => {
              const updated = [...prev];
              updated[i] = { ...updated[i], progress };
              return updated;
            });
          }
        );
        
        if (response.success) {
          setMultiUploadFiles(prev => {
            const updated = [...prev];
            updated[i] = { ...updated[i], status: 'completed', progress: 100 };
            return updated;
          });
        } else {
          setMultiUploadFiles(prev => {
            const updated = [...prev];
            updated[i] = { ...updated[i], status: 'failed', error: response.error || 'Upload failed' };
            return updated;
          });
        }
      } catch (err) {
        setMultiUploadFiles(prev => {
          const updated = [...prev];
          updated[i] = { ...updated[i], status: 'failed', error: 'Upload failed' };
          return updated;
        });
      }
    }
    
    setCurrentUploadIndex(-1);
    setUploading(false);
    fetchFiles(currentPath);
    fetchVersions();
    fetchUploadHistory();
  };

  // State for tracking individual file upload progress in single mode
  const [singleModeFileProgress, setSingleModeFileProgress] = useState<Array<{
    name: string;
    progress: number;
    status: 'pending' | 'uploading' | 'completed' | 'failed';
    error?: string;
  }>>([]);

  const handleUpload = async () => {
    if (!user?.token || !selectedServer || uploadFormData.files.length === 0) return;
    
    setUploading(true);
    
    // Initialize progress tracking for all files
    setSingleModeFileProgress(uploadFormData.files.map(f => ({
      name: f.name,
      progress: 0,
      status: 'pending'
    })));
    
    let currentVersion = uploadFormData.version;
    
    for (let i = 0; i < uploadFormData.files.length; i++) {
      const file = uploadFormData.files[i];
      
      // Update status to uploading
      setSingleModeFileProgress(prev => {
        const updated = [...prev];
        updated[i] = { ...updated[i], status: 'uploading' };
        return updated;
      });
      
      try {
        const response = await uploadApi.uploadFile(
          user.token,
          selectedServer.id,
          file,
          uploadFormData.image_name,
          currentVersion,
          uploadFormData.changelog,
          (progress) => {
            setSingleModeFileProgress(prev => {
              const updated = [...prev];
              updated[i] = { ...updated[i], progress };
              return updated;
            });
            // Also update overall progress
            const overallProgress = Math.round(((i * 100) + progress) / uploadFormData.files.length);
            setUploadProgress(overallProgress);
          }
        );
        
        if (response.success) {
          setSingleModeFileProgress(prev => {
            const updated = [...prev];
            updated[i] = { ...updated[i], status: 'completed', progress: 100 };
            return updated;
          });
          
          // Increment version for next file
          const versionParts = currentVersion.split('.');
          const minor = parseInt(versionParts[1] || '0') + 1;
          currentVersion = `${versionParts[0]}.${minor}`;
        } else {
          setSingleModeFileProgress(prev => {
            const updated = [...prev];
            updated[i] = { ...updated[i], status: 'failed', error: response.error || 'Upload failed' };
            return updated;
          });
        }
      } catch (err) {
        setSingleModeFileProgress(prev => {
          const updated = [...prev];
          updated[i] = { ...updated[i], status: 'failed', error: 'Upload failed' };
          return updated;
        });
      }
    }
    
    setUploading(false);
    fetchFiles(currentPath);
    fetchVersions();
    fetchUploadHistory();
  };

  // ==================== Helper Functions ====================

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
      case 'completed':
        return <Badge className="bg-green-500/10 text-green-400 border-green-500/20">{status}</Badge>;
      case 'offline':
      case 'failed':
        return <Badge className="bg-red-500/10 text-red-400 border-red-500/20">{status}</Badge>;
      case 'testing':
      case 'uploading':
        return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">{status}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // ==================== Stats ====================

  const stats = [
    {
      title: 'Upload Servers',
      value: servers.length,
      icon: <Server className="w-5 h-5 text-muted-foreground" />,
    },
    {
      title: 'Active Servers',
      value: servers.filter(s => s.is_active).length,
      icon: <CheckCircle className="w-5 h-5 text-green-400" />,
    },
    {
      title: 'Total Uploads',
      value: uploadHistory.length,
      icon: <Upload className="w-5 h-5 text-muted-foreground" />,
    },
    {
      title: 'Image Types',
      value: versions?.images ? Object.keys(versions.images).length : 0,
      icon: <HardDrive className="w-5 h-5 text-muted-foreground" />,
    },
  ];

  // ==================== Render ====================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Guest OS Manager</h1>
          <p className="text-muted-foreground">Upload and manage guest OS images</p>
        </div>
        <Button onClick={fetchServers} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
          {error}
          <Button variant="ghost" size="sm" className="ml-4" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="servers" className="flex items-center gap-2">
              <Server className="w-4 h-4" />
              Upload Servers
            </TabsTrigger>
            <TabsTrigger value="browser" className="flex items-center gap-2" disabled={!selectedServer}>
              <Folder className="w-4 h-4" />
              File Browser
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2" disabled={!selectedServer}>
              <History className="w-4 h-4" />
              Upload History
            </TabsTrigger>
          </TabsList>
          
          {activeTab === 'servers' && can('manage_upload_servers') && (
            <Button onClick={() => handleOpenServerDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              New Server
            </Button>
          )}
          {activeTab === 'browser' && selectedServer && can('upload_guest_os') && (
            <Button onClick={handleOpenUploadDialog}>
              <FileUp className="w-4 h-4 mr-2" />
              Upload Image
            </Button>
          )}
        </div>

        {/* Servers Tab */}
        <TabsContent value="servers">
          <Card>
            <CardHeader>
              <CardTitle>Upload Servers</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Protocol</TableHead>
                    <TableHead>Base Path</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {servers.map((server) => (
                    <TableRow 
                      key={server.id}
                      className={selectedServer?.id === server.id ? 'bg-muted/50' : ''}
                    >
                      <TableCell className="font-medium">{server.name}</TableCell>
                      <TableCell>
                        {server.ip_address}:{server.port}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{server.protocol.toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm max-w-[200px] truncate">
                        {server.base_path}
                      </TableCell>
                      <TableCell>
                        {connectionStatus[server.id] ? (
                          getStatusBadge(connectionStatus[server.id])
                        ) : (
                          <Badge variant="outline">Unknown</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedServer(server);
                              setActiveTab('browser');
                            }}
                            title="Browse Files"
                          >
                            <FolderOpen className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleTestConnection(server)}
                            disabled={testingConnection === server.id}
                            title="Test Connection"
                          >
                            {testingConnection === server.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                          </Button>
                          {can('manage_upload_servers') && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenServerDialog(server)}
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedServer(server);
                                  setDeleteServerDialogOpen(true);
                                }}
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4 text-red-400" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {servers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No upload servers configured
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* File Browser Tab */}
        <TabsContent value="browser">
          {selectedServer && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FolderOpen className="w-5 h-5" />
                      {selectedServer.name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedServer.base_path}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => fetchFiles(currentPath)}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                  </Button>
                </div>
                
                {/* Breadcrumb */}
                <div className="flex items-center gap-1 mt-4 text-sm">
                  <Button variant="ghost" size="sm" onClick={handleGoHome} className="h-7 px-2">
                    <Home className="w-4 h-4" />
                  </Button>
                  {currentPath && (
                    <>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      {currentPath.split('/').map((part, index, arr) => (
                        <div key={index} className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => {
                              const newPath = arr.slice(0, index + 1).join('/');
                              fetchFiles(newPath);
                            }}
                          >
                            {part}
                          </Button>
                          {index < arr.length - 1 && (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loadingFiles ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Modified</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentPath && (
                        <TableRow className="cursor-pointer hover:bg-muted/50" onClick={handleGoBack}>
                          <TableCell className="flex items-center gap-2">
                            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                            <span>..</span>
                          </TableCell>
                          <TableCell>-</TableCell>
                          <TableCell>-</TableCell>
                          <TableCell>-</TableCell>
                          <TableCell>-</TableCell>
                        </TableRow>
                      )}
                      {files.map((file) => (
                        <TableRow
                          key={file.name}
                          className={file.type === 'directory' ? 'cursor-pointer hover:bg-muted/50' : ''}
                          onClick={() => file.type === 'directory' && handleNavigate(file)}
                        >
                          <TableCell className="flex items-center gap-2">
                            {file.type === 'directory' ? (
                              <Folder className="w-4 h-4 text-blue-400" />
                            ) : (
                              <File className="w-4 h-4 text-muted-foreground" />
                            )}
                            <span>{file.name}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {file.type === 'directory' ? 'Folder' : file.name.split('.').pop()?.toUpperCase() || 'File'}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatFileSize(file.size)}</TableCell>
                          <TableCell className="text-sm">
                            {new Date(file.modified).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {can('manage_upload_servers') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFileToDelete(file.name);
                                  setDeleteFileDialogOpen(true);
                                }}
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4 text-red-400" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {files.length === 0 && !currentPath && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            Empty directory
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {/* Version Info Card */}
          {selectedServer && versions && Object.keys(versions.images || {}).length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5" />
                  Image Versions
                </CardTitle>
                {versions.last_updated && (
                  <p className="text-sm text-muted-foreground">
                    Last updated: {new Date(versions.last_updated).toLocaleString()}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(versions.images).map(([name, info]) => (
                    <Card key={name} className="bg-muted/30">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{name}</span>
                          <Badge>v{info.version}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Released: {info.release_date}
                        </p>
                        <p className="text-sm mt-2 text-muted-foreground line-clamp-2">
                          {info.changelog}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Upload History Tab */}
        <TabsContent value="history">
          {selectedServer && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Upload History: {selectedServer.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Image</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Uploaded By</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploadHistory.map((upload) => (
                      <TableRow key={upload.id}>
                        <TableCell className="font-medium">{upload.image_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">v{upload.version}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm max-w-[200px] truncate">
                          {upload.file_name}
                        </TableCell>
                        <TableCell>{formatFileSize(upload.file_size)}</TableCell>
                        <TableCell>{getStatusBadge(upload.status)}</TableCell>
                        <TableCell>{upload.uploaded_by_name || '-'}</TableCell>
                        <TableCell className="text-sm">
                          {new Date(upload.uploaded_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                    {uploadHistory.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No uploads yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Server Dialog */}
      <Dialog open={serverDialogOpen} onOpenChange={setServerDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEditingServer ? 'Edit Server' : 'New Upload Server'}</DialogTitle>
            <DialogDescription>
              Configure an upload server for guest OS images
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="server_name">Server Name</Label>
              <Input
                id="server_name"
                value={serverFormData.name}
                onChange={(e) => setServerFormData({ ...serverFormData, name: e.target.value })}
                placeholder="Production Server"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ip_address">IP Address / Hostname</Label>
                <Input
                  id="ip_address"
                  value={serverFormData.ip_address}
                  onChange={(e) => setServerFormData({ ...serverFormData, ip_address: e.target.value })}
                  placeholder="192.168.1.100"
                />
              </div>
              <div>
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={serverFormData.port}
                  onChange={(e) => setServerFormData({ ...serverFormData, port: parseInt(e.target.value) || 22 })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="protocol">Protocol</Label>
              <Select
                value={serverFormData.protocol}
                onValueChange={(value: 'sftp' | 'scp' | 'local') => setServerFormData({ ...serverFormData, protocol: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sftp">SFTP</SelectItem>
                  <SelectItem value="scp">SCP</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {serverFormData.protocol !== 'local' && (
              <>
                <div>
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={serverFormData.username}
                    onChange={(e) => setServerFormData({ ...serverFormData, username: e.target.value })}
                    placeholder="admin"
                  />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={serverFormData.password}
                    onChange={(e) => setServerFormData({ ...serverFormData, password: e.target.value })}
                    placeholder={isEditingServer ? 'Leave blank to keep current' : 'Password'}
                  />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="base_path">Base Path</Label>
              <Input
                id="base_path"
                value={serverFormData.base_path}
                onChange={(e) => setServerFormData({ ...serverFormData, base_path: e.target.value })}
                placeholder="/var/www/images"
              />
            </div>
            <div>
              <Label htmlFor="version_file_path">Version File Path (versions.json)</Label>
              <Input
                id="version_file_path"
                value={serverFormData.version_file_path}
                onChange={(e) => setServerFormData({ ...serverFormData, version_file_path: e.target.value })}
                placeholder="/var/www/images/config/qvp/versions.json"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Full path to the versions.json file for auto-increment versioning
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setServerDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveServer}>
              {isEditingServer ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="w-5 h-5" />
              Upload Guest OS Image{uploadFormData.files.length > 1 ? 's' : ''}
            </DialogTitle>
            <DialogDescription>
              Upload guest OS images to {selectedServer?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
              <div>
                <Label htmlFor="image_name">Image Category</Label>
                <Input
                  id="image_name"
                  value={uploadFormData.image_name}
                  onChange={(e) => handleImageNameChange(e.target.value)}
                  placeholder="rootfs, centos, msvp, etc."
                  disabled={uploading}
                />
                {versions?.images && Object.keys(versions.images).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Object.keys(versions.images).map((name) => (
                      <Button
                        key={name}
                        variant={uploadFormData.image_name === name ? "default" : "outline"}
                        size="sm"
                        className="h-7"
                        onClick={() => handleImageNameChange(name)}
                        disabled={uploading}
                      >
                        {name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="version">Starting Version</Label>
                <Input
                  id="version"
                  value={uploadFormData.version}
                  onChange={(e) => setUploadFormData({ ...uploadFormData, version: e.target.value })}
                  placeholder="0.1"
                  disabled={uploading}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {uploadFormData.files.length > 1 
                    ? `Versions will auto-increment: ${uploadFormData.version}, ${uploadFormData.version.split('.')[0]}.${parseInt(uploadFormData.version.split('.')[1] || '0') + 1}, ...`
                    : 'Auto-incremented from versions.json'}
                </p>
              </div>
              <div>
                <Label htmlFor="changelog">Changelog</Label>
                <Textarea
                  id="changelog"
                  value={uploadFormData.changelog}
                  onChange={(e) => setUploadFormData({ ...uploadFormData, changelog: e.target.value })}
                  placeholder="Describe the changes in this version..."
                  rows={2}
                  disabled={uploading}
                />
              </div>
              <div>
                <Label htmlFor="file">Files</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".qcow2,.img,.bin,.iso,.raw,.vmdk"
                  multiple
                  onChange={handleFileSelect}
                  disabled={uploading}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Select one or more files for the "{uploadFormData.image_name || 'selected'}" category
                </p>
              </div>
              
              {/* Selected Files List */}
              {uploadFormData.files.length > 0 && (
                <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                  <div className="text-sm font-medium flex items-center justify-between">
                    <span>{uploadFormData.files.length} file{uploadFormData.files.length > 1 ? 's' : ''} selected</span>
                    {!uploading && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 text-xs text-red-400 hover:text-red-300"
                        onClick={() => setUploadFormData(prev => ({ ...prev, files: [] }))}
                      >
                        Clear All
                      </Button>
                    )}
                  </div>
                  {uploadFormData.files.map((file, index) => {
                    const fileProgress = singleModeFileProgress[index];
                    return (
                      <div key={index} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1.5">
                        <File className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate" title={file.name}>{file.name}</span>
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              ({formatFileSize(file.size)})
                            </span>
                          </div>
                          {fileProgress && fileProgress.status === 'uploading' && (
                            <Progress value={fileProgress.progress} className="h-1 mt-1" />
                          )}
                        </div>
                        {fileProgress ? (
                          <div className="flex-shrink-0">
                            {fileProgress.status === 'completed' ? (
                              <CheckCircle className="w-4 h-4 text-green-400" />
                            ) : fileProgress.status === 'failed' ? (
                              <XCircle className="w-4 h-4 text-red-400" title={fileProgress.error} />
                            ) : fileProgress.status === 'uploading' ? (
                              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                            ) : null}
                          </div>
                        ) : !uploading ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => handleRemoveFile(index)}
                          >
                            <XCircle className="w-4 h-4 text-muted-foreground hover:text-red-400" />
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
              
              {uploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Overall Progress</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} />
                </div>
              )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)} disabled={uploading}>
              {singleModeFileProgress.length > 0 && singleModeFileProgress.every(f => f.status === 'completed') ? 'Close' : 'Cancel'}
            </Button>
            {singleModeFileProgress.length > 0 && singleModeFileProgress.every(f => f.status === 'completed') ? (
              <Button className="bg-green-600 hover:bg-green-700" onClick={() => setUploadDialogOpen(false)}>
                <CheckCircle className="w-4 h-4 mr-2" />Done
              </Button>
            ) : (
              <Button
                onClick={handleUpload}
                disabled={uploading || uploadFormData.files.length === 0 || !uploadFormData.image_name || !uploadFormData.version}
              >
                {uploading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading...</>
                ) : (
                  <><Upload className="w-4 h-4 mr-2" />Upload {uploadFormData.files.length > 1 ? `${uploadFormData.files.length} Files` : ''}</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Server Confirmation */}
      <AlertDialog open={deleteServerDialogOpen} onOpenChange={setDeleteServerDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Server</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedServer?.name}"? This will also delete all upload history for this server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteServer} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete File Confirmation */}
      <AlertDialog open={deleteFileDialogOpen} onOpenChange={setDeleteFileDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{fileToDelete}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFile} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminGuestOS;
