import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  Users,
  Container,
  Server,
  Plus,
  Edit,
  Trash2,
  Circle,
  Loader2,
  RefreshCw,
  KeyRound,
  Code,
  BookOpen,
  RefreshCcw,
  AlertTriangle,
  X,
  RotateCcw
} from 'lucide-react';
import { adminApi, type AdminUser, type AdminStats, type UserApprovalResponse, type ContainerCreationResult } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { EditUserDialog } from '../components/EditUserDialog';
import { PasswordResetDialog } from '../components/PasswordResetDialog';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/Toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";



const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'running':
      return 'bg-green-500/10 text-green-700 border-green-500/20';
    case 'stopped':
      return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20';
    case 'error':
      return 'bg-red-500/10 text-red-700 border-red-500/20';
    default:
      return 'bg-gray-500/10 text-gray-700 border-gray-500/20';
  }
};

const getContainerStatusIcon = (status: string) => {
  const color = status === 'running' ? 'text-green-500' :
    status === 'stopped' ? 'text-yellow-500' :
      status === 'failed' ? 'text-red-500' :
        status === 'pending' ? 'text-gray-400' : 'text-red-500';
  return <Circle className={`w-2 h-2 fill-current ${color}`} />;
};

export const AdminUsers: React.FC = () => {
  const { user } = useAuth();
  const { toasts, success, error: showError, removeToast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'edit' | 'create'>('edit');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [userToDeleteName, setUserToDeleteName] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteWorkspace, setDeleteWorkspace] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPasswordResetDialogOpen, setIsPasswordResetDialogOpen] = useState(false);
  const [userToResetPassword, setUserToResetPassword] = useState<AdminUser | null>(null);
  const [isRecreateModalOpen, setIsRecreateModalOpen] = useState(false);
  const [userToRecreate, setUserToRecreate] = useState<AdminUser | null>(null);
  const [isRecreating, setIsRecreating] = useState(false);

  const fetchData = async (isRefresh = false) => {
    if (!user?.token) return;

    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const [usersResponse, statsResponse] = await Promise.all([
        adminApi.getAdminUsers(user.token),
        adminApi.getAdminStats(user.token)
      ]);

      if (usersResponse.success && usersResponse.data) {
        setUsers(usersResponse.data.users);
      } else {
        setError(usersResponse.error || 'Failed to fetch users');
      }

      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data.stats);
      }
    } catch (err) {
      setError('Failed to fetch data');
    } finally {
      if (isRefresh) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchData(false);
  }, [user?.token]);

  const handleRefresh = () => {
    fetchData(true);
  };

  const handleDeleteUser = (userId: string, userName: string) => {
    setUserToDelete(userId);
    setUserToDeleteName(userName);
    setDeleteWorkspace(false); // Reset checkbox
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmedDelete = async () => {
    if (!user?.token || !userToDelete) return;

    try {
      setIsDeleting(true);
      const response = await adminApi.deleteUser(userToDelete, user.token, deleteWorkspace);
      if (response.success) {
        const message = deleteWorkspace && response.data?.workspace_deleted
          ? 'User and workspace deleted successfully!'
          : 'User deleted successfully!';
        success(message);
        setUsers(users.filter(u => u.id !== userToDelete));
        setIsDeleteDialogOpen(false);
        setUserToDelete(null);
        setUserToDeleteName(null);
        setDeleteWorkspace(false);
      } else {
        showError('Failed to delete user', response.error || 'Unknown error occurred');
      }
    } catch (err) {
      showError('Failed to delete user', 'Network error occurred');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditUser = (userToEdit: AdminUser) => {
    setEditingUser(userToEdit);
    setDialogMode('edit');
    setIsEditDialogOpen(true);
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setDialogMode('create');
    setIsEditDialogOpen(true);
  };

  const handleSaveUser = async (userId: string, userData: Partial<AdminUser>) => {
    if (!user?.token) return;

    try {
      const response = await adminApi.updateUser(userId, userData, user.token);
      if (response.success) {
        success('User updated successfully!');
        // Refresh data to get updated user info
        await fetchData(false);
      } else {
        showError('Failed to update user', response.error || 'Unknown error occurred');
      }
    } catch (err) {
      showError('Failed to update user', 'Network error occurred');
    }
  };

  const handleApproveUser = async (userId: string, server: string, resources: { cpu: string; ram: string; gpu: string }) => {
    if (!user?.token) return;

    try {
      const response = await adminApi.approveUser(userId, server, resources, user.token);
      if (response.success && response.data) {
        const { container_result, user_approved } = response.data;

        if (user_approved) {
          if (container_result.success) {
            success(`User approved successfully! Container created: ${container_result.container?.name || 'Unknown'}`);
          } else {
            success(`User approved successfully, but container creation failed: ${container_result.message}`);
          }
        } else {
          showError('Failed to approve user', 'User approval failed');
        }

        // Refresh data to get updated user info
        await fetchData(false);
      } else {
        showError('Failed to approve user', response.error || response.data?.error || 'Unknown error occurred');
      }
    } catch (err) {
      showError('Failed to approve user', 'Network error occurred');
    }
  };

  const handleCreateUser = async (userData: {
    name: string;
    email: string;
    password?: string;
    role: string;
    status: string;
    server: string;
    resources: { cpu: string; ram: string; gpu: string };
  }) => {
    if (!user?.token) return;

    try {
      const response = await adminApi.createUser(userData, user.token);
      if (response.success) {
        // Show success message with default password if provided
        if (response.data?.defaultPassword) {
          success(
            'User created successfully!',
            `Default password: ${response.data.defaultPassword}. Please share this with the user.`
          );
        } else {
          success('User created successfully!');
        }
        // Refresh data to show new user
        await fetchData(false);
      } else {
        showError('Failed to create user', response.error || 'Unknown error occurred');
      }
    } catch (err) {
      showError('Failed to create user', 'Network error occurred');
    }
  };

  const handleCloseEditDialog = () => {
    setIsEditDialogOpen(false);
    setEditingUser(null);
    setDialogMode('edit');
  };

  const handleResetPassword = (userToReset: AdminUser) => {
    setUserToResetPassword(userToReset);
    setIsPasswordResetDialogOpen(true);
  };

  const handlePasswordResetSubmit = async (newPassword: string) => {
    if (!user?.token || !userToResetPassword) return;

    try {
      const response = await adminApi.resetUserPassword(userToResetPassword.id, newPassword, user.token);
      if (response.success) {
        success('Password reset successfully!', 'The new password has been set for the user.');
        setIsPasswordResetDialogOpen(false);
        setUserToResetPassword(null);
      } else {
        showError('Failed to reset password', response.error || 'Unknown error occurred');
      }
    } catch (err) {
      showError('Failed to reset password', 'Network error occurred');
    }
  };

  const handleRecreateContainer = (userToRecreateContainer: AdminUser) => {
    setUserToRecreate(userToRecreateContainer);
    setIsRecreateModalOpen(true);
  };

  const handleRecreateContainerSubmit = async (wipeData: boolean) => {
    if (!user?.token || !userToRecreate) return;

    try {
      setIsRecreating(true);
      const response = await adminApi.recreateUserContainer(userToRecreate.id, user.token, wipeData);

      if (response.success) {
        const actionDesc = wipeData ? 'with fresh data' : 'with data preserved';
        success(
          `Container recreated ${actionDesc}!`,
          `The container for ${userToRecreate.name} has been recreated successfully.`
        );
        setIsRecreateModalOpen(false);
        setUserToRecreate(null);
        // Refresh data to get updated status
        await fetchData(true);
      } else {
        showError('Failed to recreate container', response.error || 'Unknown error occurred');
      }
    } catch (err) {
      showError('Failed to recreate container', 'Network error occurred');
    } finally {
      setIsRecreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading users...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error: {error}</p>
          <Button onClick={() => fetchData(false)} className="mt-2">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground mt-1">Manage users and their container resources</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
            className="gap-2"
          >
            {isRefreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Refresh</span>
              </>
            )}
          </Button>
          <Button className="gap-2" onClick={handleAddUser}>
            <Plus className="w-4 h-4" />
            Add New User
          </Button>
        </div>
      </div>

      {/* Users Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Users</h2>
          <p className="text-muted-foreground text-sm">Manage existing users and their container allocations</p>
        </div>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Container</TableHead>
                  <TableHead>Resources</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="text-xs">
                            {user.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium text-foreground">{user.name}</div>
                          <div className="text-sm text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{user.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {user.container === 'NA' ? (
                          <Circle className="w-2 h-2 fill-current text-gray-400" />
                        ) : (
                          getContainerStatusIcon(user.containerStatus)
                        )}
                        <span className={`font-mono text-sm ${user.container === 'NA' ? 'text-muted-foreground italic' : user.containerStatus === 'failed' ? 'text-red-500' : ''}`}>
                          {user.container === 'NA' ? 'Pending Assignment' :
                            user.containerStatus === 'failed' ? 'Creation Failed' : user.container}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm space-y-1">
                        <div className={user.resources.cpu === 'NA' ? 'text-muted-foreground italic' : ''}>
                          CPU: {user.resources.cpu === 'NA' ? 'Not assigned' : user.resources.cpu}
                        </div>
                        <div className={user.resources.ram === 'NA' ? 'text-muted-foreground italic' : ''}>
                          RAM: {user.resources.ram === 'NA' ? 'Not assigned' : user.resources.ram}
                        </div>
                        <div className={user.resources.gpu === 'NA' ? 'text-muted-foreground italic' : ''}>
                          GPU: {user.resources.gpu === 'NA' ? 'Not assigned' : user.resources.gpu}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className={`font-medium ${user.server === 'NA' ? 'text-muted-foreground italic' : ''}`}>
                          {user.server === 'NA' ? 'Not assigned' : user.server}
                        </div>
                        <div className={`text-muted-foreground ${user.serverLocation === 'NA' ? 'italic' : ''}`}>
                          {user.serverLocation === 'NA' ? 'Pending assignment' : user.serverLocation}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(user.status)}>
                        {user.status === 'Pending' && user.isNewRegistration ? 'Awaiting Approval' : user.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {/* VSCode Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-8 w-8 p-0 ${user.serviceUrls?.vscode ? 'text-blue-600 hover:text-blue-700 hover:bg-blue-50' : 'opacity-40 cursor-not-allowed'}`}
                          onClick={() => user.serviceUrls?.vscode && window.open(user.serviceUrls.vscode, '_blank')}
                          disabled={!user.serviceUrls?.vscode}
                          title={user.serviceUrls?.vscode ? `Open VSCode for ${user.name}` : 'VSCode not available'}
                        >
                          <Code className="w-4 h-4" />
                        </Button>
                        {/* Jupyter Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-8 w-8 p-0 ${user.serviceUrls?.jupyter ? 'text-orange-600 hover:text-orange-700 hover:bg-orange-50' : 'opacity-40 cursor-not-allowed'}`}
                          onClick={() => user.serviceUrls?.jupyter && window.open(user.serviceUrls.jupyter, '_blank')}
                          disabled={!user.serviceUrls?.jupyter}
                          title={user.serviceUrls?.jupyter ? `Open Jupyter for ${user.name}` : 'Jupyter not available'}
                        >
                          <BookOpen className="w-4 h-4" />
                        </Button>
                        <div className="w-px h-6 bg-border mx-1" /> {/* Separator */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleEditUser(user)}
                          title="Edit user"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleResetPassword(user)}
                          title="Reset password"
                        >
                          <KeyRound className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-8 w-8 p-0 text-purple-600 hover:text-purple-700 hover:bg-purple-50 ${user.container === 'NA' ? 'opacity-40 cursor-not-allowed' : ''}`}
                          onClick={() => user.container !== 'NA' && handleRecreateContainer(user)}
                          disabled={user.container === 'NA' || isRecreating}
                          title={user.container === 'NA' ? 'No container assigned' : `Recreate container for ${user.name}`}
                        >
                          {isRecreating && userToRecreate?.id === user.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCcw className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-8 w-8 p-0 text-destructive hover:text-destructive ${user.role?.toLowerCase() === 'admin' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          onClick={() => { if (user.role?.toLowerCase() !== 'admin') handleDeleteUser(user.id, user.name); }}
                          disabled={(isDeleting && userToDelete === user.id) || user.role?.toLowerCase() === 'admin'}
                          title={user.role?.toLowerCase() === 'admin' ? 'Admin users cannot be deleted' : 'Delete user'}
                        >
                          {isDeleting && userToDelete === user.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.totalUsersChange || '+0 from last month'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Containers</CardTitle>
            <Container className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeContainers || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.containerUtilization || '0% utilization'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Servers</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.availableServers || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.serverStatus || 'Status unknown'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Edit User Dialog */}
      <EditUserDialog
        user={editingUser}
        isOpen={isEditDialogOpen}
        onClose={handleCloseEditDialog}
        onSave={handleSaveUser}
        onApprove={handleApproveUser}
        onCreate={handleCreateUser}
        mode={dialogMode}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={(open) => {
        setIsDeleteDialogOpen(open);
        if (!open) {
          setDeleteWorkspace(false);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User: {userToDeleteName}</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the user account, container, and nginx routes.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Workspace deletion option */}
          <div className="flex items-start space-x-3 py-4 px-1">
            <input
              type="checkbox"
              id="delete-workspace"
              checked={deleteWorkspace}
              onChange={(e) => setDeleteWorkspace(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-destructive focus:ring-destructive"
            />
            <div className="flex flex-col">
              <label htmlFor="delete-workspace" className="text-sm font-medium text-foreground cursor-pointer">
                Also delete workspace folder
              </label>
              <span className="text-xs text-muted-foreground">
                This will permanently remove all user files and data from the server
              </span>
            </div>
          </div>

          {deleteWorkspace && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm text-destructive">
              <strong>Warning:</strong> All files in the user's workspace will be permanently deleted. This cannot be recovered.
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmedDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                deleteWorkspace ? "Delete User & Workspace" : "Delete User"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Password Reset Dialog */}
      {userToResetPassword && (
        <PasswordResetDialog
          isOpen={isPasswordResetDialogOpen}
          onClose={() => {
            setIsPasswordResetDialogOpen(false);
            setUserToResetPassword(null);
          }}
          onReset={handlePasswordResetSubmit}
          userName={userToResetPassword.name}
          userEmail={userToResetPassword.email}
        />
      )}

      {/* Recreate Container Modal */}
      {isRecreateModalOpen && userToRecreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-purple-500/10 to-blue-500/10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/20">
                  <RefreshCcw className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Recreate Container</h3>
                  <p className="text-xs text-muted-foreground">for {userToRecreate.name}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsRecreateModalOpen(false);
                  setUserToRecreate(null);
                }}
                className="p-1 rounded-lg hover:bg-muted transition-colors"
                disabled={isRecreating}
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <p className="text-muted-foreground text-sm">
                Choose how you want to recreate the container for <strong>{userToRecreate.name}</strong>:
              </p>

              {/* Option 1: Keep Data */}
              <button
                onClick={() => handleRecreateContainerSubmit(false)}
                disabled={isRecreating}
                className="w-full p-4 rounded-lg border-2 border-border hover:border-blue-500 hover:bg-blue-500/5 transition-all text-left group disabled:opacity-50"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20 group-hover:bg-blue-500/30 transition-colors">
                    <RotateCcw className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground mb-1">Keep User Data</h4>
                    <p className="text-xs text-muted-foreground">
                      Recreate the container while preserving all workspace files, projects, and settings.
                    </p>
                  </div>
                  {isRecreating && (
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  )}
                </div>
              </button>

              {/* Option 2: Fresh Start */}
              <button
                onClick={() => handleRecreateContainerSubmit(true)}
                disabled={isRecreating}
                className="w-full p-4 rounded-lg border-2 border-border hover:border-orange-500 hover:bg-orange-500/5 transition-all text-left group disabled:opacity-50"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/20 group-hover:bg-orange-500/30 transition-colors">
                    <AlertTriangle className="w-5 h-5 text-orange-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground mb-1">Fresh Start (Wipe Data)</h4>
                    <p className="text-xs text-muted-foreground">
                      Recreate the container and wipe all user data. Workspace will be reset to default state.
                    </p>
                    <div className="mt-2 flex items-center gap-1.5 text-orange-400 text-xs font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      <span>This action cannot be undone</span>
                    </div>
                  </div>
                  {isRecreating && (
                    <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                  )}
                </div>
              </button>
            </div>

            {/* Modal Footer */}
            <div className="px-6 pb-6">
              <button
                onClick={() => {
                  setIsRecreateModalOpen(false);
                  setUserToRecreate(null);
                }}
                disabled={isRecreating}
                className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
};