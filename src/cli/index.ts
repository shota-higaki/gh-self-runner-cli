#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import dotenv from 'dotenv';
import { logger } from '../utils/index.js';
import { cleanCommand } from './commands/clean.js';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { statusCommand } from './commands/status.js';
import { stopCommand } from './commands/stop.js';

dotenv.config();

// Get __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'),
) as { version: string };

const program = new Command();

program
  .name('gh-self-runner-cli')
  .description('Dynamic GitHub Self-Hosted Runners management tool')
  .version(packageJson.version);

program.addCommand(initCommand);
program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(statusCommand);
program.addCommand(cleanCommand);

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}

void main();
