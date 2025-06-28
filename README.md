# gh-self-runner-cli

[![npm version](https://badge.fury.io/js/gh-self-runner-cli.svg)](https://www.npmjs.com/package/gh-self-runner-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Easy-to-use CLI tool for managing GitHub Self-Hosted Runners

## Quick Start

```bash
# Install globally with Bun
bun add -g gh-self-runner-cli

# Initialize runner for your repository
gh-self-runner-cli init

# Start runners
gh-self-runner-cli start

# That's it! Your self-hosted runners are now running
```

## Features

- 🚀 **Easy Setup** - Interactive CLI guides you through setup in minutes
- 🔄 **Multiple Runners** - Run multiple runners in parallel
- 🔐 **Secure Authentication** - Supports GitHub CLI and Personal Access Tokens
- 📦 **Auto Installation** - Automatically downloads runner binaries
- 🧹 **Clean Removal** - Complete cleanup when runners are no longer needed
- 🌍 **Cross-Platform** - Works on Windows, macOS, and Linux
- 🔧 **Zero Configuration** - Works out of the box with GitHub CLI
- 🎨 **Modern UI** - Beautiful interactive prompts with @clack/prompts
- 📊 **TypeScript Support** - Use as a library in your TypeScript projects
- 📈 **Process Management** - PID-based tracking for reliable cross-command control
- 🔍 **Status Monitoring** - Real-time runner status (RUNNING, GHOST, STOPPED)

## Installation

### Bun (Recommended)
```bash
bun add -g gh-self-runner-cli
```

### npm
```bash
npm install -g gh-self-runner-cli
```

### Without Installation
```bash
bunx gh-self-runner-cli init
```

## Usage

### Initialize Runners

Set up self-hosted runners for your repository:

```bash
gh-self-runner-cli init
```

You'll be prompted for:
- Repository URL (e.g., `owner/repo` or `https://github.com/owner/repo`)
- Configuration directory (default: `~/.config/gh-self-runner-cli`)
- Authentication method (GitHub CLI or Personal Access Token)
- Number of runners to create (default: 1)

### Start Runners

Start configured runners:

```bash
gh-self-runner-cli start
```

Start with a specific config file:

```bash
gh-self-runner-cli start -c path/to/config.yml
```

### Stop Runners

Stop running runners (they will go offline but remain registered):

```bash
gh-self-runner-cli stop
```

### Check Status

View the current state of all runners:

```bash
gh-self-runner-cli status
```

This shows:
- Running runners with their process IDs
- Ghost runners (PID file exists but process is dead)
- Stopped runners

### Clean Up

Remove all runner configurations and unregister from GitHub:

```bash
gh-self-runner-cli clean
```

## Configuration

Configuration is automatically generated at `.github/self-hosted-runners/config.yml`:

```yaml
# GitHub authentication (optional if using GitHub CLI)
github:
  token: ${GITHUB_TOKEN}  # From environment variable or GitHub CLI

repositories:
  - owner/repo

runners:
  parallel: 3            # Number of parallel runners
  labels:
    - self-hosted
    - linux
    - x64

logging:
  level: info           # error, warn, info, debug
```

## Required Permissions

When using a GitHub Personal Access Token, you need:
- `repo` - Full control of private repositories
- `admin:org` - If you have admin access to the organization

## System Requirements

- Node.js 22.0.0 or higher
- Bun 1.2.0 or higher (optional, but recommended)
- OS: Windows, macOS, or Linux
- GitHub CLI (optional, for automatic authentication)

## FAQ

### GitHub CLI not installed?
No problem! You can authenticate using a Personal Access Token instead.

### Multiple repositories?
Run the `init` command for each repository you want to set up.

### Runner crashed?
Simply run `stop` followed by `start` to restart your runners.

### Want to remove everything?
The `clean` command removes all configurations and runners.

### Where are configurations stored?
By default, configurations are stored in `~/.config/gh-self-runner-cli`. You can override this with the `GH_SELF_RUNNER_CONFIG_DIR` environment variable.

## Troubleshooting

### Runners won't start
1. Verify your GitHub authentication is valid
2. Check if self-hosted runners are enabled in your repository settings
3. Review the log files in your configuration directory
4. Run with debug mode: `DEBUG=* gh-self-runner-cli start`

### Permission errors
- Ensure your Personal Access Token has the required permissions
- Verify you have admin access to the repository
- For GitHub CLI users, run `gh auth refresh -s admin:org,repo`

### Windows-specific issues
- Ensure PowerShell execution policy allows scripts
- Run as administrator if permission errors occur

## Development

```bash
# Clone the repository
git clone https://github.com/shota-higaki/gh-self-runner-cli.git
cd gh-self-runner-cli

# Install dependencies
bun install

# Build
bun run build

# Run tests
bun test

# Run tests with coverage
bun run test:coverage

# Lint and format
bun run lint

# Type check
bun run typecheck

# Synchronize versions (after updating .github/versions.env)
bun run sync:versions
```

For detailed development instructions, see [DEVELOPMENT.md](docs/DEVELOPMENT.md).
For version management, see [VERSION_MANAGEMENT.md](docs/VERSION_MANAGEMENT.md).
For release history, see [CHANGELOG.md](docs/CHANGELOG.md).

## Programmatic API

You can also use this package as a library in your Node.js projects:

```typescript
import { RunnerManager, GitHubClient, parseRepository } from 'gh-self-runner-cli';

// Initialize GitHub client
const client = new GitHubClient({ token: process.env.GITHUB_TOKEN });

// Create runner manager
const manager = new RunnerManager(client);

// Initialize repository
const repo = parseRepository('owner/repo');
await manager.initializeRepository(repo, {
  labels: ['self-hosted', 'linux', 'x64']
});

// Start runners
await manager.scale(repo, 3); // Start 3 runners

// Get status
const status = manager.getStatus();
console.log(status);

// Stop all runners
await manager.stopAll();
```

## Contributing

Issues and Pull Requests are welcome!

## License

MIT License - see [LICENSE](LICENSE) for details