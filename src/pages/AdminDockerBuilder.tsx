import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import {
  registryApi,
  projectApi,
  buildApi,
  Registry,
  BuildProject,
  Build
} from '@/lib/build-api';
import { StatCard } from '@/components/StatCard';
import {
  Database,
  Plus,
  RefreshCw,
  Trash2,
  Edit,
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  TestTube,
  FolderGit2,
  History,
  GitBranch,
  Tag,
  Hammer,
  Server,
  FileCode,
  Save,
  GitCommit,
  Terminal,
  X,
} from 'lucide-react';

export const AdminDockerBuilder: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const [activeTab, setActiveTab] = useState('projects');

  // Registries state
  const [registries, setRegistries] = useState<Registry[]>([]);
  const [registryDialogOpen, setRegistryDialogOpen] = useState(false);
  const [deleteRegistryDialogOpen, setDeleteRegistryDialogOpen] = useState(false);
  const [imagesDialogOpen, setImagesDialogOpen] = useState(false);
  const [selectedRegistry, setSelectedRegistry] = useState<Registry | null>(null);
  const [isEditingRegistry, setIsEditingRegistry] = useState(false);
  const [testingConnection, setTestingConnection] = useState<number | null>(null);
  const [registryImages, setRegistryImages] = useState<Array<{ name: string; tags: Array<{ name: string; full_name: string }> }>>([]);
  const [loadingImages, setLoadingImages] = useState(false);

  // Projects state
  const [projects, setProjects] = useState<BuildProject[]>([]);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [deleteProjectDialogOpen, setDeleteProjectDialogOpen] = useState(false);
  const [buildDialogOpen, setBuildDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [dockerfileEditorOpen, setDockerfileEditorOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<BuildProject | null>(null);
  const [selectedBuilds, setSelectedBuilds] = useState<Build[]>([]);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [buildInProgress, setBuildInProgress] = useState<number | null>(null);

  // Dockerfile editor state
  const [dockerfileContent, setDockerfileContent] = useState('');
  const [originalDockerfile, setOriginalDockerfile] = useState('');
  const [loadingDockerfile, setLoadingDockerfile] = useState(false);
  const [savingDockerfile, setSavingDockerfile] = useState(false);
  const [editorBuildStatus, setEditorBuildStatus] = useState<'idle' | 'building' | 'success' | 'failed'>('idle');
  const [editorBuildLogs, setEditorBuildLogs] = useState('');
  const [commitMessage, setCommitMessage] = useState('');

  // Build logs dialog state
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [viewingBuildLogs, setViewingBuildLogs] = useState('');
  const [viewingBuildInfo, setViewingBuildInfo] = useState<Build | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Common state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form data
  const [registryFormData, setRegistryFormData] = useState({
    name: '',
    url: '',
    registry_type: 'private' as Registry['registry_type'],
    username: '',
    password: '',
    is_default: false,
  });

  const [projectFormData, setProjectFormData] = useState({
    name: '',
    description: '',
    repo_url: '',
    repo_branch: 'main',
    dockerfile_path: 'Dockerfile',
    build_context: '.',
    git_pat: '',
    default_registry_id: '',
    image_name: '',
    auto_increment_tag: true,
  });

  const [buildFormData, setBuildFormData] = useState({
    tag: '',
    registry_id: '',
  });

  // ==================== Data Fetching ====================

  const fetchData = async () => {
    if (!user?.token) return;

    setLoading(true);
    try {
      const [projectsRes, registriesRes] = await Promise.all([
        projectApi.getProjects(user.token),
        registryApi.getRegistries(user.token),
      ]);

      if (projectsRes.success && projectsRes.data) {
        setProjects(projectsRes.data.projects);
      }
      if (registriesRes.success && registriesRes.data) {
        setRegistries(registriesRes.data.registries);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user?.token]);

  // ==================== Registry Handlers ====================

  const handleOpenRegistryDialog = (registry?: Registry) => {
    if (registry) {
      setIsEditingRegistry(true);
      setSelectedRegistry(registry);
      setRegistryFormData({
        name: registry.name,
        url: registry.url,
        registry_type: registry.registry_type,
        username: registry.username || '',
        password: '',
        is_default: registry.is_default,
      });
    } else {
      setIsEditingRegistry(false);
      setSelectedRegistry(null);
      setRegistryFormData({
        name: '',
        url: '',
        registry_type: 'private',
        username: '',
        password: '',
        is_default: false,
      });
    }
    setRegistryDialogOpen(true);
  };

  const handleSaveRegistry = async () => {
    if (!user?.token) return;

    try {
      if (isEditingRegistry && selectedRegistry) {
        const response = await registryApi.updateRegistry(user.token, selectedRegistry.id, registryFormData);
        if (!response.success) {
          setError(response.error || 'Failed to update registry');
          return;
        }
      } else {
        const response = await registryApi.createRegistry(user.token, registryFormData);
        if (!response.success) {
          setError(response.error || 'Failed to create registry');
          return;
        }
      }

      setRegistryDialogOpen(false);
      fetchData();
    } catch (err) {
      setError('Operation failed');
    }
  };

  const handleDeleteRegistry = async () => {
    if (!user?.token || !selectedRegistry) return;

    try {
      const response = await registryApi.deleteRegistry(user.token, selectedRegistry.id);
      if (response.success) {
        setDeleteRegistryDialogOpen(false);
        setSelectedRegistry(null);
        fetchData();
      } else {
        setError(response.error || 'Failed to delete registry');
      }
    } catch (err) {
      setError('Failed to delete registry');
    }
  };

  const handleTestConnection = async (registry: Registry) => {
    if (!user?.token) return;

    setTestingConnection(registry.id);
    try {
      const response = await registryApi.testConnection(user.token, registry.id);
      if (response.success) {
        fetchData();
      } else {
        setError(response.error || 'Connection test failed');
      }
    } catch (err) {
      setError('Connection test failed');
    } finally {
      setTestingConnection(null);
    }
  };

  const handleViewImages = async (registry: Registry) => {
    if (!user?.token) return;

    setSelectedRegistry(registry);
    setLoadingImages(true);
    setImagesDialogOpen(true);
    setRegistryImages([]);

    try {
      // Fetch images from registry
      const imagesRes = await registryApi.getRegistryImages(user.token, registry.id);
      if (imagesRes.success && imagesRes.data) {
        // For each image, fetch its tags
        const imagesWithTags = await Promise.all(
          imagesRes.data.images.map(async (image) => {
            const tagsRes = await registryApi.getImageTags(user.token, registry.id, image.name);
            return {
              name: image.name,
              tags: tagsRes.success && tagsRes.data ? tagsRes.data.tags : []
            };
          })
        );
        setRegistryImages(imagesWithTags);
      }
    } catch (err) {
      setError('Failed to fetch images');
    } finally {
      setLoadingImages(false);
    }
  };

  // ==================== Project Handlers ====================

  const handleOpenProjectDialog = (project?: BuildProject) => {
    if (project) {
      setIsEditingProject(true);
      setSelectedProject(project);
      setProjectFormData({
        name: project.name,
        description: project.description || '',
        repo_url: project.repo_url,
        repo_branch: project.repo_branch,
        dockerfile_path: project.dockerfile_path,
        build_context: project.build_context,
        git_pat: '',
        default_registry_id: project.default_registry_id?.toString() || '',
        image_name: project.image_name || '',
        auto_increment_tag: project.auto_increment_tag,
      });
    } else {
      setIsEditingProject(false);
      setSelectedProject(null);
      setProjectFormData({
        name: '',
        description: '',
        repo_url: '',
        repo_branch: 'main',
        dockerfile_path: 'Dockerfile',
        build_context: '.',
        git_pat: '',
        default_registry_id: '',
        image_name: '',
        auto_increment_tag: true,
      });
    }
    setProjectDialogOpen(true);
  };

  const handleSaveProject = async () => {
    if (!user?.token) return;

    try {
      const data = {
        ...projectFormData,
        default_registry_id: projectFormData.default_registry_id ? parseInt(projectFormData.default_registry_id) : null,
      };

      if (isEditingProject && selectedProject) {
        const response = await projectApi.updateProject(user.token, selectedProject.id, data);
        if (!response.success) {
          setError(response.error || 'Failed to update project');
          return;
        }
      } else {
        const response = await projectApi.createProject(user.token, data);
        if (!response.success) {
          setError(response.error || 'Failed to create project');
          return;
        }
      }

      setProjectDialogOpen(false);
      fetchData();
    } catch (err) {
      setError('Operation failed');
    }
  };

  const handleDeleteProject = async () => {
    if (!user?.token || !selectedProject) return;

    try {
      const response = await projectApi.deleteProject(user.token, selectedProject.id);
      if (response.success) {
        setDeleteProjectDialogOpen(false);
        setSelectedProject(null);
        fetchData();
      } else {
        setError(response.error || 'Failed to delete project');
      }
    } catch (err) {
      setError('Failed to delete project');
    }
  };

  const handleOpenBuildDialog = (project: BuildProject) => {
    setSelectedProject(project);
    setBuildFormData({
      tag: '',
      registry_id: project.default_registry_id?.toString() || '',
    });
    setBuildDialogOpen(true);
  };

  const handleStartBuild = async () => {
    if (!user?.token || !selectedProject) return;

    setBuildInProgress(selectedProject.id);
    try {
      const response = await buildApi.startBuild(user.token, selectedProject.id, {
        tag: buildFormData.tag || undefined,
        registry_id: buildFormData.registry_id ? parseInt(buildFormData.registry_id) : undefined,
      });

      if (response.success) {
        setBuildDialogOpen(false);
        fetchData();
      } else {
        setError(response.error || 'Failed to start build');
      }
    } catch (err) {
      setError('Failed to start build');
    } finally {
      setBuildInProgress(null);
    }
  };

  const handleViewBuilds = async (project: BuildProject) => {
    if (!user?.token) return;

    setSelectedProject(project);
    try {
      const response = await buildApi.getProjectBuilds(user.token, project.id);
      if (response.success && response.data) {
        setSelectedBuilds(response.data.builds);
      }
    } catch (err) {
      console.error('Failed to fetch builds');
    }
    setDetailDialogOpen(true);
  };

  const handleViewBuildLogs = async (build: Build) => {
    if (!user?.token) return;

    setViewingBuildInfo(build);
    setLogsDialogOpen(true);
    setLoadingLogs(true);
    setViewingBuildLogs('');

    try {
      const response = await buildApi.getBuildLogs(user.token, build.id);
      if (response.success && response.data) {
        setViewingBuildLogs(response.data.logs || 'No logs available');
      } else {
        setViewingBuildLogs('Failed to load logs');
      }
    } catch (err) {
      setViewingBuildLogs('Failed to load logs');
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleViewLastBuildLogs = async (project: BuildProject) => {
    if (!user?.token) return;

    // First get the latest build for this project
    try {
      const response = await buildApi.getProjectBuilds(user.token, project.id, 1);
      if (response.success && response.data && response.data.builds.length > 0) {
        const lastBuild = response.data.builds[0];
        handleViewBuildLogs(lastBuild);
      }
    } catch (err) {
      console.error('Failed to fetch last build');
    }
  };

  // ==================== Dockerfile Editor Handlers ====================

  const handleOpenDockerfileEditor = async (project: BuildProject) => {
    if (!user?.token) return;

    setSelectedProject(project);
    setLoadingDockerfile(true);
    setDockerfileEditorOpen(true);
    setEditorBuildStatus('idle');
    setEditorBuildLogs('');
    setCommitMessage('');

    try {
      const response = await projectApi.getDockerfile(user.token, project.id);
      if (response.success && response.data) {
        setDockerfileContent(response.data.content);
        setOriginalDockerfile(response.data.content);
      } else {
        // If no Dockerfile exists, provide a template
        const template = `# Dockerfile for ${project.name}
FROM ubuntu:22.04

# Install dependencies
RUN apt-get update && apt-get install -y \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy application files
COPY . .

# Set entrypoint
CMD ["bash"]
`;
        setDockerfileContent(template);
        setOriginalDockerfile('');
      }
    } catch (err) {
      setError('Failed to load Dockerfile');
    } finally {
      setLoadingDockerfile(false);
    }
  };

  const handleEditorBuild = async () => {
    if (!user?.token || !selectedProject) return;

    setEditorBuildStatus('building');
    setEditorBuildLogs('Starting build...\n');

    try {
      const response = await buildApi.startBuild(user.token, selectedProject.id, {
        registry_id: selectedProject.default_registry_id || undefined,
      });

      // Response has build_id and tag at top level, not under data
      const buildId = response.build_id;
      const tag = response.tag;

      if (response.success && buildId) {
        setEditorBuildLogs(prev => prev + `Build started with ID: ${buildId}, tag: ${tag}\n`);

        // Poll for build status
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await buildApi.getBuildStatus(user.token, buildId);
            if (statusRes.success && statusRes.data) {
              const build = statusRes.data;

              // Get logs
              const logsRes = await buildApi.getBuildLogs(user.token, buildId);
              if (logsRes.success && logsRes.data) {
                setEditorBuildLogs(logsRes.data.logs || '');
              }

              if (build.status === 'completed') {
                clearInterval(pollInterval);
                setEditorBuildStatus('success');
                setEditorBuildLogs(prev => prev + '\n✓ Build completed successfully!\n');
                fetchData();
              } else if (build.status === 'failed') {
                clearInterval(pollInterval);
                setEditorBuildStatus('failed');
                setEditorBuildLogs(prev => prev + `\n✗ Build failed: ${build.error_message || 'Unknown error'}\n`);
              }
            }
          } catch (err) {
            console.error('Error polling build status');
          }
        }, 2000);

        // Stop polling after 10 minutes
        setTimeout(() => clearInterval(pollInterval), 600000);
      } else {
        setEditorBuildStatus('failed');
        setEditorBuildLogs(prev => prev + `\n✗ Failed to start build: ${response.error}\n`);
      }
    } catch (err) {
      setEditorBuildStatus('failed');
      setEditorBuildLogs(prev => prev + '\n✗ Failed to start build\n');
    }
  };

  const handleCommitDockerfile = async () => {
    if (!user?.token || !selectedProject) return;

    setSavingDockerfile(true);
    try {
      const response = await projectApi.saveDockerfile(
        user.token,
        selectedProject.id,
        dockerfileContent,
        commitMessage || 'Update Dockerfile'
      );

      if (response.success) {
        setOriginalDockerfile(dockerfileContent);
        setCommitMessage('');
        setError(null);
        // Show success message in build logs
        setEditorBuildLogs(prev => prev + `\n✓ Dockerfile committed: ${commitMessage || 'Update Dockerfile'}\n`);
      } else {
        // Show error in build logs as well
        const errorMsg = response.error || 'Failed to commit Dockerfile';
        setEditorBuildLogs(prev => prev + `\n✗ Commit failed: ${errorMsg}\n`);
        setError(errorMsg);
      }
    } catch (err) {
      const errorMsg = 'Failed to commit Dockerfile';
      setEditorBuildLogs(prev => prev + `\n✗ ${errorMsg}\n`);
      setError(errorMsg);
    } finally {
      setSavingDockerfile(false);
    }
  };

  const hasDockerfileChanges = dockerfileContent !== originalDockerfile;

  // ==================== Helper Functions ====================

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'completed':
      case 'online':
        return <Badge className="bg-green-500/10 text-green-400 border-green-500/20">{status === 'online' ? 'Online' : 'Completed'}</Badge>;
      case 'failed':
      case 'offline':
        return <Badge className="bg-red-500/10 text-red-400 border-red-500/20">{status === 'offline' ? 'Offline' : 'Failed'}</Badge>;
      case 'building':
      case 'cloning':
      case 'pushing':
        return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">{status}</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">Pending</Badge>;
      case 'error':
        return <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">Error</Badge>;
      default:
        return <Badge className="bg-gray-500/10 text-gray-400 border-gray-500/20">{status || 'Unknown'}</Badge>;
    }
  };

  // ==================== Stats ====================

  const stats = [
    {
      title: 'Build Projects',
      value: projects.length,
      icon: FolderGit2,
      color: 'white' as const,
    },
    {
      title: 'Registries',
      value: registries.length,
      icon: Database,
      color: 'white' as const,
    },
    {
      title: 'Successful Builds',
      value: projects.filter(p => p.last_build_status === 'completed').length,
      icon: CheckCircle,
      color: 'white' as const,
    },
    {
      title: 'Total Builds',
      value: projects.reduce((acc, p) => acc + (p.build_count || 0), 0),
      icon: History,
      color: 'white' as const,
    },
  ];

  // ==================== Render ====================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Docker Builder</h1>
          <p className="text-muted-foreground">Build and push Docker images to registries</p>
        </div>
        <Button variant="outline" onClick={fetchData}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

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
            <TabsTrigger value="projects" className="flex items-center gap-2">
              <Hammer className="w-4 h-4" />
              Build Projects
            </TabsTrigger>
            <TabsTrigger value="registries" className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              Registries
            </TabsTrigger>
          </TabsList>

          {activeTab === 'projects' && can('manage_projects') && (
            <Button onClick={() => handleOpenProjectDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          )}
          {activeTab === 'registries' && can('manage_registries') && (
            <Button onClick={() => handleOpenRegistryDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Add Registry
            </Button>
          )}
        </div>

        {/* Projects Tab */}
        <TabsContent value="projects">
          <Card>
            <CardHeader>
              <CardTitle>Build Projects</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Repository</TableHead>
                    <TableHead>Registry</TableHead>
                    <TableHead>Last Build</TableHead>
                    <TableHead>Builds</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{project.name}</div>
                          {project.description && (
                            <div className="text-sm text-muted-foreground">{project.description}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <GitBranch className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{project.repo_branch}</span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {project.repo_url}
                        </div>
                      </TableCell>
                      <TableCell>
                        {project.registry_name || <span className="text-muted-foreground">Not set</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {project.last_build_status ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 hover:bg-transparent"
                              onClick={() => handleViewLastBuildLogs(project)}
                              title="Click to view build logs"
                            >
                              {getStatusBadge(project.last_build_status)}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">No builds</span>
                          )}
                          {project.last_tag && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              {project.last_tag}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{project.build_count || 0}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleViewBuilds(project)} title="Build History">
                            <History className="w-4 h-4" />
                          </Button>
                          {can('manage_projects') && (
                            <Button variant="ghost" size="sm" onClick={() => handleOpenDockerfileEditor(project)} title="Edit Dockerfile">
                              <FileCode className="w-4 h-4" />
                            </Button>
                          )}
                          {can('build_images') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenBuildDialog(project)}
                              disabled={buildInProgress === project.id}
                              title="Quick Build"
                            >
                              {buildInProgress === project.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Play className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                          {can('manage_projects') && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => handleOpenProjectDialog(project)} title="Edit Project">
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Delete Project"
                                onClick={() => {
                                  setSelectedProject(project);
                                  setDeleteProjectDialogOpen(true);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {projects.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No projects configured. Create one to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Registries Tab */}
        <TabsContent value="registries">
          <Card>
            <CardHeader>
              <CardTitle>Registry Servers</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Images</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registries.map((registry) => (
                    <TableRow key={registry.id}>
                      <TableCell className="font-medium">{registry.name}</TableCell>
                      <TableCell className="text-muted-foreground">{registry.url}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{registry.registry_type}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(registry.stats?.status)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto p-1 text-blue-400 hover:text-blue-300 hover:underline"
                          onClick={() => handleViewImages(registry)}
                          disabled={!registry.stats?.image_count}
                        >
                          {registry.stats?.image_count || 0} images
                        </Button>
                      </TableCell>
                      <TableCell>
                        {registry.is_default && (
                          <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">Default</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleTestConnection(registry)}
                            disabled={testingConnection === registry.id}
                          >
                            {testingConnection === registry.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <TestTube className="w-4 h-4" />
                            )}
                          </Button>
                          {can('manage_registries') && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => handleOpenRegistryDialog(registry)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedRegistry(registry);
                                  setDeleteRegistryDialogOpen(true);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {registries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No registries configured. Add one to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Registry Dialog */}
      <Dialog open={registryDialogOpen} onOpenChange={setRegistryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditingRegistry ? 'Edit Registry' : 'Add Registry'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reg_name">Name</Label>
              <Input
                id="reg_name"
                value={registryFormData.name}
                onChange={(e) => setRegistryFormData({ ...registryFormData, name: e.target.value })}
                placeholder="My Registry"
              />
            </div>
            <div>
              <Label htmlFor="reg_url">URL</Label>
              <Input
                id="reg_url"
                value={registryFormData.url}
                onChange={(e) => setRegistryFormData({ ...registryFormData, url: e.target.value })}
                placeholder="registry.example.com"
              />
            </div>
            <div>
              <Label htmlFor="reg_type">Type</Label>
              <Select
                value={registryFormData.registry_type}
                onValueChange={(value) => setRegistryFormData({ ...registryFormData, registry_type: value as Registry['registry_type'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private Registry</SelectItem>
                  <SelectItem value="docker_hub">Docker Hub</SelectItem>
                  <SelectItem value="gcr">Google Container Registry</SelectItem>
                  <SelectItem value="ecr">AWS ECR</SelectItem>
                  <SelectItem value="acr">Azure Container Registry</SelectItem>
                  <SelectItem value="harbor">Harbor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="reg_username">Username (optional)</Label>
              <Input
                id="reg_username"
                value={registryFormData.username}
                onChange={(e) => setRegistryFormData({ ...registryFormData, username: e.target.value })}
                placeholder="Username"
              />
            </div>
            <div>
              <Label htmlFor="reg_password">Password (optional)</Label>
              <Input
                id="reg_password"
                type="password"
                value={registryFormData.password}
                onChange={(e) => setRegistryFormData({ ...registryFormData, password: e.target.value })}
                placeholder={isEditingRegistry ? 'Leave blank to keep current' : 'Password'}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="reg_is_default"
                checked={registryFormData.is_default}
                onChange={(e) => setRegistryFormData({ ...registryFormData, is_default: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="reg_is_default">Set as default registry</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegistryDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRegistry}>{isEditingRegistry ? 'Save Changes' : 'Add Registry'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project Dialog */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEditingProject ? 'Edit Project' : 'New Project'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="proj_name">Project Name</Label>
                <Input
                  id="proj_name"
                  value={projectFormData.name}
                  onChange={(e) => setProjectFormData({ ...projectFormData, name: e.target.value })}
                  placeholder="my-app"
                />
              </div>
              <div>
                <Label htmlFor="proj_image_name">Image Name (optional)</Label>
                <Input
                  id="proj_image_name"
                  value={projectFormData.image_name}
                  onChange={(e) => setProjectFormData({ ...projectFormData, image_name: e.target.value })}
                  placeholder="Defaults to project name"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="proj_description">Description</Label>
              <Textarea
                id="proj_description"
                value={projectFormData.description}
                onChange={(e) => setProjectFormData({ ...projectFormData, description: e.target.value })}
                placeholder="Project description"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="proj_repo_url">Repository URL</Label>
              <Input
                id="proj_repo_url"
                value={projectFormData.repo_url}
                onChange={(e) => setProjectFormData({ ...projectFormData, repo_url: e.target.value })}
                placeholder="https://github.com/user/repo.git"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="proj_branch">Branch</Label>
                <Input
                  id="proj_branch"
                  value={projectFormData.repo_branch}
                  onChange={(e) => setProjectFormData({ ...projectFormData, repo_branch: e.target.value })}
                  placeholder="main"
                />
              </div>
              <div>
                <Label htmlFor="proj_git_pat">Git PAT (for GitHub, GitLab, Bitbucket)</Label>
                <Input
                  id="proj_git_pat"
                  type="password"
                  value={projectFormData.git_pat}
                  onChange={(e) => setProjectFormData({ ...projectFormData, git_pat: e.target.value })}
                  placeholder={isEditingProject ? 'Leave blank to keep current' : 'Personal Access Token'}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Required for private repositories. Supports GitHub, GitLab, and Bitbucket.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="proj_dockerfile">Dockerfile Path</Label>
                <Input
                  id="proj_dockerfile"
                  value={projectFormData.dockerfile_path}
                  onChange={(e) => setProjectFormData({ ...projectFormData, dockerfile_path: e.target.value })}
                  placeholder="Dockerfile"
                />
              </div>
              <div>
                <Label htmlFor="proj_context">Build Context</Label>
                <Input
                  id="proj_context"
                  value={projectFormData.build_context}
                  onChange={(e) => setProjectFormData({ ...projectFormData, build_context: e.target.value })}
                  placeholder="."
                />
              </div>
            </div>
            <div>
              <Label htmlFor="proj_registry">Default Registry</Label>
              <Select
                value={projectFormData.default_registry_id || "none"}
                onValueChange={(value) => setProjectFormData({ ...projectFormData, default_registry_id: value === "none" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a registry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {registries.map((registry) => (
                    <SelectItem key={registry.id} value={registry.id.toString()}>
                      {registry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="proj_auto_tag"
                checked={projectFormData.auto_increment_tag}
                onChange={(e) => setProjectFormData({ ...projectFormData, auto_increment_tag: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="proj_auto_tag">Auto-increment tag version</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveProject}>{isEditingProject ? 'Save Changes' : 'Create Project'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Build Dialog */}
      <Dialog open={buildDialogOpen} onOpenChange={setBuildDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Build: {selectedProject?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="build_tag">Tag (optional)</Label>
              <Input
                id="build_tag"
                value={buildFormData.tag}
                onChange={(e) => setBuildFormData({ ...buildFormData, tag: e.target.value })}
                placeholder={selectedProject?.auto_increment_tag ? 'Auto-generated' : 'v1.0.0'}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {selectedProject?.last_tag && `Last tag: ${selectedProject.last_tag}`}
              </p>
            </div>
            <div>
              <Label htmlFor="build_registry">Push to Registry</Label>
              <Select
                value={buildFormData.registry_id || "none"}
                onValueChange={(value) => setBuildFormData({ ...buildFormData, registry_id: value === "none" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a registry (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Don't push</SelectItem>
                  {registries.map((registry) => (
                    <SelectItem key={registry.id} value={registry.id.toString()}>
                      {registry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBuildDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleStartBuild} disabled={buildInProgress !== null}>
              {buildInProgress !== null ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Starting...</>
              ) : (
                <><Play className="w-4 h-4 mr-2" />Start Build</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Build History Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Build History: {selectedProject?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Triggered By</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedBuilds.map((build) => (
                  <TableRow key={build.id}>
                    <TableCell className="font-mono">{build.tag}</TableCell>
                    <TableCell>{getStatusBadge(build.status)}</TableCell>
                    <TableCell className="text-sm">{new Date(build.started_at).toLocaleString()}</TableCell>
                    <TableCell>{build.duration_seconds ? `${build.duration_seconds}s` : '-'}</TableCell>
                    <TableCell>{build.triggered_by_name || '-'}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewBuildLogs(build)}
                        title="View Logs"
                      >
                        <Terminal className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {selectedBuilds.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No builds yet</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Registry Confirmation */}
      <AlertDialog open={deleteRegistryDialogOpen} onOpenChange={setDeleteRegistryDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Registry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedRegistry?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRegistry} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Project Confirmation */}
      <AlertDialog open={deleteProjectDialogOpen} onOpenChange={setDeleteProjectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedProject?.name}"? This will also delete all build history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Registry Images Dialog */}
      <Dialog open={imagesDialogOpen} onOpenChange={setImagesDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Images in {selectedRegistry?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {loadingImages ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : registryImages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No images found in this registry
              </div>
            ) : (
              <div className="space-y-4">
                {registryImages.map((image) => (
                  <Card key={image.name} className="bg-muted/50">
                    <CardHeader className="py-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Database className="w-4 h-4" />
                        {image.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-2">
                      {image.tags.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No tags available</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tag</TableHead>
                              <TableHead>Full Image Name</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {image.tags.map((tag) => (
                              <TableRow key={tag.name}>
                                <TableCell>
                                  <Badge variant="outline" className="font-mono">
                                    {tag.name}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-sm text-muted-foreground">
                                  {tag.full_name}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImagesDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dockerfile Editor Dialog */}
      <Dialog open={dockerfileEditorOpen} onOpenChange={setDockerfileEditorOpen}>
        <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="w-5 h-5" />
              Dockerfile Editor: {selectedProject?.name}
            </DialogTitle>
          </DialogHeader>

          {loadingDockerfile ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex-1 flex gap-4 min-h-0">
              {/* Editor Panel */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Dockerfile</span>
                    {hasDockerfileChanges && (
                      <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                        Unsaved changes
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleEditorBuild}
                      disabled={editorBuildStatus === 'building'}
                    >
                      {editorBuildStatus === 'building' ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Building...</>
                      ) : (
                        <><Hammer className="w-4 h-4 mr-2" />Build Image</>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Code Editor */}
                <div className="flex-1 border rounded-lg overflow-hidden bg-[#1e1e1e]">
                  <textarea
                    value={dockerfileContent}
                    onChange={(e) => setDockerfileContent(e.target.value)}
                    className="w-full h-full p-4 bg-[#1e1e1e] text-[#d4d4d4] font-mono text-sm resize-none focus:outline-none"
                    style={{
                      lineHeight: '1.5',
                      tabSize: 2,
                    }}
                    spellCheck={false}
                    placeholder="# Enter your Dockerfile content here..."
                  />
                </div>

                {/* Commit Section - Only show after successful build */}
                {editorBuildStatus === 'success' && hasDockerfileChanges && (
                  <div className="mt-4 p-4 border rounded-lg bg-green-500/5 border-green-500/20">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="w-5 h-5 text-green-400" />
                      <span className="font-medium text-green-400">Build successful! Ready to commit changes.</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Commit message (e.g., 'Add new dependencies')"
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        onClick={handleCommitDockerfile}
                        disabled={savingDockerfile}
                      >
                        {savingDockerfile ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Committing...</>
                        ) : (
                          <><GitCommit className="w-4 h-4 mr-2" />Commit to Git</>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Build Output Panel */}
              <div className="w-[400px] flex flex-col min-h-0">
                <div className="flex items-center gap-2 mb-2">
                  <Terminal className="w-4 h-4" />
                  <span className="text-sm font-medium">Build Output</span>
                  {editorBuildStatus === 'building' && (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  )}
                  {editorBuildStatus === 'success' && (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  )}
                  {editorBuildStatus === 'failed' && (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                </div>
                <div className="flex-1 border rounded-lg overflow-hidden bg-[#0d1117]">
                  <pre className="w-full h-full p-4 text-xs font-mono text-[#c9d1d9] overflow-auto whitespace-pre-wrap">
                    {editorBuildLogs || 'Build output will appear here...'}
                  </pre>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-shrink-0 mt-4">
            <Button variant="outline" onClick={() => setDockerfileEditorOpen(false)}>
              <X className="w-4 h-4 mr-2" />
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Build Logs Dialog */}
      <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              Build Logs
              {viewingBuildInfo && (
                <span className="text-sm font-normal text-muted-foreground">
                  - {viewingBuildInfo.tag} ({viewingBuildInfo.status})
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {viewingBuildInfo && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-shrink-0">
              <span>Started: {new Date(viewingBuildInfo.started_at).toLocaleString()}</span>
              {viewingBuildInfo.duration_seconds && (
                <span>Duration: {viewingBuildInfo.duration_seconds}s</span>
              )}
              {getStatusBadge(viewingBuildInfo.status)}
            </div>
          )}

          <div className="flex-1 min-h-0 mt-4">
            {loadingLogs ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="h-full border rounded-lg overflow-hidden bg-[#0d1117]">
                <pre className="w-full h-full p-4 text-sm font-mono text-[#c9d1d9] overflow-auto whitespace-pre-wrap">
                  {viewingBuildLogs}
                </pre>
              </div>
            )}
          </div>

          <DialogFooter className="flex-shrink-0 mt-4">
            <Button variant="outline" onClick={() => setLogsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDockerBuilder;
