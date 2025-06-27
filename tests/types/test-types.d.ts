import type { ChildProcess } from 'node:child_process';

export interface MockRunner {
  id: string;
  setup: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  removeConfiguration: jest.Mock;
  isRunning: jest.Mock;
  getStatus: jest.Mock;
  getLabels: jest.Mock;
  getId: jest.Mock;
}

export interface MockGitHubClient {
  getRunnerRegistrationToken: jest.Mock;
  deleteRunner: jest.Mock;
  getAllRunners: jest.Mock;
}

export interface MockProcess extends Partial<ChildProcess> {
  pid?: number;
  kill: jest.Mock;
  on: jest.Mock;
  once: jest.Mock;
  stderr?: {
    on: jest.Mock;
  };
}

export interface MockDirent {
  name: string;
  isDirectory: () => boolean;
}
