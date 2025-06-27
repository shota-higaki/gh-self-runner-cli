import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm'],
  dts: true,
  shims: true,
  skipNodeModulesBundle: true,
  clean: true,
  target: 'node22',
  platform: 'node',
  minify: false,
  bundle: true,
  keepNames: true,
  cjsInterop: true,
  splitting: false,
  treeshake: true,
  outDir: 'dist',
  onSuccess: async () => {
    // Add shebang to CLI entry point after build
    const cliPath = join('dist', 'cli', 'index.js');
    const content = await readFile(cliPath, 'utf8');
    if (!content.startsWith('#!/usr/bin/env node')) {
      await writeFile(cliPath, `#!/usr/bin/env node\n${content}`);
    }
    await chmod(cliPath, 0o755);
  },
});
