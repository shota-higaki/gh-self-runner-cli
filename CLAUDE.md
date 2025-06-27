# GitHub Self-Hosted Runner CLI - Technical Specification

This document contains technical implementation details and architectural decisions for the GitHub Self-Hosted Runner CLI project. For general usage and development guides, please refer to:
- [README.md](README.md) - Usage instructions and quick start
- [DEVELOPMENT.md](docs/DEVELOPMENT.md) - Development setup and contribution guide
- [CHANGELOG.md](docs/CHANGELOG.md) - Release history and version changes

## Overview

A CLI tool that enables dynamic configuration and management of GitHub Self-Hosted Runners with an interactive interface designed for users with minimal technical knowledge. The tool supports parallel execution of multiple runners.

## Technical Architecture

### Core Design Principles

1. **Interactive-First Design**: All commands are interactive by default, no positional arguments required
2. **Zero Configuration**: Works out of the box with GitHub CLI authentication
3. **Resilient Operation**: Automatic recovery from failures and network issues
4. **Cross-Platform Support**: Full support for Windows, Linux, and macOS

### Technology Stack

#### Runtime Dependencies
- **@octokit/rest** (v22.0.0): GitHub API v3 client
- **@clack/prompts** (v0.11.0): Modern interactive command line prompts
- **commander** (v14.0.0): CLI framework
- **cosmiconfig** (v9.0.0): Configuration file loader
- **dotenv** (v16.5.0): Environment variable management
- **picocolors** (v1.1.1): Lightweight terminal string styling
- **yaml** (v2.8.0): YAML parser

#### Development Dependencies
- **TypeScript** (v5.8.3): Type safety and modern JavaScript features
- **Biome** (v2.0.5): Linting and formatting
- **Vitest** (v3.2.4): Modern testing framework with native TypeScript support
- **simple-git-hooks** (v2.11.1): Git hooks
- **lint-staged** (v16.1.2): Pre-commit file processing
- **tsup** (v8.5.0): Modern bundling tool

#### Runtime Requirements
- **Node.js**: v22.0.0 or higher
- **Bun**: v1.2.0 or higher (for development)

### Module Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│     CLI     │────▶│   Library    │────▶│   GitHub    │
│  (Commands) │     │   (Core)     │     │     API     │
└─────────────┘     └──────────────┘     └─────────────┘
       │                    │
       ▼                    ▼
┌─────────────┐     ┌──────────────┐
│   Utils     │     │    Types     │
│  (Shared)   │     │(Definitions) │
└─────────────┘     └──────────────┘
```

## Implementation Details

### Runner Management

#### Runner Lifecycle
1. **Initialization**: Download runner package from GitHub
2. **Configuration**: Register with repository using registration token
3. **Execution**: Start runner process with automatic restart
4. **Monitoring**: Health checks and crash recovery
5. **Cleanup**: Proper deregistration and resource cleanup

#### Parallel Runner Support
- Each runner gets a unique UUID
- Independent process management
- Isolated working directories
- Concurrent execution with mutex locks for scaling operations

#### Process Management
- **PID File Tracking**: Each runner process writes its PID to a file for cross-command persistence
- **Graceful Shutdown**: SIGINT → SIGTERM → SIGKILL signal escalation
- **Ghost Process Detection**: Identifies and cleans up stale PID files
- **Multi-Repository Support**: Process management works across all configured repositories

### Security Features

1. **Token Management**
   - Automatic token retrieval from GitHub CLI
   - Secure token validation and type detection
   - No token logging or exposure

2. **Process Isolation**
   - Each runner runs in its own process
   - No shell execution (removed `shell: true`)
   - Proper signal handling

3. **File System Safety**
   - Atomic file operations
   - Directory existence checks before operations
   - Proper cleanup on failure

4. **Path Traversal Protection**
   - Repository names are sanitized to prevent directory traversal attacks
   - URL decoding to catch encoded attacks (e.g., `%2e%2e%2f`)
   - Strict validation of owner/repo names allowing only alphanumeric, hyphens, underscores, and dots
   - Comprehensive test coverage for security edge cases

### Reliability Features

#### Automatic Restart System
```typescript
// Exponential backoff: 1s → 2s → 4s
// Maximum 3 restart attempts
// Prevents infinite restart loops
```

#### Network Error Recovery
- Automatic retry with exponential backoff
- Distinguishes temporary vs permanent failures
- Graceful degradation

#### Resource Management
- Event listener cleanup
- Timer and interval clearing
- File handle closing
- Memory leak prevention

### Platform-Specific Handling

#### Windows Support
- Uses `taskkill` for SIGKILL operations
- Handles Windows-specific signals
- Supports `.cmd` and `.bat` scripts
- Cross-platform path normalization

#### Unix Support (Linux/macOS)
- Standard POSIX signal handling
- Shell script execution
- Native process management

### Configuration System

#### File Locations
```
.github/
└── self-hosted-runners/
    ├── config.yml              # Main configuration
    └── runners/
        └── {owner}-{repo}/
            └── {runner-uuid}/  # Individual runner instance
```

#### Configuration Schema
```typescript
interface ManagerConfig {
  github: {
    token?: string;  // Optional, uses GitHub CLI if not provided
  };
  repositories: string[];
  runners: {
    parallel: number;  // Number of parallel runners (default: 1)
    labels?: string[]; // Custom runner labels
  };
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug';
  };
}
```

### Interactive CLI Design

#### Command Flow
1. Command invoked without arguments
2. Interactive prompts for required information
3. Validation and confirmation
4. Execution with progress indicators
5. Clear success/error messages

#### URL Format Support
Accepts all common GitHub repository URL formats:
- `owner/repo`
- `https://github.com/owner/repo`
- `https://github.com/owner/repo.git`
- `git@github.com:owner/repo.git`
- `github.com/owner/repo`

### Logging System

#### Unified Logger
- CLI-aware output formatting
- Different modes for interactive vs background operation
- Log levels: error, warn, info, debug
- Structured logging for debugging

#### Output Examples
```
✓ Success message (green)
! Warning message (yellow)
× Error message (red)
i Info message (cyan)
```

### Error Handling

#### Error Classification
- `CLIError`: User-facing errors with exit codes
- Network errors: Automatic retry
- File system errors: Graceful cleanup
- Process errors: Restart mechanism

#### Exit Codes
```
1  - General error
2  - Invalid input
3  - Authentication error
4  - Network error
5  - File system error
6  - Configuration error
7  - Permission error
8  - Not found
9  - Already exists
10 - Timeout
```

## Testing Strategy

### Test Framework
- **Vitest**: Fast, native TypeScript support
- **@vitest/coverage-v8**: Code coverage reporting
- **Mock Strategy**: All external dependencies are mocked

### Test Coverage
- Unit tests: Individual module testing
- Integration tests: End-to-end command testing
- Platform tests: Cross-platform compatibility
- Current coverage: 260 tests passing (50.35% code coverage)

### Critical Test Areas
1. Runner lifecycle management
2. Error recovery mechanisms
3. Configuration parsing
4. Platform-specific code paths
5. Interactive prompt flows (@clack/prompts mocking)

### Test Writing Guidelines
1. **Command Testing Complexity**: CLI commands export Command objects, not functions. Testing their action handlers requires:
   - Understanding that action handlers are defined inline
   - Mocking all dependencies before importing the command
   - Using vi.doMock for proper ESM module mocking
   - Creating comprehensive test helpers for common mock setups

2. **Mock Management**: Create centralized mock helpers to:
   - Reduce duplication across test files
   - Ensure consistency in mock behavior
   - Handle complex dependency chains

### Test Modification Guidelines
**When fixing tests, carefully evaluate whether the existing implementation is correct before making changes.** This is to avoid unintended modifications to working code. Always:
1. Understand the original intent of the implementation
2. Verify if the test failure indicates a real bug or just needs test adjustment
3. Consult the existing behavior in production before changing implementation
4. Prefer fixing tests over changing implementation unless there's a clear bug

## Performance Considerations

1. **Lazy Loading**: Commands are loaded on-demand
2. **Efficient File Operations**: Batch operations where possible
3. **Process Management**: Proper resource cleanup
4. **Memory Usage**: Stream large files instead of loading into memory

## Build System

### Package Structure
- **ESM-Only Package**: Modern ES modules
- **Build Tool**: tsup for efficient bundling
- **Entry Points**:
  - `dist/index.js` - Library API (ESM)
  - `dist/cli/index.js` - CLI executable

### Build Configuration
```typescript
// tsup.config.ts
export default {
  entry: {
    index: 'src/index.ts',
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm'],
  dts: true,
  shims: true,
  target: 'node22',
  platform: 'node',
  bundle: true,
}
```

## Known Limitations

1. GitHub Enterprise Server: Untested (community feedback needed)
2. Maximum runners: Practical limit depends on system resources
3. ARM Linux: Limited testing on ARM-based systems

## Future Enhancements

1. **Runner Groups**: Support for organizing runners into groups
2. **Metrics Collection**: Performance and usage statistics
3. **Remote Management**: API for remote runner control
4. **Container Support**: Docker-based runner execution
5. **Auto-scaling**: Dynamic runner scaling based on queue

## Migration Path

### From Legacy Structure
The tool automatically detects and migrates from:
- `.github-runners.yml` → `.github/self-hosted-runners/config.yml`
- Old runner directory structure → New UUID-based structure

## Development Notes

### Code Organization
- **Single Responsibility**: Each module has a clear, single purpose
- **Dependency Injection**: Core modules accept dependencies
- **Interface-First**: Define types before implementation
- **Error Boundaries**: Catch errors at appropriate levels

### Best Practices
1. Always use absolute paths for file operations
2. Validate user input before processing
3. Provide clear error messages with suggestions
4. Test error paths as thoroughly as success paths
5. Document platform-specific behavior
6. Mock platform-specific functions (getPlatformInfo) in tests for consistency
7. Use platform-agnostic path assertions in tests
8. Use @clack/prompts for all interactive CLI elements
9. Prefer picocolors over chalk for terminal colors
10. Always run `bun run build` before committing
11. **Always Read before Update**: To save tokens, always use the Read tool before using Edit/Write/MultiEdit tools
12. **All tests and lint must pass for CI**: All tests and lint checks must pass for CI to succeed and allow merging. When committing with failing pre-commit hooks or tests, understand this constraint and proceed accordingly

### Performance Tips
1. Use `Promise.all()` for concurrent operations
2. Implement caching where appropriate
3. Avoid synchronous file operations
4. Batch API calls when possible

### CI/CD Best Practices
1. **Version Synchronization**: Use `.github/versions.env` for centralized version management
2. **Cross-Platform Testing**: Test on Ubuntu, Windows, and macOS latest versions
3. **Pre-commit Hooks**: Run type checking and tests before commits (using simple-git-hooks)
4. **Node.js Version**: Requires Node.js 22+ for modern ES2023 features
5. **Build Process**: Use `bun run build` before committing to ensure dist files are up to date

### Dependency Management
1. **Automated Updates**: Using Renovate Bot for dependency management
2. **Security Alerts**: Vulnerability alerts automatically create PRs with "security" label
3. **Automerge**: Dependencies are automatically merged after 3-day stability period
4. **Lock File Maintenance**: Automatic lock file updates enabled
5. **No Dashboard**: Dependency dashboard disabled for cleaner repository UI

## Debugging

### Debug Output
```bash
# Enable all debug output
DEBUG=* gh-self-runner-cli start

# Enable specific modules
DEBUG=runner:* gh-self-runner-cli start
DEBUG=github:client gh-self-runner-cli init
```

### Common Issues

1. **Runner Registration Fails**
   - Check token permissions
   - Verify repository settings
   - Ensure runner isn't already registered

2. **Process Crashes**
   - Check system resources
   - Review runner logs
   - Verify platform compatibility

3. **Configuration Not Found**
   - Check file permissions
   - Verify working directory
   - Look for migration messages

## Security Considerations

1. **Token Security**
   - Never log tokens
   - Use environment variables
   - Implement token rotation

2. **Process Security**
   - No arbitrary code execution
   - Validate all inputs
   - Sanitize file paths

3. **Network Security**
   - HTTPS only for API calls
   - Certificate validation
   - Timeout on all requests

## Contributing

For contribution guidelines, see [DEVELOPMENT.md](docs/DEVELOPMENT.md).

Key areas for contribution:
1. Platform-specific improvements
2. Error message clarity
3. Performance optimizations
4. Test coverage expansion
5. Documentation improvements

## Technical Debt and Future Improvements

### Code Quality
1. **Test Coverage**: Current coverage is 50.35%. Priority areas for improvement:
   - CLI commands - all around 10-14% coverage
   - Core utilities (gitignore.ts at 8.33% needs improvement)

2. **Code Duplication**: Several patterns are repeated across command files:
   - **Error handling**: All commands use identical try-catch patterns
   - **Configuration loading**: Similar logic in start.ts and stop.ts
   - **Runner status display**: Duplicated between start and stop commands
   - **Token retrieval**: Multiple variations of GitHub token handling
   - **Validation logic**: Repository parsing repeated across commands

3. **Refactoring Opportunities**:
   - Extract common error handler wrapper function
   - Create unified configuration loading utility
   - Standardize token retrieval patterns
   - Create reusable UI components for runner status display
   - Implement command wrapper pattern for common operations

### Known Issues
1. **GitHub CLI Token Expiry**: Tokens from GitHub CLI can expire, requiring re-authentication. Current implementation now handles this by:
   - Checking auth status before attempting to use tokens
   - Offering re-authentication when tokens expire
   - Providing clear messaging about authentication state

2. **Build Warnings**: False positive warnings about unused imports (Readable, pipeline) from tsup tree-shaking

3. **Test Execution**: Use `bun run test` instead of `bun test` due to vi.mock compatibility issues with bun's test runner

### Performance Considerations
1. Consider implementing connection pooling for GitHub API calls
2. Add caching layer for runner status queries
3. Optimize parallel runner startup times