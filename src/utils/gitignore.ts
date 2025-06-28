import * as fs from 'fs/promises';
import { PATHS } from './paths.js';

/**
 * Ensure the .gitignore file contains the self-hosted-runners directory
 */
export async function ensureGitignore(additionalPatterns: string[] = []): Promise<void> {
  const gitignorePath = '.gitignore';
  const patterns = [
    ...(PATHS.BASE_DIR.startsWith('.') ? [`${PATHS.BASE_DIR}/`] : []),
    ...additionalPatterns,
  ];

  if (patterns.length === 0) {
    return;
  }

  try {
    // Read existing .gitignore content
    let content = '';
    try {
      content = await fs.readFile(gitignorePath, 'utf-8');
    } catch {
      // File doesn't exist, we'll create it
    }

    // Check which patterns need to be added
    const lines = content.split('\n');
    const patternsToAdd = patterns.filter(
      (pattern) =>
        !lines.some(
          (line) => line.trim() === pattern || line.trim() === pattern.replace(/\/$/, ''),
        ),
    );

    if (patternsToAdd.length > 0) {
      // Add the patterns
      const newPatterns = patternsToAdd.join('\n');
      const newContent = content.trim()
        ? `${content.trim()}\n\n# GitHub self-hosted runners\n${newPatterns}\n`
        : `# GitHub self-hosted runners\n${newPatterns}\n`;

      await fs.writeFile(gitignorePath, newContent);
    }
  } catch (_error) {
    // Ignore errors - not critical if we can't update .gitignore
  }
}
