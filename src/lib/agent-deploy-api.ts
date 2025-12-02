/**
 * Agent Deployment API Client
 * ---------------------------
 * API client for deploying agents to remote servers.
 */

const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}`;
const API_BASE = `${API_BASE_URL}/api/admin/agent-deploy`;

export interface SSHCredentials {
  server_ip: string;
  ssh_user: string;
  ssh_password: string;
  ssh_port?: number;
}

export interface DeploymentConfig extends SSHCredentials {
  agent_port?: number;
  agent_install_path?: string;
  template_source_path?: string;
  template_deploy_path?: string;
  manager_ip?: string;
  manager_port?: number;
  docker_image?: string;
  docker_tag?: string;
  service_user?: string;
  create_venv?: boolean;
  registry_url?: string;
  registry_user?: string;
  registry_password?: string;
}

export interface PrerequisiteCheck {
  name: string;
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  message: string;
  details?: string;
  required: boolean;
}

export interface DeploymentStatus {
  status: string;
  current_step: string;
  progress_percent: number;
  logs: string[];
  prerequisites: PrerequisiteCheck[];
  error?: string;
  started_at?: string;
  completed_at?: string;
}

export interface TestConnectionResponse {
  success: boolean;
  message: string;
  hostname?: string;
  system?: string;
}

export interface CheckPrerequisitesResponse {
  success: boolean;
  prerequisites: PrerequisiteCheck[];
  logs: string[];
  error?: string;
}

export interface DeployResponse {
  success: boolean;
  deployment_id?: string;
  message?: string;
  status?: DeploymentStatus;
  error?: string;
}

export interface DeploymentStatusResponse {
  success: boolean;
  status?: DeploymentStatus;
  error?: string;
}

export interface TemplatePath {
  path: string;
  contents: string[];
  item_count: number;
}

export interface TemplatePathsResponse {
  success: boolean;
  templates: TemplatePath[];
}

class AgentDeployApi {
  private getHeaders(token: string): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  }

  /**
   * Test SSH connection to a remote server
   */
  async testConnection(
    credentials: SSHCredentials,
    token: string
  ): Promise<TestConnectionResponse> {
    try {
      const response = await fetch(`${API_BASE}/test-connection`, {
        method: 'POST',
        headers: this.getHeaders(token),
        body: JSON.stringify(credentials),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Check prerequisites on a remote server
   */
  async checkPrerequisites(
    config: DeploymentConfig,
    token: string
  ): Promise<CheckPrerequisitesResponse> {
    try {
      const response = await fetch(`${API_BASE}/check-prerequisites`, {
        method: 'POST',
        headers: this.getHeaders(token),
        body: JSON.stringify(config),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        prerequisites: [],
        logs: [],
        error: error instanceof Error ? error.message : 'Failed to check prerequisites',
      };
    }
  }

  /**
   * Start agent deployment to a remote server
   */
  async deploy(
    config: DeploymentConfig,
    token: string
  ): Promise<DeployResponse> {
    try {
      const response = await fetch(`${API_BASE}/deploy`, {
        method: 'POST',
        headers: this.getHeaders(token),
        body: JSON.stringify(config),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Deployment failed',
      };
    }
  }

  /**
   * Get deployment status
   */
  async getDeploymentStatus(
    deploymentId: string,
    token: string
  ): Promise<DeploymentStatusResponse> {
    try {
      const response = await fetch(`${API_BASE}/status/${deploymentId}`, {
        method: 'GET',
        headers: this.getHeaders(token),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get status',
      };
    }
  }

  /**
   * Get available template paths from the management server
   */
  async getTemplatePaths(token: string): Promise<TemplatePathsResponse> {
    try {
      const response = await fetch(`${API_BASE}/template-paths`, {
        method: 'GET',
        headers: this.getHeaders(token),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        templates: [],
      };
    }
  }
}

export const agentDeployApi = new AgentDeployApi();
