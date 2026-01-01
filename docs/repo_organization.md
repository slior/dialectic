# Repository Organization

This document explains the structure and organization of the Dialectic monorepo. It covers the package layout, dependencies, and the purpose of each directory.

## Overview

Dialectic is organized as a **monorepo** using npm workspaces. This means all packages are managed in a single repository, allowing for shared code, coordinated versioning, and simplified development workflows.

The repository uses:
- **npm workspaces** for package management
- **TypeScript** for type safety across all packages
- **Nx** for build orchestration and task running
- **Jest** for testing

## Package Structure

The main code is organized into four packages under the `packages/` directory:

```
packages/
├── core/          # Core debate orchestration library
├── cli/           # Command-line interface
├── web-api/       # Web API server (NestJS)
└── web-ui/        # Web user interface (Next.js)
```

### Package Dependencies

The packages follow a clear dependency hierarchy:

```
┌─────────────┐
│   web-ui    │  (no internal dependencies)
└─────────────┘
       │
       │ (communicates via HTTP/WebSocket)
       ▼
┌─────────────┐      ┌─────────────┐
│  web-api    │      │     cli     │
└─────────────┘      └─────────────┘
       │                     │
       └──────────┬──────────┘
                  ▼
         ┌─────────────┐
         │    core    │  (foundation - no internal dependencies)
         └─────────────┘
```

**Note:** Both `web-api` and `cli` depend on `core`, but they are independent of each other. The `web-ui` communicates with `web-api` via HTTP and WebSocket, but does not have a direct code dependency on it.

## Packages

### `@dialectic/core`

**Location:** `packages/core/`

**Purpose:** The core library containing all debate orchestration logic. This is the foundation that all other packages depend on.

**Key Components:**
- **Debate Orchestrator** - Manages debate rounds, phases, and agent interactions
- **Agents** - Role-based agent implementations (architect, performance, security, testing, etc.)
- **Judge Agent** - Synthesizes final solutions from debate history
- **State Manager** - Handles debate state persistence
- **LLM Providers** - Abstracted interfaces for OpenAI and OpenRouter
- **Tools** - Tool calling infrastructure (e.g., context search)
- **Evaluator** - Agent for evaluating debate outcomes
- **Utilities** - Shared utilities for prompts, context formatting, summarization, etc.

**Dependencies:**
- `openai` - OpenAI SDK
- `dotenv` - Environment variable loading
- `langfuse` - Optional tracing support

**Exports:** All core types, classes, and utilities are exported through `packages/core/src/index.ts` for use by other packages.

**Build Output:** `packages/core/dist/` (JavaScript with TypeScript declarations)

### `dialectic` (CLI Package)

**Location:** `packages/cli/`

**Purpose:** Command-line interface for running debates and evaluations. This is the primary user-facing tool.

**Key Components:**
- **Commands** - CLI commands (`debate`, `eval`, `report`)
- **Configuration Loading** - Loads and validates debate configurations
- **Progress UI** - Terminal-based progress indicators
- **CLI Utilities** - User-facing messaging and error handling

**Dependencies:**
- `@dialectic/core` - Uses core library for all debate functionality
- `commander` - CLI framework
- `chalk` - Terminal colors

**Build Output:** `packages/cli/dist/` (includes executable `dialectic` binary)

**Usage:** After building, users can run `dialectic debate "problem statement"` from the command line.

### `@dialectic/web-api`

**Location:** `packages/web-api/`

**Purpose:** REST API and WebSocket server for running debates through a web interface.

**Key Components:**
- **NestJS Application** - REST endpoints and WebSocket gateway
- **Debate Controller** - HTTP endpoints for debate operations
- **WebSocket Gateway** - Real-time updates during debates
- **Debate Service** - Business logic wrapping core library

**Dependencies:**
- `@dialectic/core` - Uses core library for debate orchestration
- `@nestjs/*` - NestJS framework for building the API
- `socket.io` - WebSocket support

**Build Output:** `packages/web-api/dist/` (compiled NestJS application)

**Default Port:** 3001 (configurable via `PORT` environment variable)

### `@dialectic/web-ui`

**Location:** `packages/web-ui/`

**Purpose:** Browser-based user interface for running debates with real-time progress updates.

**Key Components:**
- **Next.js Application** - React-based web application
- **Components** - UI components for debate interface
- **WebSocket Client** - Real-time connection to web-api
- **Hooks** - React hooks for debate state management

**Dependencies:**
- `next` - Next.js framework
- `react` / `react-dom` - React library
- `socket.io-client` - WebSocket client
- `tailwindcss` - Styling

**Build Output:** `packages/web-ui/.next/` (Next.js production build)

**Default Port:** 3000 (Next.js default)

**Note:** The web-ui does not directly depend on `@dialectic/core`. It communicates with the web-api via HTTP and WebSocket, which in turn uses the core library.

## Other Directories

### `examples/`

**Purpose:** Example problems, configurations, and evaluation templates for users to learn from and use as starting points.

**Contents:**
- **Problem Examples** - Example problem statements (`problem.md` files)
- **Configuration Examples** - Sample `debate-config.json` files showing different configurations
- **Evaluation Examples** - Sample `eval_config.json` files and evaluation prompt templates
- **Kata Directories** - Complete examples (`kata1/`, `kata2/`, `kata3/`) with problem, config, and eval files

**Structure:**
```
examples/
├── debate_config1.json          # Example debate configuration
├── debate-config-openrouter.json # Example using OpenRouter
├── eval_system.md               # System evaluation prompt template
├── eval_user.md                 # User evaluation prompt template
├── eval_summary_format.md       # Evaluation summary format example
├── example3/                    # Complete example #3
│   ├── debate-config.json
│   ├── eval_config.json
│   └── problem.md
├── kata1/                       # Design kata #1
│   ├── debate-config.json
│   ├── eval_config.json
│   └── problem.md
└── ...
```

**Usage:** Users can copy these examples as starting points for their own debates and evaluations.

### `e2e-tests/`

**Purpose:** End-to-end tests that verify the system works correctly across different scenarios and configurations.

**Contents:**
- **Test Suites** - Each subdirectory contains a test scenario:
  - `clarify_test/` - Tests clarification phase functionality
  - `rounds_test/` - Tests different numbers of debate rounds
  - `summary_test/` - Tests context summarization features
  - `role_subsets/` - Tests different agent role combinations
  - `different_models/` - Tests different LLM models
- **Test Scripts** - Each test directory contains:
  - `run_test.sh` - Executes debates for the test
  - `eval_run.sh` - Runs evaluations on generated debates
  - Test-specific configuration files (if needed)
- **Test Runner** - `run-tests.ts` orchestrates running all tests
- **Documentation** - See [e2e-tests.md](../e2e-tests/e2e-tests.md) for detailed documentation on the testing system

**Structure:**
```
e2e-tests/
├── run-tests.ts              # Main test runner script
├── e2e-tests.md              # Testing documentation
├── clarify_test/
│   ├── run_test.sh
│   └── eval_run.sh
├── rounds_test/
│   ├── run_test.sh
│   └── eval_run.sh
└── ...
```

**Usage:** See [e2e-tests.md](../e2e-tests/e2e-tests.md)

### `scripts/`

**Purpose:** Utility scripts for common development and maintenance tasks.

**Contents:**
- `publish-cli.sh` - Script for publishing the CLI package to npm
  - Handles version bumping (patch/minor/major)
  - Builds the package
  - Publishes to npm registry

**Usage:**
```bash
./scripts/publish-cli.sh patch   # Bump patch version and publish
./scripts/publish-cli.sh minor    # Bump minor version and publish
./scripts/publish-cli.sh major    # Bump major version and publish
```

### `docs/`

**Purpose:** Project documentation covering usage, configuration, architecture, and development.

**Key Documents:**
- `commands.md` - CLI command reference
- `configuration.md` - Configuration file format and options
- `debate_flow.md` - How debates work internally
- `eval_flow.md` - How evaluations work
- `operation.md` - Operational guides and best practices
- `tools.md` - Tool calling system documentation
- `web_debate_flow.md` - Web interface flow
- `repo_organization.md` - This document


## Build System

### TypeScript Configuration

- **Root:** `tsconfig.json` - Base configuration for the entire monorepo
- **Base:** `tsconfig.base.json` - Shared compiler options
- **Package-level:** Each package has its own `tsconfig.json` extending the base

### Build Process

1. **Core Package** - Must be built first (other packages depend on it)
2. **CLI Package** - Depends on core
3. **Web API** - Depends on core
4. **Web UI** - Independent (communicates with web-api via HTTP/WebSocket)

**Build Commands:**
```bash
npm run build          # Build all packages
npm run build:core     # Build only core package
npm run build:cli      # Build only CLI package
npm run build:api      # Build only web-api
npm run build:ui       # Build only web-ui
```

### Nx Integration

The repository uses **Nx** for:
- **Task Orchestration** - Running builds/tests across packages
- **Dependency Graph** - Understanding package dependencies
- **Caching** - Caching build and test results for faster iterations

**Nx Configuration:** `nx.json` defines default behaviors for build, test, and lint tasks.

## Development Workflow

### Local Development

1. **Install dependencies:** `npm install` (installs all workspace dependencies)
2. **Build core:** `npm run build:core` (required for other packages)
3. **Develop CLI:** `npm run dev:cli` (uses ts-node for development)
4. **Develop Web:** `npm run dev:web` (runs both API and UI)

### Testing

- **Unit Tests:** `npm test` (runs tests in all packages)
- **Coverage:** `npm run test:coverage` (generates coverage reports)
- **E2E Tests:** Run `e2e-tests/run-tests.ts` directly

### Package Linking

npm workspaces automatically link packages together. When you import `@dialectic/core` in the CLI package, it uses the local version from `packages/core/`, not a published npm package. This allows for seamless development across packages.

## Key Files at Root

- `package.json` - Root package.json defining workspaces and scripts
- `tsconfig.json` - Root TypeScript configuration
- `tsconfig.base.json` - Shared TypeScript compiler options
- `nx.json` - Nx configuration for task orchestration
- `jest.config.ts` - Jest configuration for testing
- `.env` - Environment variables (gitignored, contains API keys)
- `AGENTS.md` - Project overview and development guidelines
- `README.md` - Project introduction and quick start

## Summary

The Dialectic monorepo is organized to:
- **Separate concerns** - Each package has a clear, focused purpose
- **Enable reuse** - Core library is shared across CLI and web interfaces
- **Simplify development** - Workspaces allow coordinated development
- **Support testing** - E2E tests verify system behavior
- **Provide examples** - Example directory helps users get started

The dependency flow is: `core` → `cli` and `web-api` (independent), with `web-ui` communicating with `web-api` via HTTP/WebSocket. This ensures a clean separation of concerns and maintainable architecture.

