/**
 * Docker images management API
 */

const API_BASE_URL = `${window.location.protocol}//${window.location.host}/api`;

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Generic fetch wrapper with error handling
 */
async function fetchApi<T>(
  endpoint: string, 
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    const data = await response.json();

    if (response.status === 401 || response.status === 403) {
      window.dispatchEvent(new CustomEvent('auth:expired'));
      return { success: false, error: 'session expired' };
    }

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || 'An error occurred',
      };
    }
    
    return {
      success: true,
      data: data as T,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Docker images management interfaces
 */
export interface DockerImage {
  id: string;
  short_id: string;
  repository: string;
  tag: string;
  full_tag: string;
  size: number;
  virtual_size: number;
  created: string;
  architecture: string;
  os: string;
  parent: string;
  comment: string;
  author: string;
  config: any;
}

export interface DockerImageLayer {
  id: string;
  index: number;
  size: string;
}

export interface DockerImageHistory {
  id: string;
  created: string;
  created_by: string;
  size: number;
  comment: string;
  empty_layer: boolean;
}

export interface DockerImageDetails {
  image_id: string;
  layers: DockerImageLayer[];
  history: DockerImageHistory[];
  config: any;
  architecture: string;
  os: string;
  server_id: string;
}

export interface DockerImagesResponse {
  images: DockerImage[];
  total_count: number;
  total_size: number;
  timestamp: number;
  server_id: string;
  error?: string;
}

export interface ServerListItem {
  id: string;
  ip: string;
  name: string;
  status: 'online' | 'offline' | 'unknown';
}

/**
 * Docker images management API calls
 */
export const dockerApi = {
  /**
   * Get list of available servers
   */
  getServersList(token: string): Promise<ApiResponse<{ servers: ServerListItem[]; total_count: number }>> {
    return fetchApi('/admin/servers/list', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  /**
   * Get Docker images from all servers or a specific server
   */
  getDockerImages(token: string, serverId?: string): Promise<ApiResponse<{ servers: DockerImagesResponse[]; total_servers: number }>> {
    const params = serverId ? `?server_id=${serverId}` : '';
    return fetchApi(`/admin/docker-images${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  /**
   * Get detailed information about a specific Docker image
   */
  getDockerImageDetails(
    serverId: string,
    imageId: string,
    token: string
  ): Promise<ApiResponse<DockerImageDetails>> {
    return fetchApi(`/admin/docker-images/${serverId}/${imageId}/details`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  /**
   * Delete a Docker image from a server
   */
  deleteDockerImage(
    serverId: string,
    imageId: string,
    token: string,
    force: boolean = false
  ): Promise<ApiResponse<{ message: string }>> {
    return fetchApi(`/admin/docker-images/${serverId}/${imageId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ force }),
    });
  },
};
