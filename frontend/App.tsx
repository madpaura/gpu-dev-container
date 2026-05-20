import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { Register } from './components/Register';
import { LoadingScreen } from './components/LoadingScreen';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminServers } from './pages/AdminServers';
import { AdminUsers } from './pages/AdminUsers';
import { AdminLogs } from './pages/AdminLogs';
import { AdminImages } from './pages/AdminImages';
import AdminContainerManager from './pages/AdminContainerManager';
import AdminTraffic from './pages/AdminTraffic';
import { AdminDockerBuilder } from './pages/AdminDockerBuilder';
import AdminGuestOS from './pages/AdminGuestOS';
import { UserDashboard } from './pages/UserDashboard';
import { UserContainers } from './pages/UserContainers';
import { UserFileBrowser } from './pages/UserFileBrowser';
import { usePermissions } from './hooks/usePermissions';

// Helper to check if user can access admin routes (admin or qvp)
const canAccessAdminRoutes = (role?: string): boolean => {
  return role === 'admin' || role === 'qvp';
};

// Helper to get redirect path based on role
const getRedirectPath = (role?: string): string => {
  return canAccessAdminRoutes(role) ? '/admin' : '/user';
};

const ProtectedRoute: React.FC<{ 
  children: React.ReactNode; 
  requiredRole?: 'admin' | 'user';
  requiresPermission?: string;
}> = ({ 
  children, 
  requiredRole,
  requiresPermission
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { can } = usePermissions();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // For admin routes, allow both admin and qvp users
  if (requiredRole === 'admin') {
    if (!canAccessAdminRoutes(user?.role)) {
      return <Navigate to="/user" replace />;
    }
    
    // Check specific permission if required
    if (requiresPermission && !can(requiresPermission as any)) {
      return <Navigate to="/admin" replace />;
    }
  } else if (requiredRole === 'user' && user?.role !== 'user') {
    return <Navigate to={getRedirectPath(user?.role)} replace />;
  }

  return <Layout>{children}</Layout>;
};

const AppRoutes: React.FC = () => {
  const { isAuthenticated, user, isLoading } = useAuth();

  console.log('AppRoutes: isAuthenticated:', isAuthenticated, 'user:', user, 'isLoading:', isLoading);

  if (isLoading) {
    console.log('AppRoutes: Still loading...');
    return <LoadingScreen />;
  }

  return (
    <Routes>
      <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to={getRedirectPath(user?.role)} replace />} />
      <Route path="/register" element={!isAuthenticated ? <Register /> : <Navigate to={getRedirectPath(user?.role)} replace />} />
      <Route path="/" element={<Navigate to={isAuthenticated ? getRedirectPath(user?.role) : '/login'} replace />} />
      
      {/* Admin Routes */}
      <Route path="/admin" element={
        <ProtectedRoute requiredRole="admin">
          <AdminDashboard />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/servers" element={
        <ProtectedRoute requiredRole="admin">
          <AdminServers />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/users" element={
        <ProtectedRoute requiredRole="admin" requiresPermission="manage_users">
          <AdminUsers />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/logs" element={
        <ProtectedRoute requiredRole="admin">
          <AdminLogs />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/images" element={
        <ProtectedRoute requiredRole="admin">
          <AdminImages />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/containers" element={
        <ProtectedRoute requiredRole="admin">
          <AdminContainerManager />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/traffic" element={
        <ProtectedRoute requiredRole="admin">
          <AdminTraffic />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/docker-builder" element={
        <ProtectedRoute requiredRole="admin">
          <AdminDockerBuilder />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/guest-os" element={
        <ProtectedRoute requiredRole="admin">
          <AdminGuestOS />
        </ProtectedRoute>
      } />
      
      {/* User Routes */}
      <Route path="/user" element={
        <ProtectedRoute requiredRole="user">
          <UserDashboard />
        </ProtectedRoute>
      } />
      
      <Route path="/user/containers" element={
        <ProtectedRoute requiredRole="user">
          <UserContainers />
        </ProtectedRoute>
      } /> 
      
      <Route path="/user/files" element={
        <ProtectedRoute requiredRole="user">
          <UserFileBrowser />
        </ProtectedRoute>
      } />
      
      {/* Catch all route */}
      <Route path="*" element={<Navigate to={getRedirectPath(user?.role)} replace />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
