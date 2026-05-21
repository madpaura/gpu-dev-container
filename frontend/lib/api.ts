/**
 * API service for communicating with the backend
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

    const jsonResponse = await response.json();

    if (response.status === 401 || response.status === 403) {
      window.dispatchEvent(new CustomEvent('auth:expired'));
      return { success: false, error: 'session expired' };
    }

    if (!response.ok) {
      return {
        success: false,
        error: jsonResponse.error || jsonResponse.message || 'An error occurred',
      };
    }

    // Backend returns {success: true, data: {...}}
    // Extract the data field if it exists, otherwise use the whole response
    const data = jsonResponse.data !== undefined ? jsonResponse.data : jsonResponse;

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
 * Authentication related API calls
 */
export const authApi = {
  async login(email: string, password: string): Promise<ApiResponse<LoginResponse>> {
    return fetchApi<LoginResponse>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  logout: async (token: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();

        return {
          success: response.ok,
          error: !response.ok ? (data.error || 'Logout failed') : undefined,
        };
      } else {
        return { success: response.ok };
      }
    } catch (error) {
      return { success: true };
    }
  },

  validateSession: async (token: string) => {
    const response = await fetch(`${API_BASE_URL}/validate-session`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Session validation failed',
      };
    }

    return {
      success: true,
      data: data.data,
    };
  },

  requestPasswordResetPublic: async (email: string, reason?: string): Promise<ApiResponse<{ message: string }>> => {
    return fetchApi('/public/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email, reason }),
    });
  },

  register: async (name: string, email: string, password: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: name,
          email,
          password
        }),
      });

      const data = await response.json();
      console.log('Raw register response:', data);

      if (!response.ok || data.success === false) {
        return {
          success: false,
          error: data.error || 'Registration failed',
        };
      }

      return {
        success: true,
        data: data.data || { message: data.message || 'Registration successful' },
      };
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };
    }
  },
};

/**
 * User management related API calls
 */
export const userApi = {
  getUsers: async (token: string) => {
    return fetchApi<Array<{
      user_id: number;
      name: string;
      email: string;
      role: string;
      status: string;
    }>>('/users', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  getPendingUsers: async (token: string) => {
    return fetchApi<Array<{
      user_id: number;
      name: string;
      email: string;
      status: string;
    }>>('/users/pending', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  approveUser: async (userId: number, token: string) => {
    return fetchApi<{ message: string }>(`/users/${userId}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  deleteUser: async (userId: number, token: string) => {
    return fetchApi<{ message: string }>(`/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },
};

/**
 * Server resources related API calls
 */
export const resourceApi = {
  getServerResources: async (token: string) => {
    return fetchApi<{
      agents: Array<{
        id: string;
        name: string;
        ip: string;
        status: string;
        resources: {
          cpu: number;
          memory: number;
          gpu: number;
        };
      }>;
    }>('/server-resources', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },
};

/**
 * Admin-specific API calls
 */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  container: string;
  containerStatus: string;
  resources: {
    cpu: string;
    ram: string;
    gpu: string;
  };
  server: string;
  serverLocation: string;
  status: string;
  isNewRegistration?: boolean;
  serviceUrls?: {
    vscode: string | null;
    jupyter: string | null;
  };
}

export interface ServerForUsers {
  id: string;
  ip: string;
  name: string;
  status: 'online' | 'offline' | 'maintenance';
  location: string;
  availability: 'available' | 'limited' | 'unavailable';
  capacity: {
    cpu_usage: number;
    memory_usage: number;
    containers: number;
    max_containers: number;
  };
  resources: {
    cpu_cores: number;
    total_memory: number;
    remaining_cpu: number;
    remaining_memory: number;
  };
}

// Container creation interfaces
export interface ContainerCreationResult {
  success: boolean;
  container?: {
    id: string;
    name: string;
    status: string;
  };
  error?: string;
  message: string;
}

export interface UserApprovalResponse {
  success: boolean;
  container_result: ContainerCreationResult;
  user_approved: boolean;
  error?: string;
}

export interface AdminStats {
  totalUsers: number;
  totalUsersChange: string;
  activeContainers: number;
  containerUtilization: string;
  availableServers: number;
  serverStatus: string;
}

export interface AuditLog {
  id: string;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  timestamp: string;
  user: string;
  source: string;
  message: string;
  ip_address?: string;
  action_type?: string;
}

export interface PasswordResetRequest {
  id: number;
  user_id: number;
  username: string;
  email: string;
  requested_at: string;
  reason?: string;
  status: 'pending' | 'completed' | 'rejected';
}

export const adminApi = {
  async getAdminUsers(token: string): Promise<ApiResponse<{ users: AdminUser[] }>> {
    return fetchApi<{ users: AdminUser[] }>('/admin/users', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  async getAdminStats(token: string): Promise<ApiResponse<{ stats: AdminStats }>> {
    return fetchApi<{ stats: AdminStats }>('/admin/stats', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  async getAuditLogs(token: string): Promise<ApiResponse<{ logs: AuditLog[] }>> {
    return fetchApi<{ logs: AuditLog[] }>('/audit-logs', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  async updateUser(userId: string, userData: Partial<AdminUser>, token: string): Promise<ApiResponse<{}>> {
    return fetchApi<{}>(`/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(userData),
    });
  },

  async deleteUser(userId: string, token: string, deleteWorkspace: boolean = false): Promise<ApiResponse<{ workspace_deleted?: boolean; workspace_path?: string }>> {
    return fetchApi<{ workspace_deleted?: boolean; workspace_path?: string }>(`/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ delete_workspace: deleteWorkspace }),
    });
  },

  async approveUser(userId: string, server: string, resources: { cpu: string; ram: string; gpu: string }, token: string): Promise<ApiResponse<UserApprovalResponse>> {
    return fetchApi<UserApprovalResponse>(`/admin/users/${userId}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ server, resources }),
    });
  },

  async createUser(userData: {
    name: string;
    email: string;
    password?: string;
    role: string;
    status: string;
    server: string;
    resources: { cpu: string; ram: string; gpu: string };
  }, token: string): Promise<ApiResponse<{ message: string; defaultPassword: string }>> {
    return fetchApi<{ message: string; defaultPassword: string }>('/admin/users', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(userData),
    });
  },

  async clearAuditLogs(token: string): Promise<ApiResponse<{ message: string }>> {
    return fetchApi<{ message: string }>('/audit-logs', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  getServersForUsers: async (token: string): Promise<ApiResponse<{ servers: ServerForUsers[] }>> => {
    return fetchApi('/admin/servers/for-users', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  // Password reset methods
  async resetUserPassword(
    userId: string,
    newPassword: string,
    token: string
  ): Promise<ApiResponse<{ message: string }>> {
    return fetchApi(`/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ new_password: newPassword }),
    });
  },

  async getPasswordResetRequests(token: string): Promise<ApiResponse<{
    requests: PasswordResetRequest[];
    count: number;
  }>> {
    return fetchApi('/admin/password-reset-requests', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  async rejectPasswordResetRequest(
    requestId: number,
    token: string
  ): Promise<ApiResponse<{ message: string }>> {
    return fetchApi(`/admin/password-reset-requests/${requestId}/reject`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  async recreateUserContainer(
    userId: string,
    token: string,
    wipeData: boolean = false
  ): Promise<ApiResponse<{ message: string; data_wiped: boolean; target_user: string }>> {
    return fetchApi(`/admin/users/${userId}/container/recreate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ wipe_data: wipeData }),
    });
  },
};

/**
 * Server management interfaces
 */
export interface ServerInfo {
  id: string;
  ip: string;
  status: 'online' | 'offline' | 'maintenance';
  cpu: number;
  memory: number;
  disk: number;
  uptime: string;
  type: string;
  containers: number;
  cpu_cores: number;
  total_memory: number;
  allocated_cpu: number;
  allocated_memory: number;
  remaining_cpu: number;
  remaining_memory: number;
}

export interface ServerStats {
  totalServers: number;
  totalServersChange: string;
  onlineServers: number;
  onlineServersChange: string;
  offlineServers: number;
  offlineServersChange: string;
  maintenanceServers: number;
  maintenanceServersChange: string;
}

/**
 * Server management API calls
 */
export const serverApi = {
  getServers(token: string): Promise<ApiResponse<{ servers: ServerInfo[] }>> {
    return fetchApi('/admin/servers', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  getServerStats(token: string): Promise<ApiResponse<{ stats: ServerStats }>> {
    return fetchApi('/admin/servers/stats', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  performServerAction(
    serverId: string,
    action: string,
    token: string
  ): Promise<ApiResponse<{ message: string }>> {
    return fetchApi(`/admin/servers/${serverId}/action`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ action }),
    });
  },

  addServer(
    serverData: {
      name: string;
      ip: string;
      port: string;
      description: string;
      tags: string[];
    },
    token: string
  ): Promise<ApiResponse<{ message: string; server: any }>> {
    return fetchApi('/admin/servers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(serverData),
    });
  },

  // SSH functionality
  sshConnect(
    serverId: string,
    sshConfig: {
      host?: string;
      port?: string;
      username?: string;
      password?: string;
      key_path?: string;
    },
    token: string
  ): Promise<ApiResponse<{ session_id: string; message: string }>> {
    return fetchApi(`/admin/servers/${serverId}/ssh/connect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ ssh_config: sshConfig }),
    });
  },

  sshExecute(
    sessionId: string,
    command: string,
    token: string
  ): Promise<ApiResponse<{ message: string }>> {
    return fetchApi(`/admin/servers/ssh/${sessionId}/execute`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ command }),
    });
  },

  sshGetOutput(
    sessionId: string,
    token: string
  ): Promise<ApiResponse<{ output: string; connected: boolean }>> {
    return fetchApi(`/admin/servers/ssh/${sessionId}/output`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  sshDisconnect(
    sessionId: string,
    token: string
  ): Promise<ApiResponse<{ message: string }>> {
    return fetchApi(`/admin/servers/ssh/${sessionId}/disconnect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  // Cleanup management
  getCleanupSummary(
    token: string,
    serverId: string,
    credentials: { username: string; password: string }
  ): Promise<ApiResponse<CleanupSummary>> {
    return fetchApi(`/admin/servers/${serverId}/cleanup/summary`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });
  },

  executeCleanup(
    token: string,
    serverId: string,
    request: {
      username: string;
      password: string;
      cleanup_options: CleanupOptions;
    }
  ): Promise<ApiResponse<{ results: CleanupResult[] }>> {
    return fetchApi(`/admin/servers/${serverId}/cleanup/execute`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
  },
};

// Cleanup management interfaces
export interface CleanupContainerInfo {
  id: string;
  image: string;
  command: string;
  created: string;
  status: string;
  ports: string;
  names: string;
}

export interface ImageInfo {
  repository: string;
  tag: string;
  id: string;
  created: string;
  size: string;
}

export interface DiskUsageInfo {
  opt_usage_gb: number;
  opt_usage_percent: number;
  docker_system_usage: number;
  root_usage_percent: number;
  docker_data_usage_gb: number;
}

export interface CleanupSummary {
  success: boolean;
  server_ip: string;
  containers: {
    running: CleanupContainerInfo[];
    stopped: CleanupContainerInfo[];
    sizes_info: string;
  };
  docker_images: {
    images: ImageInfo[];
    dangling_images: ImageInfo[];
    raw_output: string;
  };
  disk_usage: DiskUsageInfo;
  summary: {
    total_containers: number;
    running_containers: number;
    stopped_containers: number;
    total_images: number;
    total_disk_usage: number;
  };
}

export interface CleanupOptions {
  remove_stopped_containers: boolean;
  remove_dangling_images: boolean;
  remove_unused_volumes: boolean;
  remove_unused_networks: boolean;
  docker_system_prune: boolean;
  remove_specific_containers: string[];
  remove_specific_images: string[];
}

export interface CleanupResult {
  operation: string;
  success: boolean;
  output?: string;
  error?: string;
  containers?: string[];
  images?: string[];
}

/**
 * Dashboard-specific interfaces
 */
export interface DashboardStats {
  // User stats
  totalUsers: number;
  activeUsers: number;
  pendingUsers: number;

  // Server stats
  totalServers: number;
  onlineServers: number;
  offlineServers: number;

  // Container stats
  totalContainers: number;
  runningContainers: number;

  // Resource stats
  avgCpuUsage: number;
  avgMemoryUsage: number;
  totalMemoryGB: number;
  usedMemoryGB: number;
}

export interface DashboardContainer {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'stopped' | 'paused';
  server: string;
  cpuUsage: number;
  memoryUsage: number;
  created: string;
  ports: string[];
}

/**
 * User services interfaces
 */
export interface UserService {
  available: boolean;
  url: string | null;
  status: 'running' | 'stopped' | 'starting';
}

export interface ServiceInfo {
  available: boolean;
  url: string | null;
  status: 'running' | 'stopped' | 'starting';
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  username?: string;
  ip_address?: string;
}

export interface LogsResponse {
  success: boolean;
  data?: {
    logs: LogEntry[];
    total: number;
  };
  logs?: LogEntry[];
  total?: number;
  error?: string;
}

export interface GPUInfo {
  available: boolean;
  count?: number;
  gpus?: Array<{
    index: number;
    name: string;
    utilization: number;
    memory_used: number;
    memory_total: number;
    memory_utilization: number;
    temperature: number;
    power_draw: number;
    power_limit: number;
  }>;
  total_memory?: number;
  total_memory_used?: number;
  avg_utilization?: number;
  avg_memory_utilization?: number;
  error?: string;
}

export interface ServerStats {
  cpu_count: number;
  total_memory: number;
  host_cpu_used: number;
  host_memory_used: number;
  total_disk: number;
  used_disk: number;
  uptime: string;
  docker_instances: number;
  running_containers: number;
  allocated_cpu: number;
  allocated_memory: number;
  remaining_cpu: number;
  remaining_memory: number;
  gpu_info?: GPUInfo;
}

export interface UserServicesData {
  success: boolean;
  data: {
    username: string;
    container: {
      id: string | null;
      name: string;
      server: string;
      status: string;
    };
    services: {
      vscode: ServiceInfo;
      jupyter: ServiceInfo;
      intellij: ServiceInfo;
      terminal: ServiceInfo;
    };
    server_stats: ServerStats;
    nginx_available: boolean;
  };
}

// Type alias for the actual data structure used in components
export type UserServicesDataFlat = UserServicesData['data'];

/**
 * User API calls
 */
export const userServicesApi = {
  async getUserServices(token: string): Promise<ApiResponse<{ data: UserServicesData }>> {
    return fetchApi('/user/services', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  async startContainer(token: string): Promise<ApiResponse<{ message: string }>> {
    return fetchApi('/user/container/start', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  async restartContainer(token: string): Promise<ApiResponse<any>> {
    return fetchApi('/user/container/restart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  },

  async recreateContainer(token: string, wipeData: boolean = false): Promise<ApiResponse<{ message: string; data_wiped: boolean }>> {
    return fetchApi('/user/container/recreate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ wipe_data: wipeData })
    });
  },

  async getLogs(token: string, limit?: number, level?: string): Promise<LogsResponse> {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (level) params.append('level', level);

    const response = await fetchApi(`/user/logs?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    return response as LogsResponse;
  },

  async downloadLogs(token: string): Promise<Blob> {
    const response = await fetch('/api/user/logs/download', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to download logs');
    }

    return response.blob();
  },

  async requestPasswordReset(
    token: string,
    reason?: string
  ): Promise<ApiResponse<{ message: string }>> {
    return fetchApi('/user/request-password-reset', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ reason }),
    });
  }
};

/**
 * Dashboard API calls
 */
/**
 * Traffic analytics interfaces
 */
export interface TrafficAnalytics {
  daily_stats: DailyTrafficStats[];
  weekly_stats?: WeeklyTrafficStats[];
  monthly_stats?: MonthlyTrafficStats[];
  top_ips: TopIPStats[];
  top_users: TopUserStats[];
  hourly_distribution: HourlyStats[];
  endpoint_stats: EndpointStats[];
  summary: TrafficSummary;
  date_range: {
    start_date: string;
    end_date: string;
  };
}

export interface DailyTrafficStats {
  date: string;
  total_requests: number;
  unique_ips: number;
  unique_users: number;
  avg_duration: number;
  total_bytes_sent: number;
  total_bytes_received: number;
  error_count: number;
}

export interface WeeklyTrafficStats {
  week_start: string;
  total_requests: number;
  unique_ips: number;
  unique_users: number;
  avg_duration: number;
  total_bytes_sent: number;
  total_bytes_received: number;
  error_count: number;
}

export interface MonthlyTrafficStats {
  month: string;
  total_requests: number;
  unique_ips: number;
  unique_users: number;
  avg_duration: number;
  total_bytes_sent: number;
  total_bytes_received: number;
  error_count: number;
}

export interface TopIPStats {
  ip_address: string;
  request_count: number;
  unique_users: number;
  avg_duration: number;
}

export interface TopUserStats {
  username: string;
  email: string;
  request_count: number;
  unique_ips: number;
  avg_duration: number;
  last_access: string;
}

export interface HourlyStats {
  hour: number;
  request_count: number;
}

export interface EndpointStats {
  endpoint: string;
  request_count: number;
  avg_duration: number;
  error_count: number;
}

export interface TrafficSummary {
  total_requests: number;
  total_unique_ips: number;
  total_unique_users: number;
  avg_daily_requests: number;
  avg_session_duration: number;
  total_errors: number;
  error_rate: number;
}

export interface UserSession {
  session_token: string;
  ip_address: string;
  username: string;
  email: string;
  session_start: string;
  session_end: string;
  total_duration: number;
  request_count: number;
  unique_endpoints: number;
}

export interface RealTimeStats {
  last_24_hours: TrafficAnalytics;
  overall_summary: {
    total_requests: number;
    unique_ips: number;
    unique_users: number;
    total_sessions: number;
    avg_session_duration: number;
    total_bytes_sent: number;
    total_bytes_received: number;
    first_access: string;
    last_access: string;
  };
  timestamp: string;
}

/**
 * Traffic analytics API calls
 */
export const trafficApi = {
  async getTrafficAnalytics(
    token: string,
    period: 'daily' | 'weekly' | 'monthly' = 'daily',
    days: number = 30,
    ipFilter?: string,
    userFilter?: string
  ): Promise<ApiResponse<TrafficAnalytics>> {
    const params = new URLSearchParams({
      period,
      days: days.toString(),
    });

    if (ipFilter) params.append('ip_filter', ipFilter);
    if (userFilter) params.append('user_filter', userFilter);

    return fetchApi(`/admin/traffic/analytics?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  async getRealTimeStats(token: string): Promise<ApiResponse<RealTimeStats>> {
    return fetchApi('/admin/traffic/real-time', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  async getUserActivity(
    token: string,
    userId: number,
    days: number = 7
  ): Promise<ApiResponse<UserSession[]>> {
    return fetchApi(`/admin/traffic/user/${userId}?days=${days}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  async getIPAnalytics(
    token: string,
    ipAddress: string,
    days: number = 30
  ): Promise<ApiResponse<TrafficAnalytics & { sessions: UserSession[] }>> {
    return fetchApi(`/admin/traffic/ip/${encodeURIComponent(ipAddress)}?days=${days}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  async getTopEndpoints(
    token: string,
    days: number = 7
  ): Promise<ApiResponse<EndpointStats[]>> {
    return fetchApi(`/admin/traffic/endpoints?days=${days}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  async getTrafficSummary(token: string): Promise<ApiResponse<{
    total_requests: number;
    unique_ips: number;
    unique_users: number;
    total_sessions: number;
    avg_session_duration: number;
    total_bytes_sent: number;
    total_bytes_received: number;
    first_access: string;
    last_access: string;
  }>> {
    return fetchApi('/admin/traffic/summary', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  },
};

export const dashboardApi = {
  async getDashboardStats(token: string): Promise<ApiResponse<DashboardStats>> {
    // Fetch data from multiple endpoints and combine
    const [adminStatsRes, serverStatsRes, serversRes, pendingUsersRes] = await Promise.all([
      adminApi.getAdminStats(token),
      serverApi.getServerStats(token),
      serverApi.getServers(token),
      userApi.getPendingUsers(token)
    ]);

    if (!adminStatsRes.success || !serverStatsRes.success || !serversRes.success) {
      return {
        success: false,
        error: 'Failed to fetch dashboard data'
      };
    }

    const adminStats = adminStatsRes.data?.stats;
    const serverStats = serverStatsRes.data?.stats;
    const servers = serversRes.data?.servers || [];
    const pendingUsers = pendingUsersRes.data || [];

    // Calculate aggregated stats
    const totalContainers = servers.reduce((sum, server) => sum + (server.containers || 0), 0);
    const onlineServers = servers.filter(s => s.status === 'online');
    const avgCpuUsage = onlineServers.length > 0
      ? onlineServers.reduce((sum, server) => sum + server.cpu, 0) / onlineServers.length
      : 0;
    const avgMemoryUsage = onlineServers.length > 0
      ? onlineServers.reduce((sum, server) => sum + server.memory, 0) / onlineServers.length
      : 0;

    // Calculate total and used memory from server data
    const totalMemoryBytes = onlineServers.reduce((sum, server) => sum + (server.total_memory || 0), 0);
    const totalMemoryGB = totalMemoryBytes / (1024 * 1024 * 1024);
    const usedMemoryGB = totalMemoryGB * (avgMemoryUsage / 100);

    const dashboardStats: DashboardStats = {
      totalUsers: adminStats?.totalUsers || 0,
      activeUsers: adminStats?.activeContainers || 0,
      pendingUsers: pendingUsers.length,

      totalServers: serverStats?.totalServers || 0,
      onlineServers: serverStats?.onlineServers || 0,
      offlineServers: serverStats?.offlineServers || 0,

      totalContainers: totalContainers,
      runningContainers: totalContainers, // Assuming running containers from server data

      avgCpuUsage: Math.round(avgCpuUsage * 10) / 10,
      avgMemoryUsage: Math.round(avgMemoryUsage * 10) / 10,
      totalMemoryGB: Math.round(totalMemoryGB * 100) / 100,
      usedMemoryGB: Math.round(usedMemoryGB * 100) / 100
    };

    return {
      success: true,
      data: dashboardStats
    };
  },

  async getRecentContainers(token: string): Promise<ApiResponse<DashboardContainer[]>> {
    // This would require a new backend endpoint for recent containers
    // For now, return empty array as mentioned to implement later
    return {
      success: true,
      data: []
    };
  }
};
