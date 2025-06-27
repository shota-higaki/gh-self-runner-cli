# Development Guide

This guide provides information for developers who want to contribute to or work with the GitHub Self-Hosted Runner CLI project.

## Prerequisites

- Node.js 22 or later
- Bun 1.2.0 or later (used as the package manager and test runner)
- Git
- GitHub CLI (optional, for testing GitHub integration)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/shota-higaki/gh-self-runner-cli.git
cd gh-self-runner-cli
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Build the Project

```bash
bun run build
```

## Development Workflow

### Available Scripts

- `bun run build` - Build the project using tsup (dual CJS/ESM output)
- `bun run dev` - Build in watch mode
- `bun run clean` - Remove the dist directory
- `bun run format` - Format code using Biome
- `bun run lint` - Lint code using Biome
- `bun run lint:fix` - Lint and fix code issues
- `bun run test` - Run tests using Vitest
- `bun run test:watch` - Run tests in watch mode
- `bun run test:coverage` - Run tests with coverage report
- `bun run typecheck` - Check TypeScript types without emitting files
- `bun run sync:versions` - Synchronize versions from .github/versions.env
- `bun run check` - Run all checks (lint, typecheck, test, build)

### Code Quality

This project uses several tools to maintain code quality:

- **TypeScript 5.8.3** - For type safety
- **Biome** - Fast linting and formatting (replaced ESLint/Prettier)
- **Vitest** - Modern testing framework (migrated from Jest)
- **tsup** - Build tool for dual CJS/ESM output
- **simple-git-hooks** - For Git hooks
- **lint-staged** - For running linters on staged files
- **@clack/prompts** - Modern CLI prompts (replaced chalk/ora/inquirer)

### Pre-commit Hooks

When you commit code, the following checks are automatically run:

1. **lint-staged** - Runs Biome on staged TypeScript files
2. **TypeScript** - Type checking
3. **Tests** - Runs the full test suite

If any of these checks fail, the commit will be blocked.

## Testing

### Running Tests

```bash
# Run all tests
bun run test

# Run tests in watch mode
bun run test:watch

# Run tests with coverage
bun run test:coverage
```

### Test Structure

```
tests/
├── unit/           # Unit tests for individual modules
│   ├── cli/        # CLI command tests
│   ├── lib/        # Library function tests
│   └── utils/      # Utility function tests
├── integration/    # Integration tests
└── helpers/        # Test helpers and utilities
```

### Writing Tests

- Use Vitest for all tests (142 tests currently)
- Follow the existing test patterns
- Aim for high test coverage
- Mock external dependencies appropriately
- Use platform-agnostic assertions for cross-platform compatibility
- Mock @clack/prompts using the helpers in `tests/helpers/clack-mocks.ts`

## Local Development Testing

### Using Yalc

[Yalc](https://github.com/wclr/yalc) is recommended for testing the package locally before publishing.

#### Install Yalc

```bash
bun install -g yalc
```

#### Publish to Local Store

```bash
# Build and publish to yalc
bun run build
yalc publish
```

#### Use in Another Project

```bash
# In your test project
yalc add gh-self-runner-cli

# Or link for development
yalc link gh-self-runner-cli
```

#### Update After Changes

```bash
# After making changes
bun run build
yalc push
```

### Direct Testing

You can also test the CLI directly:

```bash
# After building
./dist/cli/index.js --help
./dist/cli/index.js init
./dist/cli/index.js start
./dist/cli/index.js stop
./dist/cli/index.js clean
```

### Global Installation (Development)

For development, you can link the package globally:

```bash
# In the project directory
bun link

# Now you can use it globally
gh-self-runner-cli --help
```

To unlink:

```bash
bun unlink gh-self-runner-cli
```

## Architecture

### Directory Structure

```
gh-self-runner-cli/
├── src/
│   ├── cli/             # CLI implementation
│   │   ├── index.ts     # CLI entry point
│   │   ├── commands/    # Command implementations
│   │   └── utils/       # CLI utilities
│   ├── lib/             # Core library
│   │   ├── config/      # Configuration management
│   │   ├── github/      # GitHub API client
│   │   └── runner/      # Runner management
│   ├── types/           # TypeScript type definitions
│   └── utils/           # Shared utilities
├── tests/               # Test files
├── docs/                # Documentation
└── dist/                # Compiled output (generated)
```

### Key Components

1. **CLI Layer** (`src/cli/`)
   - Handles command-line interface
   - Interactive prompts using @clack/prompts
   - Command routing with Commander.js
   - Authentication helpers

2. **Library Layer** (`src/lib/`)
   - Core business logic
   - GitHub API client (@octokit/rest)
   - Runner lifecycle management
   - Configuration loading (cosmiconfig)
   - GitHub API interactions
   - Runner lifecycle management
   - Configuration handling

3. **Utilities** (`src/utils/`)
   - Logging system
   - Platform detection
   - File system helpers
   - Error handling

## Contributing

### Code Style

- Follow the existing code style
- Use TypeScript for all code
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Write tests for new features

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Maintenance tasks

### Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Update documentation if needed
7. Submit a pull request

## Debugging

### Debug Mode

Set the `DEBUG` environment variable to see detailed logs:

```bash
DEBUG=* gh-self-runner-cli start
```

### Common Issues

1. **TypeScript Compilation Errors**
   - Run `bun run typecheck` to see detailed errors
   - Check for missing type definitions

2. **Test Failures**
   - Run specific test file: `bun test path/to/test.ts`
   - Use `--no-coverage` for faster test runs

3. **Biome Errors**
   - Run `bun run lint:fix` to auto-fix issues
   - Check `biome.json` for rule configurations

## Release Process

1. Ensure all tests pass
2. Update version in `package.json`
3. Update CHANGELOG.md
4. Commit changes
5. Create a git tag
6. Push to GitHub
7. Publish to npm

```bash
# Example release commands
bun run lint
bun run typecheck
bun test
npm version patch/minor/major
git push --follow-tags
npm publish
```

## Additional Resources

- [Project README](../README.md)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub REST API](https://docs.github.com/en/rest)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Vitest Documentation](https://vitest.dev/)
- [Biome Documentation](https://biomejs.dev/)