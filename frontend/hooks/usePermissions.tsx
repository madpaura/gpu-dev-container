import { useAuth } from './useAuth';

export interface UserPermissions {
  view_dashboard: boolean;
  view_servers: boolean;
  view_containers: boolean;
  view_images: boolean;
  view_logs: boolean;
  view_traffic: boolean;
  manage_users: boolean;
  add_server: boolean;
  delete_server: boolean;
  delete_image: boolean;
  cleanup_server: boolean;
  approve_user: boolean;
  delete_user: boolean;
  create_user: boolean;
  update_user: boolean;
  reset_password: boolean;
  // Docker build & registry permissions
  view_registries: boolean;
  manage_registries: boolean;
  view_projects: boolean;
  manage_projects: boolean;
  build_images: boolean;
  push_images: boolean;
  // Guest OS upload permissions
  view_upload_servers: boolean;
  manage_upload_servers: boolean;
  upload_guest_os: boolean;
}

// Default permissions for each role
const DEFAULT_PERMISSIONS: Record<string, UserPermissions> = {
  admin: {
    view_dashboard: true,
    view_servers: true,
    view_containers: true,
    view_images: true,
    view_logs: true,
    view_traffic: true,
    manage_users: true,
    add_server: true,
    delete_server: true,
    delete_image: true,
    cleanup_server: true,
    approve_user: true,
    delete_user: true,
    create_user: true,
    update_user: true,
    reset_password: true,
    // Docker build & registry permissions
    view_registries: true,
    manage_registries: true,
    view_projects: true,
    manage_projects: true,
    build_images: true,
    push_images: true,
    // Guest OS upload permissions
    view_upload_servers: true,
    manage_upload_servers: true,
    upload_guest_os: true,
  },
  qvp: {
    view_dashboard: true,
    view_servers: true,
    view_containers: true,
    view_images: true,
    view_logs: true,
    view_traffic: true,
    manage_users: false,
    add_server: false,
    delete_server: false,
    delete_image: false,
    cleanup_server: false,
    approve_user: false,
    delete_user: false,
    create_user: false,
    update_user: false,
    reset_password: false,
    // Docker build & registry permissions - QVP has FULL access
    view_registries: true,
    manage_registries: true,
    view_projects: true,
    manage_projects: true,
    build_images: true,
    push_images: true,
    // Guest OS upload permissions - QVP has FULL access
    view_upload_servers: true,
    manage_upload_servers: true,
    upload_guest_os: true,
  },
  user: {
    view_dashboard: false,
    view_servers: false,
    view_containers: false,
    view_images: false,
    view_logs: false,
    view_traffic: false,
    manage_users: false,
    add_server: false,
    delete_server: false,
    delete_image: false,
    cleanup_server: false,
    approve_user: false,
    delete_user: false,
    create_user: false,
    update_user: false,
    reset_password: false,
    // Docker build & registry permissions
    view_registries: false,
    manage_registries: false,
    view_projects: false,
    manage_projects: false,
    build_images: false,
    push_images: false,
    // Guest OS upload permissions
    view_upload_servers: false,
    manage_upload_servers: false,
    upload_guest_os: false,
  },
};

export const usePermissions = () => {
  const { user } = useAuth();

  // Get permissions from user object or use defaults based on role
  const getPermissions = (): UserPermissions => {
    if (!user) {
      return DEFAULT_PERMISSIONS.user;
    }

    // If user has permissions from backend, use those
    if (user.permissions) {
      return user.permissions as UserPermissions;
    }

    // Otherwise, use default permissions based on role
    const role = user.role || 'user';
    return DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.user;
  };

  const permissions = getPermissions();

  // Check if user has a specific permission
  const can = (permission: keyof UserPermissions): boolean => {
    return permissions[permission] ?? false;
  };

  // Check if user can access admin console (admin or qvp)
  const canAccessAdmin = (): boolean => {
    return user?.role === 'admin' || user?.role === 'qvp';
  };

  // Check if user is a full admin
  const isFullAdmin = (): boolean => {
    return user?.role === 'admin';
  };

  // Check if user is a QVP (restricted admin)
  const isQvp = (): boolean => {
    return user?.role === 'qvp';
  };

  return {
    permissions,
    can,
    canAccessAdmin,
    isFullAdmin,
    isQvp,
  };
};

export default usePermissions;
