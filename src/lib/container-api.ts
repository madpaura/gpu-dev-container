/**
 * Container Management API
 */

const API_BASE_URL = `${window.location.protocol}//${window.location.host}/api`;

// Container Management Interfaces
export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: string;
  started: string;
  finished?: string;
  uptime: string;
  cpu_usage: number;
  memory_usage: number;
  memory_used_mb: number;
  memory_limit_mb: number;
  disk_usage?: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
  ports: Array<{
    container_port: string;
    host_ip: string;
    host_port: string;
  }>;
  volumes: Array<{
    source: string;
    destination: string;
    mode: string;
    type: string;
  }>;
  environment: string[];
  command: string;
  labels: Record<string, string>;
  restart_count: number;
  platform: string;
}

export interface ContainerListResponse {
  success: boolean;
  server_id: string;
  server_ip: string;
  containers: ContainerInfo[];
  total_count: number;
  running_count: number;
  stopped_count: number;
  error?: string;
}

export interface ContainerActionResponse {
  success: boolean;
  action: string;
  container_id: string;
  container_name: string;
  message: string;
  new_status?: string;
  error?: string;
}

// Container Management API
export const containerApi = {
  getContainers: async (serverId: string, searchTerm?: string, token?: string): Promise<ContainerListResponse> => {
    const params = new URLSearchParams();
    if (searchTerm) {
      params.append('search', searchTerm);
    }
    
    const queryString = params.toString();
    const url = `/admin/containers/${serverId}${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(`${API_BASE_URL}${url}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  },

  performContainerAction: async (
    serverId: string, 
    containerId: string, 
    action: 'start' | 'stop' | 'restart' | 'delete',
    force: boolean = false,
    token?: string
  ): Promise<ContainerActionResponse> => {
    const response = await fetch(`${API_BASE_URL}/admin/containers/${serverId}/${containerId}/action`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, force }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  },

  clearCache: async (token?: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_BASE_URL}/admin/containers/cache/clear`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  },
};
