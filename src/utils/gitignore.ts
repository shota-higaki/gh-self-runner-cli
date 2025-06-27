import * as fs from 'fs/promises';
import { PATHS } from './paths.js';

/**
 * Ensure the .gitignore file contains the self-hosted-runners directory
 */
export async function ensureGitignore(): Promise<void> {
  const gitignorePath = '.gitignore';
  const ignorePattern = `${PATHS.BASE_DIR}/`;

  try {
    // Read existing .gitignore content
    let content = '';
    try {
      content = await fs.readFile(gitignorePath, 'utf-8');
    } catch {
      // File doesn't exist, we'll create it
    }

    // Check if the pattern is already in the file
    const lines = content.split('\n');
    const hasPattern = lines.some(
      (line) => line.trim() === ignorePattern || line.trim() === PATHS.BASE_DIR,
    );

    if (!hasPattern) {
      // Add the pattern
      const newContent = content.trim()
        ? `${content.trim()}\n\n# GitHub self-hosted runners\n${ignorePattern}\n`
        : `# GitHub self-hosted runners\n${ignorePattern}\n`;

      await fs.writeFile(gitignorePath, newContent);
    }
  } catch (_error) {
    // Ignore errors - not critical if we can't update .gitignore
  }
}
