/**
 * API client for Guest OS upload operations
 */

const API_BASE_URL = `${window.location.protocol}//${window.location.host}`;

// ==================== Types ====================

export interface UploadServer {
  id: number;
  name: string;
  ip_address: string;
  port: number;
  protocol: 'sftp' | 'scp' | 'local';
  username?: string;
  base_path: string;
  version_file_path?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by_name?: string;
}

export interface FileItem {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified: string;
}

export interface BrowseResult {
  path: string;
  items: FileItem[];
}

export interface ImageVersion {
  version: string;
  release_date: string;
  changelog: string;
}

export interface VersionsData {
  last_updated: string | null;
  images: Record<string, ImageVersion>;
}

export interface GuestOSUpload {
  id: number;
  server_id: number;
  server_name?: string;
  image_name: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  version: string;
  checksum?: string;
  changelog?: string;
  status: 'uploading' | 'completed' | 'failed';
  error_message?: string;
  uploaded_by?: number;
  uploaded_by_name?: string;
  uploaded_at: string;
  completed_at?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ==================== Helper Functions ====================

async function apiRequest<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) {
      window.dispatchEvent(new CustomEvent('auth:expired'));
      return { success: false, error: 'session expired' };
    }

    if (!response.ok) {
      return {
        success: false,
        error: (data as any).error ?? (data as any).detail ?? (data as any).message ?? `HTTP ${response.status}`,
      };
    }

    return data;
  } catch (error) {
    console.error(`API request failed: ${endpoint}`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Request failed',
    };
  }
}

// ==================== Upload Server API ====================

export const uploadServerApi = {
  /**
   * Get all upload servers
   * Note: Response has servers at top level
   */
  getServers: async (token: string, includeInactive = false): Promise<ApiResponse & { servers?: UploadServer[] }> => {
    return apiRequest(`/api/admin/upload-servers?include_inactive=${includeInactive}`, token);
  },

  /**
   * Get a specific upload server
   */
  getServer: async (token: string, serverId: number): Promise<ApiResponse<UploadServer>> => {
    return apiRequest(`/api/admin/upload-servers/${serverId}`, token);
  },

  /**
   * Create a new upload server
   */
  createServer: async (
    token: string,
    data: Partial<UploadServer>
  ): Promise<ApiResponse<{ server_id: number }>> => {
    return apiRequest('/api/admin/upload-servers', token, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update an upload server
   */
  updateServer: async (
    token: string,
    serverId: number,
    data: Partial<UploadServer>
  ): Promise<ApiResponse> => {
    return apiRequest(`/api/admin/upload-servers/${serverId}`, token, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete an upload server
   */
  deleteServer: async (token: string, serverId: number): Promise<ApiResponse> => {
    return apiRequest(`/api/admin/upload-servers/${serverId}`, token, {
      method: 'DELETE',
    });
  },

  /**
   * Test connection to an upload server
   */
  testConnection: async (token: string, serverId: number): Promise<ApiResponse> => {
    return apiRequest(`/api/admin/upload-servers/${serverId}/test`, token, {
      method: 'POST',
    });
  },
};

// ==================== File Browser API ====================

export const fileBrowserApi = {
  /**
   * Browse files and folders on a server
   * Note: Response has path and items at top level
   */
  browse: async (
    token: string,
    serverId: number,
    path = ''
  ): Promise<ApiResponse & { path?: string; items?: FileItem[] }> => {
    const encodedPath = encodeURIComponent(path);
    return apiRequest(`/api/admin/upload-servers/${serverId}/browse?path=${encodedPath}`, token);
  },

  /**
   * Delete a file or folder
   */
  deleteFile: async (
    token: string,
    serverId: number,
    filePath: string
  ): Promise<ApiResponse> => {
    return apiRequest(`/api/admin/upload-servers/${serverId}/files`, token, {
      method: 'DELETE',
      body: JSON.stringify({ path: filePath }),
    });
  },
};

// ==================== Version API ====================

export const versionApi = {
  /**
   * Get version.json content from server
   * Note: Response has versions at top level
   */
  getVersions: async (
    token: string,
    serverId: number
  ): Promise<ApiResponse & { versions?: VersionsData }> => {
    return apiRequest(`/api/admin/upload-servers/${serverId}/versions`, token);
  },

  /**
   * Get the next version number for an image
   * Note: Response has next_version at top level
   */
  getNextVersion: async (
    token: string,
    serverId: number,
    imageName: string
  ): Promise<ApiResponse & { next_version?: string }> => {
    return apiRequest(`/api/admin/upload-servers/${serverId}/versions/${imageName}/next`, token);
  },
};

// ==================== Upload API ====================

export const uploadApi = {
  /**
   * Upload a guest OS image file
   * Note: This uses FormData for file upload
   */
  uploadFile: async (
    token: string,
    serverId: number,
    file: File,
    imageName: string,
    version: string,
    changelog?: string,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<{ upload_id: number; checksum: string }>> => {
    return new Promise((resolve) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('image_name', imageName);
      formData.append('version', version);
      if (changelog) {
        formData.append('changelog', changelog);
      }

      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch {
          resolve({ success: false, error: 'Invalid response' });
        }
      });

      xhr.addEventListener('error', () => {
        resolve({ success: false, error: 'Upload failed' });
      });

      xhr.open('POST', `${API_BASE_URL}/api/admin/upload-servers/${serverId}/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);
    });
  },

  /**
   * Get upload history for a server
   * Note: Response has uploads at top level
   */
  getUploadHistory: async (
    token: string,
    serverId: number,
    limit = 50
  ): Promise<ApiResponse & { uploads?: GuestOSUpload[] }> => {
    return apiRequest(`/api/admin/upload-servers/${serverId}/uploads?limit=${limit}`, token);
  },
};

export default {
  uploadServerApi,
  fileBrowserApi,
  versionApi,
  uploadApi,
};
