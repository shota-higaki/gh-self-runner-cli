#!/bin/bash
# Script to synchronize versions from .github/versions.env

set -euo pipefail

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source the versions file
source "$SCRIPT_DIR/../versions.env"

# Update .nvmrc
echo "$NODE_VERSION" > "$ROOT_DIR/.nvmrc"

echo "✅ Updated .nvmrc to Node.js version: $NODE_VERSION"
echo "✅ Bun version configured: $BUN_VERSION"