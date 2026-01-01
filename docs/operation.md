# Running Dialectic

This document explains how to run the different components of Dialectic: the CLI tool and the Web UI.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the CLI](#running-the-cli)
  - [Development Mode](#cli-development-mode)
  - [Production Mode](#cli-production-mode)
- [Running the Web UI](#running-the-web-ui)
  - [Development Mode](#web-ui-development-mode)
  - [Production Mode](#web-ui-production-mode)
- [Package Scripts Reference](#package-scripts-reference)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- **Node.js** >= 18
- **npm** >= 8 (comes with Node.js)
- **API Key**: `OPENAI_API_KEY` or `OPENROUTER_API_KEY`

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/slior/dialectic.git
cd dialectic

# Install all dependencies for all packages
npm install

# Build all packages
npm run build
```

The monorepo contains four packages:

| Package | Description | Location |
|---------|-------------|----------|
| `dialectic-core` | Shared debate logic and types | `packages/core/` |
| `dialectic` | Command-line interface | `packages/cli/` |
| `@dialectic/web-api` | NestJS backend with WebSocket | `packages/web-api/` |
| `@dialectic/web-ui` | Next.js frontend dashboard | `packages/web-ui/` |

## Running the CLI

The CLI provides the traditional command-line interface for running debates.

### CLI Development Mode

Run the CLI directly with TypeScript (no build required):

```bash
# Using npm workspace
npm run dev:cli -- debate "Design a rate limiting system"

# Or navigate to the CLI package
cd packages/cli
npm run dev -- debate "Design a rate limiting system"
```

**Examples:**

```bash
# Simple debate
npm run dev:cli -- debate "Design a caching strategy for a web application"

# Debate with specific agents
npm run dev:cli -- debate "Design a secure API gateway" --agents architect,security

# Debate with verbose output and report
npm run dev:cli -- debate "Design a microservices architecture" \
  --rounds 3 \
  --verbose \
  --report ./reports/microservices.md

# Debate from a problem file
npm run dev:cli -- debate --problemDescription ./problems/my-problem.txt

# View help
npm run dev:cli -- --help
npm run dev:cli -- debate --help
```

### CLI Production Mode

Build and run the compiled CLI:

```bash
# Build the CLI (and its dependencies)
npm run build:cli

# Run the built CLI
node packages/cli/dist/index.js debate "Design a rate limiting system"

# Or link globally for the 'dialectic' command
cd packages/cli
npm link

# Then use from anywhere
dialectic debate "Design a rate limiting system"
```

## Running the Web UI

The Web UI provides a graphical dashboard for running and monitoring debates in real-time.

### Web UI Development Mode

The Web UI consists of two components that need to run simultaneously:
- **Web API** (NestJS backend) - Port 3001
- **Web UI** (Next.js frontend) - Port 3000

**Option 1: Run both with a single command:**

```bash
npm run dev:web
```

This starts both the API server and the UI using `concurrently`.

**Option 2: Run separately (in two terminals):**

Terminal 1 - Start the API server:
```bash
npm run dev:api
# Server starts at http://localhost:3001
```

Terminal 2 - Start the UI:
```bash
npm run dev:ui
# UI available at http://localhost:3000
```

**Option 3: Navigate to individual packages:**

```bash
# Terminal 1 - API
cd packages/web-api
npm run start:dev

# Terminal 2 - UI
cd packages/web-ui
npm run dev
```

Once both are running, open http://localhost:3000 in your browser.

### Web UI Features

The dashboard provides:

- **Problem Input**: Text area to enter your design problem
- **Agent Cards**: Real-time view of each agent's activity and outputs
- **Status Bar**: Current round, phase, and debate status
- **Notifications**: Warnings, errors, and progress messages
- **Solution Panel**: Final synthesized solution after debate completion
- **Clarifications**: Optional interactive Q&A with agents before debate

### Web UI Production Mode

Build and run the production version:

```bash
# Build all packages
npm run build

# Start the API server (production)
cd packages/web-api
npm run start:prod
# Or: node dist/main.js

# Start the UI (production)
cd packages/web-ui
npm run start
# Or: npm run build && npx next start
```

For production deployments, you may want to:
1. Set `NODE_ENV=production`
2. Configure a reverse proxy (nginx, etc.)
3. Use process managers (PM2, systemd, etc.)

## Package Scripts Reference

### Root-level Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build all packages |
| `npm run build:core` | Build core package only |
| `npm run build:cli` | Build CLI package (and core) |
| `npm run build:api` | Build web-api package |
| `npm run build:ui` | Build web-ui package |
| `npm run dev:cli` | Run CLI in development mode |
| `npm run dev:api` | Run web-api in development mode |
| `npm run dev:ui` | Run web-ui in development mode |
| `npm run dev:web` | Run both web-api and web-ui |
| `npm run test` | Run tests for all packages |
| `npm run test:core` | Run core package tests |
| `npm run test:cli` | Run CLI package tests |

### Package-specific Scripts

**Core (`packages/core/`):**
```bash
npm run build      # Compile TypeScript
npm run test       # Run tests
npm run test:watch # Run tests in watch mode
```

**CLI (`packages/cli/`):**
```bash
npm run build      # Compile TypeScript
npm run dev        # Run with ts-node (development)
npm run test       # Run tests
```

**Web API (`packages/web-api/`):**
```bash
npm run build       # Compile with NestJS CLI
npm run start:dev   # Development with hot-reload
npm run start:debug # Development with debugging
npm run start:prod  # Production mode
npm run test        # Run tests
```

**Web UI (`packages/web-ui/`):**
```bash
npm run build  # Build for production
npm run dev    # Development with hot-reload
npm run start  # Start production server
npm run lint   # Run ESLint
```

## Environment Variables

Create a `.env` file in the project root:

```bash
# Required: At least one API key
OPENAI_API_KEY=sk-your-openai-key-here
# OR
OPENROUTER_API_KEY=sk-or-your-openrouter-key-here

# Optional: Langfuse tracing
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com

# Optional: Web API configuration
PORT=3001

# Optional: Web UI configuration
NEXT_PUBLIC_WEB_API_URL=http://localhost:3001
```

The `.env` file is automatically loaded by both the CLI and Web API.

## Troubleshooting

### Common Issues

**"OPENAI_API_KEY is not set"**
- Ensure your `.env` file exists in the project root
- Check the key is correctly formatted: `OPENAI_API_KEY=sk-...`

**CLI command not found after `npm link`**
```bash
# Rebuild and re-link
npm run build:cli
cd packages/cli
npm unlink -g dialectic
npm link
```

**Web UI shows "Disconnected from server"**
- Ensure the API server is running on port 3001
- Check the browser console for WebSocket errors
- Verify `NEXT_PUBLIC_WEB_API_URL` if using a custom API URL

**Build errors about missing types**
```bash
# Clean and rebuild
rm -rf packages/*/dist
rm -rf node_modules
npm install
npm run build
```

**Port already in use**
```bash
# Find and kill the process (Linux/Mac)
lsof -i :3001
kill -9 <PID>

# Windows PowerShell
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

### Getting Help

- Check the [commands documentation](./commands.md) for CLI options
- Check the [configuration documentation](./configuration.md) for config file options
- Open an issue on [GitHub](https://github.com/slior/dialectic/issues)

