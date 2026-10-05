const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export interface HealthCheckResponse {
  status: string;
  timestamp: string;
  database: {
    canConnect: boolean;
    provider: string;
    error: string | null;
  };
  version: string;
}

export async function fetchHealth(): Promise<HealthCheckResponse> {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) {
    throw new Error(`Health check returned ${response.status} ${response.statusText}`);
  }
  return response.json();
}
