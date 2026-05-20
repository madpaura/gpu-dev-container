/**
 * API client for Docker registry and build operations
 */

const API_BASE_URL = `${window.location.protocol}//${window.location.host}`;

// ==================== Types ====================

export interface Registry {
  id: number;
  name: string;
  url: string;
  registry_type: 'docker_hub' | 'private' | 'gcr' | 'ecr' | 'acr' | 'harbor';
  username?: string;
  password?: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stats?: {
    image_count: number;
    total_size: number;
    status: 'online' | 'offline' | 'error' | 'unknown';
  };
}

export interface RegistryImage {
  name: string;
  full_name: string;
}

export interface ImageTag {
  name: string;
  full_name: string;
}

export interface BuildProject {
  id: number;
  name: string;
  description?: string;
  repo_url: string;
  repo_branch: string;
  dockerfile_path: string;
  build_context: string;
  git_pat?: string;
  default_registry_id?: number;
  registry_name?: string;
  registry_url?: string;
  image_name?: string;
  auto_increment_tag: boolean;
  last_tag?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  build_count?: number;
  last_build_status?: string;
}

export interface Build {
  id: number;
  project_id: number;
  project_name?: string;
  registry_id?: number;
  registry_name?: string;
  tag: string;
  status: 'pending' | 'cloning' | 'building' | 'pushing' | 'completed' | 'failed';
  build_logs?: string;
  error_message?: string;
  image_digest?: string;
  image_size?: number;
  git_commit?: string;
  triggered_by?: number;
  triggered_by_name?: string;
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
}

export interface ApiResponse<T = any> {
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

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`API request failed: ${endpoint}`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Request failed',
    };
  }
}

// ==================== Registry API ====================

export const registryApi = {
  /**
   * Get all registry servers
   */
  getRegistries: async (token: string, includeInactive = false): Promise<ApiResponse<{ registries: Registry[] }>> => {
    return apiRequest(`/api/admin/registries?include_inactive=${includeInactive}`, token);
  },

  /**
   * Get a specific registry
   */
  getRegistry: async (token: string, registryId: number): Promise<ApiResponse<Registry>> => {
    return apiRequest(`/api/admin/registries/${registryId}`, token);
  },

  /**
   * Create a new registry
   */
  createRegistry: async (
    token: string,
    data: Partial<Registry>
  ): Promise<ApiResponse<{ registry_id: number }>> => {
    return apiRequest('/api/admin/registries', token, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update a registry
   */
  updateRegistry: async (
    token: string,
    registryId: number,
    data: Partial<Registry>
  ): Promise<ApiResponse> => {
    return apiRequest(`/api/admin/registries/${registryId}`, token, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete a registry
   */
  deleteRegistry: async (token: string, registryId: number): Promise<ApiResponse> => {
    return apiRequest(`/api/admin/registries/${registryId}`, token, {
      method: 'DELETE',
    });
  },

  /**
   * Get images from a registry
   */
  getRegistryImages: async (
    token: string,
    registryId: number
  ): Promise<ApiResponse<{ images: RegistryImage[] }>> => {
    return apiRequest(`/api/admin/registries/${registryId}/images`, token);
  },

  /**
   * Get tags for an image
   */
  getImageTags: async (
    token: string,
    registryId: number,
    imageName: string
  ): Promise<ApiResponse<{ tags: ImageTag[] }>> => {
    return apiRequest(`/api/admin/registries/${registryId}/images/${encodeURIComponent(imageName)}/tags`, token);
  },

  /**
   * Test registry connection
   */
  testConnection: async (token: string, registryId: number): Promise<ApiResponse> => {
    return apiRequest(`/api/admin/registries/${registryId}/test`, token, {
      method: 'POST',
    });
  },
};

// ==================== Project API ====================

export const projectApi = {
  /**
   * Get all build projects
   */
  getProjects: async (token: string, includeInactive = false): Promise<ApiResponse<{ projects: BuildProject[] }>> => {
    return apiRequest(`/api/admin/projects?include_inactive=${includeInactive}`, token);
  },

  /**
   * Get a specific project
   */
  getProject: async (token: string, projectId: number): Promise<ApiResponse<BuildProject>> => {
    return apiRequest(`/api/admin/projects/${projectId}`, token);
  },

  /**
   * Create a new project
   */
  createProject: async (
    token: string,
    data: Partial<BuildProject>
  ): Promise<ApiResponse<{ project_id: number }>> => {
    return apiRequest('/api/admin/projects', token, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update a project
   */
  updateProject: async (
    token: string,
    projectId: number,
    data: Partial<BuildProject>
  ): Promise<ApiResponse> => {
    return apiRequest(`/api/admin/projects/${projectId}`, token, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete a project
   */
  deleteProject: async (token: string, projectId: number): Promise<ApiResponse> => {
    return apiRequest(`/api/admin/projects/${projectId}`, token, {
      method: 'DELETE',
    });
  },

  /**
   * Get Dockerfile content
   */
  getDockerfile: async (
    token: string,
    projectId: number
  ): Promise<ApiResponse<{ content: string; path: string }>> => {
    return apiRequest(`/api/admin/projects/${projectId}/dockerfile`, token);
  },

  /**
   * Save Dockerfile content
   */
  saveDockerfile: async (
    token: string,
    projectId: number,
    content: string,
    commitMessage?: string
  ): Promise<ApiResponse> => {
    return apiRequest(`/api/admin/projects/${projectId}/dockerfile`, token, {
      method: 'PUT',
      body: JSON.stringify({ content, commit_message: commitMessage }),
    });
  },
};

// ==================== Build API ====================

export const buildApi = {
  /**
   * Start a new build
   * Note: Response has build_id and tag at top level, not under data
   */
  startBuild: async (
    token: string,
    projectId: number,
    options?: { tag?: string; registry_id?: number }
  ): Promise<ApiResponse & { build_id?: number; tag?: string }> => {
    return apiRequest(`/api/admin/projects/${projectId}/build`, token, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },

  /**
   * Get builds for a project
   */
  getProjectBuilds: async (
    token: string,
    projectId: number,
    limit = 50
  ): Promise<ApiResponse<{ builds: Build[] }>> => {
    return apiRequest(`/api/admin/projects/${projectId}/builds?limit=${limit}`, token);
  },

  /**
   * Get build status
   */
  getBuildStatus: async (token: string, buildId: number): Promise<ApiResponse<Build>> => {
    return apiRequest(`/api/admin/builds/${buildId}`, token);
  },

  /**
   * Get build logs
   */
  getBuildLogs: async (token: string, buildId: number): Promise<ApiResponse<{ logs: string }>> => {
    return apiRequest(`/api/admin/builds/${buildId}/logs`, token);
  },

  /**
   * Push built image to registry
   */
  pushImage: async (
    token: string,
    buildId: number,
    registryId?: number
  ): Promise<ApiResponse> => {
    return apiRequest(`/api/admin/builds/${buildId}/push`, token, {
      method: 'POST',
      body: JSON.stringify({ registry_id: registryId }),
    });
  },
};

export default {
  registry: registryApi,
  project: projectApi,
  build: buildApi,
};
