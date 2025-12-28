#!/bin/bash
set -e

VERSION_TYPE=${1:-patch}

# Validate version type
if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo "Error: Invalid version type. Must be 'patch', 'minor', or 'major'" >&2
    exit 1
fi

# Get project root (parent of scripts directory)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Updating CLI version ($VERSION_TYPE)..."

cd "$PROJECT_ROOT/packages/cli"

# Update version
npm version "$VERSION_TYPE"
NEW_VERSION=$(node -p "require('./package.json').version")

echo "Building CLI package..."
npm run build

echo "Publishing dialectic@$NEW_VERSION..."
npm publish --access public

echo "✅ Published dialectic@$NEW_VERSION"

