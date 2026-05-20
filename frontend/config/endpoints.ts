// API endpoint configuration
export interface EndpointConfig {
  name: string;
  url: string;
  description: string;
  documentation?: string;
  sampleNotebook?: string;
}

export const API_ENDPOINTS: Record<string, EndpointConfig> = {
  ollama: {
    name: 'Ollama API',
    url: `${window.location.protocol}//${window.location.hostname}:11434/api`,
    description: 'Local Ollama API ',
    documentation: 'https://github.com/jmorganca/ollama/blob/main/docs/api.md',
    sampleNotebook: '/notebooks/ollama-api-sample.ipynb'
  },
  // Add more endpoints as needed
  openai_compatible: {
    name: 'OpenAI Compatible API',
    url: `${window.location.protocol}//${window.location.hostname}:11434/v1`,
    description: 'OpenAI-compatible API endpoint for Ollama',
    documentation: 'https://github.com/jmorganca/ollama/blob/main/docs/openai.md'
  }
};

// Get endpoint URL by key
export const getEndpointUrl = (key: string): string => {
  return API_ENDPOINTS[key]?.url || '';
};

// Get all available endpoints
export const getAllEndpoints = (): EndpointConfig[] => {
  return Object.values(API_ENDPOINTS);
};
