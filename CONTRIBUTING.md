# Contributing to Dialectic

Thank you for your interest in contributing to Dialectic! This document provides guidelines for contributing code, especially regarding test structure and imports.

## Test Structure Guidelines

### Test File Location

Tests are **co-located** with source files in the `packages/` directory structure. Each test file should be placed next to the source file it tests, using the `.spec.ts` extension.

```
packages/
├── core/
│   └── src/
│       ├── providers/
│       │   ├── openai-provider.ts
│       │   └── openai-provider.spec.ts    ← Test co-located with source
│       └── agents/
│           ├── role-based-agent.ts
│           └── role-based-agent.spec.ts    ← Test co-located with source
└── cli/
    └── src/
        ├── commands/
        │   ├── debate.ts
        │   └── debate.spec.ts             ← Test co-located with source
        └── utils/
            ├── progress-ui.ts
            └── progress-ui.spec.ts         ← Test co-located with source
```

### Import Patterns

When writing tests, **always import from package sources**, never from the legacy root `src/` directory. The root `src/` directory is being phased out and will be removed in the future.

#### Core Functionality

For core functionality (agents, providers, tools, types, utilities), import from `dialectic-core`:

```typescript
// Import from dialectic-core
import { 
  DebateOrchestrator, 
  RoleBasedAgent, 
  LLMProvider,
  ToolRegistry,
  DebateConfig,
  CONTRIBUTION_TYPES 
} from 'dialectic-core';

```

#### CLI-Specific Functionality

For CLI-specific functionality within the CLI package, use relative imports:

```typescript
// Relative imports within CLI package
import { runCli } from '../index';
import { loadConfig } from './debate';  // Same directory
import { DebateProgressUI } from '../utils/progress-ui';

```

### What to Import from Where

| Source | Import From | Examples |
|--------|-------------|----------|
| Core agents | `dialectic-core` | `RoleBasedAgent`, `JudgeAgent`, `Agent` |
| Core orchestrator | `dialectic-core` | `DebateOrchestrator`, `StateManager` |
| Providers | `dialectic-core` | `LLMProvider`, `OpenAIProvider`, `createProvider` |
| Tools | `dialectic-core` | `ToolRegistry`, `ToolImplementation`, `ContextSearchTool` |
| Types | `dialectic-core` | `DebateConfig`, `AgentConfig`, `CONTRIBUTION_TYPES` |
| Core utilities | `dialectic-core` | `loadEnvironmentFile`, `Logger`, `enhanceProblemWithContext` |
| CLI commands | `../packages/cli/src/index` | `runCli` |
| CLI utilities | `../packages/cli/src/utils/...` | `DebateProgressUI` |

### Adding New Exports

If you need to use a class or function in tests that isn't currently exported from a package:

1. **For core package**: Add the export to `packages/core/src/index.ts`
2. **For CLI package**: Add the export to `packages/cli/src/index.ts`

Example:

```typescript
// In packages/core/src/index.ts
export { YourNewClass } from './path/to/your-new-class';
```

Then import it in tests:

```typescript
import { YourNewClass } from 'dialectic-core';
```

### Mocking

When mocking modules, use the package import path. For modules that are imported using relative paths within packages (like `provider-factory`), you may need to mock them using the `moduleNameMapper` path:

```typescript
// ✅ CORRECT - Mock using package import
jest.mock('dialectic-core', () => {
  const actual = jest.requireActual('dialectic-core');
  return {
    ...actual,
    loadEnvironmentFile: jest.fn(),
    createProvider: mockCreateProvider
  };
});

// ✅ CORRECT - Mock internal modules that use relative imports
// When a module imports another using relative paths (e.g., '../providers/provider-factory'),
// mock it using the moduleNameMapper path
const mockCreateProvider = jest.fn();
jest.mock('dialectic-core/providers/provider-factory', () => ({
  createProvider: (...args: any[]) => mockCreateProvider(...args)
}));

// ✅ CORRECT - Mock external dependencies
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    responses: { create: jest.fn() },
    chat: { completions: { create: jest.fn() } }
  }))
}));

// ❌ INCORRECT - Don't mock using root src path
jest.mock('../src/utils/env-loader', () => ({
  loadEnvironmentFile: jest.fn()
}));
```

**Important:** When mocking modules that are imported via relative paths (like `EvaluatorAgent` importing `createProvider` from `'../providers/provider-factory'`), use the `moduleNameMapper` path (`dialectic-core/providers/provider-factory`) rather than trying to mock with relative paths.

### Running Tests

Tests can be run from multiple locations:

1. **From project root** (recommended - runs all tests via NX):
   ```bash
   npm test
   ```

2. **From package directories** (for package-specific tests):
   ```bash
   cd packages/core && npm test
   cd packages/cli && npm test
   ```

3. **Run specific test file or pattern**:
   ```bash
   npm test -- --testNamePattern="Provider factory integration"
   npm test -- packages/cli
   ```

All tests should pass regardless of where they're run from. Each package has its own `jest.config.ts` that:
- Looks for tests in the `src/` directory (`roots: ['<rootDir>/src']`)
- Matches files with `.spec.ts` extension (`testMatch: ['**/*.spec.ts']`)
- Configures module name mapping for `dialectic-core` imports

### Verification

Before submitting a pull request, verify:

1. **All tests pass:**
   ```bash
   npm test
   ```
   This should show all test suites passing with no failures.

2. **No imports from root `src/` directory:**
   ```bash
   # Check for legacy imports in package tests
   grep -r "../src/" packages/*/src/**/*.spec.ts
   ```
   This should return no results. All imports should use `dialectic-core` or relative paths within packages.

3. **Tests are co-located with source files:**
   - Test files should be in `packages/*/src/` directories
   - Test files should have `.spec.ts` extension
   - Test files should be next to the source files they test

4. **Build succeeds:**
   ```bash
   npm run build
   ```
   All packages should build without errors.

5. **Cache is cleared (if needed):**
   ```bash
   npm run clean:cache  # Clears Nx cache
   ```

## Why This Structure?

For a detailed overview of the repository organization, package structure, and dependencies, see [Repository Organization](docs/repo_organization.md).

This monorepo structure provides:

- **Co-located tests** - Tests live next to source code, making them easier to find and maintain
- **Clear separation** - Core library (`packages/core/`) is separate from CLI application (`packages/cli/`)
- **Better encapsulation** - Packages explicitly export what they provide via `index.ts` files
- **Easier maintenance** - Removing legacy root `src/` becomes possible
- **Type safety** - TypeScript can better track dependencies between packages
- **Scalability** - Easy to add new packages or split functionality
- **Package isolation** - Each package has its own Jest config and can be tested independently

## Test File Naming

Test files must follow this naming convention:

- **Extension:** `.spec.ts` (not `.test.ts`)
- **Location:** Co-located with source files in `packages/*/src/`
- **Pattern:** `{source-file-name}.spec.ts`

Examples:
- `openai-provider.ts` → `openai-provider.spec.ts`
- `debate.ts` → `debate.spec.ts`
- `role-based-agent.ts` → `role-based-agent.spec.ts`

## Jest Configuration

Each package has its own `jest.config.ts`:

- **Core package** (`packages/core/jest.config.ts`):
  - Tests in `src/` directory
  - Module name mapping for `dialectic-core` and `dialectic-core/*`
  - Langfuse mock configured

- **CLI package** (`packages/cli/jest.config.ts`):
  - Tests in `src/` directory
  - Module name mapping for `dialectic-core` imports
  - Langfuse mock configured

## Cursor Commands

The repository includes Cursor IDE commands for common maintenance tasks:

### Publish Packages

The `publish-packages` command automates publishing `dialectic-core` and/or `dialectic` CLI packages to npm. It handles:

- **Version bumping** - Automatically bumps version numbers (major/minor/patch) for core and/or CLI packages
- **Dependency management** - Updates CLI package's dependency on core when core is published
- **Build and publish** - Builds packages and publishes them to npm in the correct order

**Usage:** Invoke the command through Cursor's command palette with parameters:
- `publish_core` (boolean) - Whether to publish the core package
- `core_version_bump` (optional) - Version bump type for core (`major`, `minor`, `patch`)
- `cli_version_bump` (required) - Version bump type for CLI (`major`, `minor`, `patch`)

**Note:** Requires npm authentication (`npm login`) and a git repository for version tags.

### Update Changelog

The `update-changelog` command automatically updates `CHANGELOG.md` by analyzing git commits between versions. It:

- **Analyzes commits** - Extracts meaningful changes from git commit history
- **Categorizes changes** - Groups commits into Added, Changed, Fixed, and Documentation sections
- **Filters noise** - Excludes chore, cleanup, and refactoring commits unless they include significant changes
- **Formats entries** - Creates user-friendly changelog entries with consistent formatting

**Usage:** Invoke the command through Cursor's command palette:
- With version: `Update changelog for version v0.3.0`
- Without version: `Update changelog` (uses latest git tag)

**Note:** Requires a git repository with version tags.

## Questions?

If you're unsure about where to import something from, check:

1. The package's `src/index.ts` file to see what's exported
2. Existing test files in the same directory for examples of similar imports
3. The package structure - core functionality is in `packages/core/`, CLI-specific code is in `packages/cli/`
4. Check `jest.config.ts` in the package to see how module names are mapped

Thank you for following these guidelines!

