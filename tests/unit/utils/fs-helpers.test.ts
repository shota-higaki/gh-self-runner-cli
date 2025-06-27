import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDirectory,
  directoryExists,
  downloadFile,
  fileExists,
  listDirectories,
  listPidFiles,
  readPidFile,
  removeDirectory,
  removePidFile,
  writeConfigFile,
  writePidFile,
} from '../../../src/utils/fs-helpers';

// Mock modules
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(),
    access: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
    rm: vi.fn(),
    unlink: vi.fn(),
    stat: vi.fn(),
  },
  mkdir: vi.fn(),
  access: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn(),
  rm: vi.fn(),
  unlink: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('stream', () => ({
  Readable: {
    fromWeb: vi.fn(),
  },
}));

vi.mock('stream/promises', () => ({
  pipeline: vi.fn(),
}));

vi.mock('fs', () => ({
  createWriteStream: vi.fn(() => ({
    on: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  })),
}));

vi.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('fs-helpers', () => {
  const testDir = join(tmpdir(), 'test-fs-helpers');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createDirectory', () => {
    it('should create directory if it does not exist', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined);

      await createDirectory(testDir);

      expect(fs.mkdir).toHaveBeenCalledWith(testDir, { recursive: true });
    });

    it('should handle mkdir errors', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.mkdir).mockRejectedValueOnce(new Error('Permission denied'));

      await expect(createDirectory(testDir)).rejects.toThrow('Permission denied');
    });
  });

  describe('directoryExists', () => {
    it('should return true for existing directory', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.stat).mockResolvedValueOnce({ isDirectory: () => true } as any);

      const exists = await directoryExists(testDir);

      expect(exists).toBe(true);
      expect(fs.stat).toHaveBeenCalledWith(testDir);
    });

    it('should return false for non-existent directory', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.stat).mockRejectedValueOnce(new Error('ENOENT'));

      const exists = await directoryExists(testDir);

      expect(exists).toBe(false);
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);

      const exists = await fileExists('test.txt');

      expect(exists).toBe(true);
      expect(fs.access).toHaveBeenCalledWith('test.txt');
    });

    it('should return false for non-existent file', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockRejectedValueOnce(new Error('ENOENT'));

      const exists = await fileExists('test.txt');

      expect(exists).toBe(false);
    });
  });

  describe('PID file operations', () => {
    describe('writePidFile', () => {
      it('should write PID to file', async () => {
        const fs = await import('fs/promises');
        vi.mocked(fs.writeFile).mockResolvedValueOnce();

        const pidFile = join(testDir, 'test.pid');
        await writePidFile(pidFile, 12345);

        expect(fs.writeFile).toHaveBeenCalledWith(pidFile, '12345', 'utf-8');
      });

      it('should handle write errors', async () => {
        const fs = await import('fs/promises');
        vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error('Write failed'));

        const pidFile = join(testDir, 'test.pid');
        await expect(writePidFile(pidFile, 12345)).rejects.toThrow('Failed to write PID file');
      });
    });

    describe('readPidFile', () => {
      it('should read PID from file', async () => {
        const fs = await import('fs/promises');
        vi.mocked(fs.readFile).mockResolvedValueOnce('12345');

        const pidFile = join(testDir, 'test.pid');
        const pid = await readPidFile(pidFile);

        expect(pid).toBe(12345);
        expect(fs.readFile).toHaveBeenCalledWith(pidFile, 'utf-8');
      });

      it('should return null for invalid PID format', async () => {
        const fs = await import('fs/promises');
        vi.mocked(fs.readFile).mockResolvedValueOnce('invalid');

        const pidFile = join(testDir, 'test.pid');
        const pid = await readPidFile(pidFile);

        expect(pid).toBe(null);
      });

      it('should return null on read errors', async () => {
        const fs = await import('fs/promises');
        const error = new Error('File not found');
        (error as any).code = 'ENOENT';
        vi.mocked(fs.readFile).mockRejectedValueOnce(error);

        const pidFile = join(testDir, 'test.pid');
        const pid = await readPidFile(pidFile);

        expect(pid).toBe(null);
      });
    });

    describe('removePidFile', () => {
      it('should remove PID file', async () => {
        const fs = await import('fs/promises');
        vi.mocked(fs.unlink).mockResolvedValueOnce();

        const pidFile = join(testDir, 'test.pid');
        await removePidFile(pidFile);

        expect(fs.unlink).toHaveBeenCalledWith(pidFile);
      });

      it('should not throw on removal errors', async () => {
        const fs = await import('fs/promises');
        const error = new Error('File not found');
        (error as any).code = 'ENOENT';
        vi.mocked(fs.unlink).mockRejectedValueOnce(error);

        const pidFile = join(testDir, 'test.pid');
        await expect(removePidFile(pidFile)).resolves.not.toThrow();
      });
    });

    describe('listPidFiles', () => {
      it('should list all PID files in directory', async () => {
        const fs = await import('fs/promises');
        vi.mocked(fs.readdir).mockResolvedValueOnce([
          'runner1.pid',
          'runner2.pid',
          'config.json',
          'logs',
        ] as any);

        const pidFiles = await listPidFiles(testDir);

        expect(pidFiles).toEqual(['runner1.pid', 'runner2.pid']);
        expect(fs.readdir).toHaveBeenCalledWith(testDir);
      });

      it('should return empty array if directory does not exist', async () => {
        const fs = await import('fs/promises');
        const error = new Error('ENOENT');
        (error as any).code = 'ENOENT';
        vi.mocked(fs.readdir).mockRejectedValueOnce(error);

        const pidFiles = await listPidFiles(testDir);

        expect(pidFiles).toEqual([]);
      });
    });
  });

  describe('downloadFile', () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should download file successfully', async () => {
      const { pipeline } = await import('stream/promises');
      const { createWriteStream } = await import('fs');
      const { Readable } = await import('stream');

      const mockBody = {
        getReader: vi.fn(),
      };

      const mockResponse = {
        ok: true,
        statusText: 'OK',
        body: mockBody,
      };

      const mockWriteStream = {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      };

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any);
      vi.mocked(createWriteStream).mockReturnValue(mockWriteStream as any);
      vi.mocked(Readable.fromWeb).mockReturnValue({} as any);
      vi.mocked(pipeline).mockResolvedValueOnce();

      await downloadFile('https://example.com/file.zip', '/tmp/file.zip');

      expect(global.fetch).toHaveBeenCalledWith('https://example.com/file.zip');
      expect(createWriteStream).toHaveBeenCalledWith('/tmp/file.zip');
    });

    it('should handle HTTP errors', async () => {
      const mockResponse = {
        ok: false,
        statusText: 'Not Found',
      };

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any);

      await expect(downloadFile('https://example.com/file.zip', '/tmp/file.zip')).rejects.toThrow(
        'Download failed: Not Found',
      );
    });

    it('should handle missing response body', async () => {
      const mockResponse = {
        ok: true,
        statusText: 'OK',
        body: null,
      };

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any);

      await expect(downloadFile('https://example.com/file.zip', '/tmp/file.zip')).rejects.toThrow(
        'No response body',
      );
    });
  });

  describe('directory operations', () => {
    describe('listDirectories', () => {
      it('should list all directories', async () => {
        const fs = await import('fs/promises');
        vi.mocked(fs.readdir).mockResolvedValueOnce([
          { name: 'dir1', isDirectory: () => true } as any,
          { name: 'dir2', isDirectory: () => true } as any,
          { name: 'file.txt', isDirectory: () => false } as any,
        ]);

        const dirs = await listDirectories(testDir);

        expect(dirs).toEqual(['dir1', 'dir2']);
      });

      it('should throw error on failure', async () => {
        const fs = await import('fs/promises');
        vi.mocked(fs.readdir).mockRejectedValueOnce(new Error('ENOENT'));

        await expect(listDirectories(testDir)).rejects.toThrow('Failed to list directories');
      });
    });

    describe('removeDirectory', () => {
      it('should remove directory recursively', async () => {
        const fs = await import('fs/promises');
        vi.mocked(fs.rm).mockResolvedValueOnce();

        await removeDirectory(testDir);

        expect(fs.rm).toHaveBeenCalledWith(testDir, { recursive: true, force: true });
      });
    });
  });

  describe('writeConfigFile', () => {
    it('should write config file', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(fs.writeFile).mockResolvedValueOnce();

      await writeConfigFile('/test/config.yml', 'test content');

      expect(fs.mkdir).toHaveBeenCalledWith('/test', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith('/test/config.yml', 'test content', 'utf-8');
    });

    it('should handle write errors', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error('Write failed'));

      await expect(writeConfigFile('/test/config.yml', 'test content')).rejects.toThrow(
        'Failed to write configuration file',
      );
    });

    it('should handle mkdir errors', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.mkdir).mockRejectedValueOnce(new Error('Permission denied'));

      await expect(writeConfigFile('/test/config.yml', 'test content')).rejects.toThrow(
        'Failed to write configuration file',
      );
    });
  });

  describe('edge cases', () => {
    describe('directoryExists', () => {
      it('should return false when path is a file', async () => {
        const fs = await import('fs/promises');
        vi.mocked(fs.stat).mockResolvedValueOnce({ isDirectory: () => false } as any);

        const exists = await directoryExists('/path/to/file.txt');
        expect(exists).toBe(false);
      });
    });

    describe('removeDirectory', () => {
      it('should ignore ENOENT errors', async () => {
        const fs = await import('fs/promises');
        const error = new Error('Directory not found');
        (error as any).code = 'ENOENT';
        vi.mocked(fs.rm).mockRejectedValueOnce(error);

        await expect(removeDirectory('/non/existent')).resolves.not.toThrow();
      });

      it('should throw non-ENOENT errors', async () => {
        const fs = await import('fs/promises');
        const error = new Error('Permission denied');
        (error as any).code = 'EACCES';
        vi.mocked(fs.rm).mockRejectedValueOnce(error);

        await expect(removeDirectory('/protected')).rejects.toThrow('Permission denied');
      });
    });

    describe('readPidFile', () => {
      it('should handle empty string content', async () => {
        const fs = await import('fs/promises');
        vi.mocked(fs.readFile).mockResolvedValueOnce('');

        const pid = await readPidFile('/test.pid');
        expect(pid).toBe(null);
      });

      it('should handle whitespace-only content', async () => {
        const fs = await import('fs/promises');
        vi.mocked(fs.readFile).mockResolvedValueOnce('   \n\t  ');

        const pid = await readPidFile('/test.pid');
        expect(pid).toBe(null);
      });

      it('should handle PID with extra whitespace', async () => {
        const fs = await import('fs/promises');
        vi.mocked(fs.readFile).mockResolvedValueOnce('  12345  \n');

        const pid = await readPidFile('/test.pid');
        expect(pid).toBe(12345);
      });

      it('should throw non-ENOENT errors', async () => {
        const fs = await import('fs/promises');
        const error = new Error('Permission denied');
        (error as any).code = 'EACCES';
        vi.mocked(fs.readFile).mockRejectedValueOnce(error);

        await expect(readPidFile('/protected.pid')).rejects.toThrow('Permission denied');
      });
    });

    describe('removePidFile', () => {
      it('should throw non-ENOENT errors', async () => {
        const fs = await import('fs/promises');
        const error = new Error('Permission denied');
        (error as any).code = 'EACCES';
        vi.mocked(fs.unlink).mockRejectedValueOnce(error);

        await expect(removePidFile('/protected.pid')).rejects.toThrow('Permission denied');
      });
    });

    describe('listPidFiles', () => {
      it('should throw non-ENOENT errors', async () => {
        const fs = await import('fs/promises');
        const error = new Error('Permission denied');
        (error as any).code = 'EACCES';
        vi.mocked(fs.readdir).mockRejectedValueOnce(error);

        await expect(listPidFiles('/protected')).rejects.toThrow('Permission denied');
      });

      it('should handle mixed file types', async () => {
        const fs = await import('fs/promises');
        vi.mocked(fs.readdir).mockResolvedValueOnce([
          'runner.pid',
          'config.json',
          'test.pid',
          '.pid', // Edge case: file named just .pid
          'pid', // No extension
          'runner.PID', // Wrong case
        ] as any);

        const pidFiles = await listPidFiles('/test');
        expect(pidFiles).toEqual(['runner.pid', 'test.pid', '.pid']);
      });
    });

    describe('writePidFile', () => {
      it('should handle mkdir errors', async () => {
        const fs = await import('fs/promises');
        vi.mocked(fs.mkdir).mockRejectedValueOnce(new Error('Disk full'));

        await expect(writePidFile('/test/runner.pid', 12345)).rejects.toThrow(
          'Failed to write PID file',
        );
      });
    });

    describe('downloadFile', () => {
      it('should handle fetch network errors', async () => {
        vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

        await expect(downloadFile('https://example.com/file.zip', '/tmp/file.zip')).rejects.toThrow(
          'Network error',
        );
      });

      it('should handle pipeline errors', async () => {
        const { pipeline } = await import('stream/promises');
        const { createWriteStream } = await import('fs');
        const { Readable } = await import('stream');

        const mockResponse = {
          ok: true,
          statusText: 'OK',
          body: {},
        };

        vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any);
        vi.mocked(createWriteStream).mockReturnValue({} as any);
        vi.mocked(Readable.fromWeb).mockReturnValue({} as any);
        vi.mocked(pipeline).mockRejectedValueOnce(new Error('Pipe broken'));

        await expect(downloadFile('https://example.com/file.zip', '/tmp/file.zip')).rejects.toThrow(
          'Pipe broken',
        );
      });
    });

    describe('fileExists', () => {
      it('should handle non-ENOENT errors gracefully', async () => {
        const fs = await import('fs/promises');
        vi.mocked(fs.access).mockRejectedValueOnce(new Error('Permission denied'));

        const exists = await fileExists('/protected/file');
        expect(exists).toBe(false);
      });
    });

    describe('createDirectory', () => {
      it('should handle existing directory', async () => {
        const fs = await import('fs/promises');
        const error = new Error('File exists');
        (error as any).code = 'EEXIST';
        vi.mocked(fs.mkdir).mockRejectedValueOnce(error);

        // Should not throw for EEXIST when recursive is true
        await expect(createDirectory('/existing')).rejects.toThrow();
      });
    });
  });
});
