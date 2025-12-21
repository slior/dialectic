# Publishing the Dialectic CLI

This guide explains how to publish only the CLI tool to npm.

## Prerequisites

Before publishing the CLI, you **must** publish `@dialectic/core` first, as the CLI depends on it:

```bash
# 1. Navigate to core package
cd packages/core

# 2. Build the core package
npm run build

# 3. Publish @dialectic/core
npm publish --access public
```

## Publishing the CLI

### Step 1: Build Dependencies

Ensure both packages are built:

```bash
# From project root
npm run build:core
npm run build:cli
```

### Step 2: Verify What Will Be Published

Before publishing, you can check what files will be included:

```bash
cd packages/cli
npm pack --dry-run
```

This will show you exactly what files will be included in the published package. You should see:
- `dist/` directory (compiled JavaScript)
- `README.md` (if it exists)
- `package.json`
- `LICENSE` (if it exists)

You should **NOT** see:
- `src/` directory
- `coverage/` directory
- `tests/` or `*.spec.ts` files
- `node_modules/`
- Any other development files

### Step 3: Publish

```bash
# Navigate to CLI package directory
cd packages/cli

# Publish to npm
npm publish --access public
```

**Important:** Always run `npm publish` from the `packages/cli` directory, **never** from the project root. The root `package.json` has `"private": true"` which prevents accidental publishing.

## What Gets Published

The `files` field in `packages/cli/package.json` controls what gets published:

```json
"files": [
  "dist",
  "README.md"
]
```

Additionally, `.npmignore` ensures no unwanted files slip through.

## Version Management

When updating versions:

1. Update `packages/core/package.json` version
2. Publish `@dialectic/core`
3. Update `packages/cli/package.json` version (must match or be compatible)
4. Update `packages/cli/package.json` dependency: `"@dialectic/core": "^X.Y.Z"`
5. Publish `dialectic` CLI

## Verifying the Published Package

After publishing, you can verify the package was published correctly:

```bash
# Install the published package in a test directory
mkdir test-install
cd test-install
npm install dialectic

# Check what was installed
ls node_modules/dialectic/

# Test the CLI
npx dialectic --version
```

You should see only the `dist/` directory and `README.md`, not source files or tests.

