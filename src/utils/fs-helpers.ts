import { createWriteStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { logger } from './logger.js';

/**
 * Ensure a directory exists, creating it if necessary
 */
async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    logger.error(`Failed to create directory ${dirPath}`, error as Error);
    throw new Error(`Failed to create directory: ${dirPath}`);
  }
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a directory exists
 */
export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Write a configuration file with proper error handling
 */
export async function writeConfigFile(filePath: string, content: string): Promise<void> {
  try {
    const dir = path.dirname(filePath);
    await ensureDirectory(dir);
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    logger.error(`Failed to write config file ${filePath}`, error as Error);
    throw new Error(`Failed to write configuration file: ${filePath}`);
  }
}

/**
 * List subdirectories in a directory
 */
export async function listDirectories(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    logger.error(`Failed to list directories in ${dirPath}`, error as Error);
    throw new Error(`Failed to list directories: ${dirPath}`);
  }
}

/**
 * Create a directory
 */
export async function createDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Remove a directory
 */
export async function removeDirectory(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Download a file from a URL
 */
export async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Download failed: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const fileStream = createWriteStream(destPath);
  const nodeStream = Readable.fromWeb(response.body);
  await pipeline(nodeStream, fileStream);
}

/**
 * Write a PID file
 */
export async function writePidFile(pidPath: string, pid: number): Promise<void> {
  try {
    const dir = path.dirname(pidPath);
    await ensureDirectory(dir);
    await fs.writeFile(pidPath, pid.toString(), 'utf-8');
  } catch (error) {
    logger.error(`Failed to write PID file ${pidPath}`, error as Error);
    throw new Error(`Failed to write PID file: ${pidPath}`);
  }
}

/**
 * Read a PID file
 */
export async function readPidFile(pidPath: string): Promise<number | null> {
  try {
    const content = await fs.readFile(pidPath, 'utf-8');
    const pid = parseInt(content.trim(), 10);
    if (Number.isNaN(pid)) {
      logger.error(`Invalid PID in file ${pidPath}: ${content}`);
      return null;
    }
    return pid;
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      return null;
    }
    logger.error(`Failed to read PID file ${pidPath}`, error as Error);
    throw error;
  }
}

/**
 * Remove a PID file
 */
export async function removePidFile(pidPath: string): Promise<void> {
  try {
    await fs.unlink(pidPath);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') {
      logger.error(`Failed to remove PID file ${pidPath}`, error as Error);
      throw error;
    }
  }
}

/**
 * List PID files in a directory
 */
export async function listPidFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.filter((entry) => entry.endsWith('.pid'));
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      return [];
    }
    logger.error(`Failed to list PID files in ${dirPath}`, error as Error);
    throw error;
  }
}
