# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_No changes yet_

## [0.2.0] - 2025-06-28

### ⚠️ BREAKING CHANGES

- Configuration files are now stored in a centralized directory (`~/.config/gh-self-runner-cli` by default) instead of the current working directory
- The `.github/self-hosted-runners` directory is no longer created in the current working directory

### ✨ Features

#### Configuration Management
- **Centralized Configuration**: Configuration files are now stored in `~/.config/gh-self-runner-cli` by default
- **Custom Config Directory**: Users can specify a custom configuration directory during `init`
- **Environment Variable Support**: Set `GH_SELF_RUNNER_CONFIG_DIR` to override the default location
- **Repository Reference**: A `.github-self-runner-config` file is created in the repository to reference the configuration location

### 🔄 Changes

- Configuration is now stored outside of the repository by default to reduce noise
- The init command now prompts for the configuration directory location
- All commands now use the centralized configuration directory
- The `.github-self-runner-config` reference file is automatically added to `.gitignore`

### 📋 Migration Guide

For users upgrading from v0.1.0:

1. Run `gh-self-runner-cli init` in your repository
2. Choose a configuration directory (default: `~/.config/gh-self-runner-cli`)
3. Your configuration will be stored in the chosen directory
4. A reference file will be created at `.github-self-runner-config`

[0.2.0]: https://github.com/shota-higaki/gh-self-runner-cli/releases/tag/v0.2.0

## [0.1.0] - 2025-06-27

### 🎉 Initial Release

First public release of GitHub Self-Hosted Runner CLI - a comprehensive tool for managing GitHub Actions self-hosted runners with enterprise-grade features.

### ✨ Features

#### Interactive CLI
- User-friendly interactive prompts for all commands
- Guided setup process with validation
- Smart configuration file detection and auto-migration
- Support for multiple GitHub URL formats

#### Runner Management
- **Automatic Installation**: Downloads and configures runners automatically
- **Multiple Runners**: Support for running multiple runners in parallel
- **Process Management**: PID file-based tracking for reliable cross-command process management
- **Graceful Shutdown**: Signal escalation (SIGINT → SIGTERM → SIGKILL) for clean stops
- **Ghost Process Detection**: Automatic detection and cleanup of stale PID files
- **Clean Command**: Complete removal of runners and configurations with process safety

#### Platform Support
- **Cross-platform**: Full support for Windows, macOS, and Linux
- **Architecture Detection**: Automatic platform and architecture detection
- **Windows Compatibility**: Native Windows process and signal handling

#### Security & Reliability
- **Path Traversal Protection**: Comprehensive validation with URL decoding for repository names
- **Shell Injection Protection**: Secure command execution using spawnSync instead of execSync
- **Automatic Restart**: Runners restart automatically on crash (max 3 attempts)
- **Network Resilience**: Retry logic with exponential backoff
- **Resource Cleanup**: Proper cleanup of processes, listeners, and handles
- **Concurrent Safety**: Mutex locks for thread-safe operations

#### GitHub Integration
- **GitHub CLI Support**: Automatic token retrieval via `gh` CLI
- **API Integration**: Full GitHub API support via Octokit
- **Multiple URL Formats**: Support for various repository URL patterns

#### Developer Experience
- **TypeScript**: Full type safety and IntelliSense support
- **ESM Package**: Modern ES modules via tsup
- **Programmatic API**: Use as a library in your own projects
- **Comprehensive Logging**: Built-in logging system with CLI-aware formatting
- **Extensive Testing**: 260 tests with Vitest, 50.35% code coverage
- **Pre-commit Hooks**: Automatic linting, formatting, and testing

### 📋 Commands

- `init` - Initialize a repository for self-hosted runners
- `start` - Start runners (with optional auto-scaling)
- `stop` - Stop all running runners with graceful shutdown
- `clean` - Remove all runners and configurations
- `status` - Check runner states (RUNNING, GHOST, STOPPED)

### 🔧 Configuration

```yaml
# .github/self-hosted-runners/config.yml
github:
  token: ${GITHUB_TOKEN}  # Auto-retrieved via GitHub CLI

repositories:
  - owner/repo

runners:
  parallel: 3            # Number of parallel runners
  labels:
    - self-hosted
    - linux
    - x64

logging:
  level: info
```

### 🛠️ Technical Stack

- **Runtime**: Node.js 22+ / Bun 1.2+
- **Language**: TypeScript 5.8.3
- **CLI Framework**: Commander.js v14
- **Interactive UI**: @clack/prompts for beautiful CLI interactions
- **GitHub API**: @octokit/rest v22
- **Testing**: Vitest + @vitest/coverage-v8
- **Linting/Formatting**: Biome
- **Build**: tsup (ESM output)
- **Package Manager**: Bun (with bun.lock)
- **Git Hooks**: simple-git-hooks for pre-commit quality checks
- **Dependency Management**: Renovate Bot for automated updates

### 📚 Documentation

- Comprehensive README with usage examples
- API documentation for programmatic usage
- Development guide for contributors (DEVELOPMENT.md)
- Technical specifications in CLAUDE.md
- Version management guide (VERSION_MANAGEMENT.md)
- Changelog following Keep a Changelog format

### 🚧 Known Limitations

- GitHub Enterprise Server support not yet verified
- ARM Linux: Limited testing on ARM-based systems
- Some advanced runner features may require additional configuration

### 🔒 Security Features

- **Input Validation**: Comprehensive validation for all user inputs
- **Path Traversal Protection**: Repository names are sanitized to prevent directory traversal attacks
- **No Shell Execution**: All commands use direct process spawning for security
- **Token Security**: Automatic secure token retrieval via GitHub CLI
- **Process Isolation**: Each runner runs in its own isolated process

[0.1.0]: https://github.com/shota-higaki/gh-self-runner-cli/releases/tag/v0.1.0