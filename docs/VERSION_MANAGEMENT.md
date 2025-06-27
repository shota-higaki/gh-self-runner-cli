# Version Management

This project uses centralized version management to ensure consistency across all environments.

## Configuration

All versions are defined in `.github/versions.env`:

```bash
# Node.js version
NODE_VERSION=22.13.1

# Bun version
BUN_VERSION=1.2.17
```

## Updating Versions

1. Edit `.github/versions.env` with the new versions
2. Run `bun run sync:versions` to update `.nvmrc`
3. Commit all changes

## How it Works

- **Local Development**: `.nvmrc` is generated from `versions.env`
- **CI/CD**: GitHub Actions loads versions from `versions.env` directly
- **Package.json**: Engine requirements should match the versions in `versions.env`

## Benefits

- Single source of truth for all versions
- Easy updates - change once, apply everywhere
- Consistent environments across local and CI/CD
- Clear version history in git

## Scripts

- `bun run sync:versions` - Synchronize versions from `.github/versions.env`