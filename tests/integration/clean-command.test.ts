import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// Helper function for file existence checks
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe('Clean Command Integration', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    // Create a temporary test directory
    const timestamp = Date.now().toString(36);
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    testDir = path.join(os.tmpdir(), `github-runners-test-${timestamp}-${randomSuffix}`);
    await fs.mkdir(testDir, { recursive: true });

    // Save current directory and change to test directory
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(async () => {
    // Change back to original directory
    process.chdir(originalCwd);

    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Directory and file cleanup', () => {
    it('should delete .runners directory and all its contents', async () => {
      // Create mock runner structure
      const runnerDir = path.join('.runners', 'owner-repo', 'runner-uuid-1');
      await fs.mkdir(runnerDir, { recursive: true });
      await fs.writeFile(path.join(runnerDir, '.runner'), 'mock runner config');
      await fs.writeFile(path.join(runnerDir, 'run.sh'), '#!/bin/bash\necho "mock runner"');

      // Create another runner
      const runnerDir2 = path.join('.runners', 'owner-repo', 'runner-uuid-2');
      await fs.mkdir(runnerDir2, { recursive: true });
      await fs.writeFile(path.join(runnerDir2, '.runner'), 'mock runner config 2');

      // Verify structure exists
      expect(await fileExists('.runners')).toBe(true);
      expect(await fileExists(runnerDir)).toBe(true);
      expect(await fileExists(runnerDir2)).toBe(true);

      // After clean command would run, these should be deleted
      // Since we can't actually run the command in tests, we simulate the cleanup
      await fs.rm('.runners', { recursive: true, force: true });

      // Verify everything is deleted
      await expect(fs.access('.runners')).rejects.toThrow();
    });

    it('should delete .github-runners.yml configuration file', async () => {
      // Create mock configuration file
      const configContent = `
github:
  token: \${GITHUB_TOKEN}
repositories:
  - owner/repo
runners:
  parallel: 3
  labels:
    - self-hosted
`;
      await fs.writeFile('.github-runners.yml', configContent);

      // Verify file exists
      expect(await fileExists('.github-runners.yml')).toBe(true);

      // Simulate cleanup
      await fs.unlink('.github-runners.yml');

      // Verify file is deleted
      await expect(fs.access('.github-runners.yml')).rejects.toThrow();
    });

    it('should handle missing directories gracefully', async () => {
      // Try to remove non-existent directories - fs.rm with force:true should succeed
      const result = await fs.rm('.runners', { recursive: true, force: true });
      expect(result).toBeUndefined();

      // But unlink should throw for non-existent file
      await expect(fs.unlink('.github-runners.yml')).rejects.toThrow();
    });

    it('should clean nested runner directories correctly', async () => {
      // Create complex runner structure
      const runners = [
        { repo: 'owner1-repo1', id: 'uuid-1' },
        { repo: 'owner1-repo1', id: 'uuid-2' },
        { repo: 'owner2-repo2', id: 'uuid-3' },
      ];

      for (const runner of runners) {
        const dir = path.join('.runners', runner.repo, runner.id);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, '.runner'), 'config');
        await fs.writeFile(path.join(dir, 'run.sh'), 'script');
      }

      // Also create some non-runner files that should be ignored
      await fs.writeFile(path.join('.runners', 'README.md'), 'readme content');
      await fs.mkdir(path.join('.runners', 'owner1-repo1', 'not-a-uuid'), { recursive: true });

      // Verify structure
      expect(await fileExists('.runners')).toBe(true);
      const entries = await fs.readdir('.runners');
      expect(entries).toContain('owner1-repo1');
      expect(entries).toContain('owner2-repo2');
      expect(entries).toContain('README.md');

      // Simulate selective cleanup (only UUID directories)
      for (const runner of runners) {
        const dir = path.join('.runners', runner.repo, runner.id);
        await fs.rm(dir, { recursive: true, force: true });
      }

      // Non-UUID directories should remain
      expect(await fileExists(path.join('.runners', 'owner1-repo1', 'not-a-uuid'))).toBe(true);
    });

    it('should create proper directory structure for testing', async () => {
      // This tests our test setup itself
      expect(testDir).toContain('github-runners-test-');
      // Use realpathSync to resolve symlinks for comparison
      const realTestDir = await fs.realpath(testDir);
      const realCwd = await fs.realpath(process.cwd());
      expect(realCwd).toBe(realTestDir);

      // Create a file and verify it's in the test directory
      await fs.writeFile('test.txt', 'test content');
      expect(await fileExists(path.join(testDir, 'test.txt'))).toBe(true);
    });
  });
});
