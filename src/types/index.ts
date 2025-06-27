export interface GitHubConfig {
  token: string;
  baseUrl?: string;
}

export interface Repository {
  owner: string;
  repo: string;
}

export interface Runner {
  id: number;
  name: string;
  os: string;
  status: 'active' | 'idle' | 'offline';
  labels: string[];
}

export interface RunnerConfig {
  repository: Repository;
  name: string;
  labels: string[];
}

export interface RunnerGroup {
  id: string;
  repository: Repository;
  runners: Runner[];
  targetCount: number;
  labels?: string[];
}

export interface RunnerStatus {
  id: number;
  name: string;
  status: string;
}

export interface ManagerConfig {
  github: GitHubConfig;
  repositories: string[];
  runners: {
    parallel?: number;
    min?: number;
    max?: number;
    labels?: string[];
    id?: string; // Single runner ID
  };
  logging?: {
    level: string;
  };
}
