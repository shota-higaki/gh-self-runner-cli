import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Get __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('CLI Integration Tests', () => {
  const cliPath = join(__dirname, '../../dist/cli/index.js');

  beforeAll(() => {
    // Ensure the project is built
    // Use bun if available, otherwise fall back to npm
    const packageManager = process.env.npm_execpath?.includes('bun') ? 'bun' : 'npm';
    execSync(`${packageManager} run build`, { cwd: join(__dirname, '../..') });
  });

  describe('help command', () => {
    it('should display help information', () => {
      let output: string;
      try {
        output = execSync(`node ${cliPath} --help`, { encoding: 'utf8', stdio: 'pipe' });
      } catch (error) {
        const execError = error as { stdout?: string; stderr?: string };
        output = execError.stdout || execError.stderr || '';
      }

      expect(output).toContain('gh-self-runner-cli');
      expect(output).toContain('Dynamic GitHub Self-Hosted Runners management tool');
      expect(output).toContain('Commands:');
      expect(output).toContain('init');
      expect(output).toContain('start');
      expect(output).toContain('stop');
    });
  });

  describe('version command', () => {
    it('should display version', () => {
      let output: string;
      try {
        output = execSync(`node ${cliPath} --version`, { encoding: 'utf8', stdio: 'pipe' });
      } catch (error) {
        const execError = error as { stdout?: string; stderr?: string };
        output = execError.stdout || execError.stderr || '';
      }
      expect(output).toContain('0.1.0');
    });
  });

  describe('init command', () => {
    it('should show help for init command', () => {
      const output = execSync(`node ${cliPath} init --help`, { encoding: 'utf8' });

      expect(output).toContain('Initialize runner configuration for a repository (interactive)');
    });
  });

  describe('start command', () => {
    it('should show help for start command', () => {
      const output = execSync(`node ${cliPath} start --help`, { encoding: 'utf8' });

      expect(output).toContain('Start GitHub runners (interactive)');
      expect(output).toContain('--config');
    });
  });

  describe('stop command', () => {
    it('should show help for stop command', () => {
      const output = execSync(`node ${cliPath} stop --help`, { encoding: 'utf8' });

      expect(output).toContain('Stop runners (interactive)');
      expect(output).toContain('--config');
    });
  });

  describe('config file loading', () => {
    const testConfigPath = join(__dirname, 'test-config.yml');

    afterEach(() => {
      if (fs.existsSync(testConfigPath)) {
        fs.unlinkSync(testConfigPath);
      }
    });

    it('should validate config file format', () => {
      const invalidConfig = `
github:
  token: test-token
# Missing required fields
`;
      fs.writeFileSync(testConfigPath, invalidConfig);

      expect(() => {
        execSync(`node ${cliPath} start --config ${testConfigPath}`, { stdio: 'pipe' });
      }).toThrow();
    });
  });
});
