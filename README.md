# Dialectic - Multi-Agent Debate

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/slior/dialectic)

## Table of Contents

- [Overview](#overview)
- [Quickstart](#quickstart)
  - [Setup](#setup)
  - [Running a Debate](#running-a-debate)
- [Interfaces](#interfaces)
  - [Command-Line Interface (CLI)](#command-line-interface-cli)
  - [Web User Interface](#web-user-interface)
- [Commands](#commands)
  - [Debate Command](#debate-command)
  - [Evaluator Command](#evaluator-command)
  - [Report Command](#report-command)
- [Configuration](#configuration)

## Overview

Dialectic is a multi-agent debate system that helps solve software design problems. Multiple AI agents with different perspectives (architecture, performance, security, simplicity) debate a problem through structured rounds of proposals, critiques, and refinements, culminating in a synthesized solution from a judge agent.

Dialectic can be used via:
- **CLI**: Traditional command-line interface for scripting and automation
- **Web UI**: Interactive dashboard with real-time debate visualization

## Quickstart

### Setup

**Requirements:**
- **Node.js** >= 18
- **API Key**: Set `OPENAI_API_KEY` (for OpenAI) or `OPENROUTER_API_KEY` (for OpenRouter) in a `.env` file

**Installation:**

```bash
# Clone the repository
git clone https://github.com/slior/dialectic.git
cd dialectic

# Install dependencies
npm install

# Build all packages
npm run build
```

**API Key Setup:**

Create a `.env` file in the project root:
```bash
OPENAI_API_KEY=sk-your-key-here
# OR
OPENROUTER_API_KEY=sk-or-your-key-here

# Optional: Configure Web UI API URL (defaults to http://localhost:3001)
# NEXT_PUBLIC_API_URL=http://localhost:3001
```

See `.env.example` for a complete example of all available environment variables.

### Running a Debate

**Option 1: CLI (Command Line)**

```bash
# Development mode
npm run dev:cli -- debate "Design a rate limiting system"

# With options
npm run dev:cli -- debate "Design a caching strategy" --rounds 3 --verbose
```

**Option 2: Web UI (Dashboard)**

```bash
# Start both API and UI servers
npm run dev:web

# Open http://localhost:3000 in your browser
```

**Option 3: Docker (Containerized)**

Prerequisites: Docker and Docker Compose installed.

Build the Docker image:
```bash
docker build -t dialectic-web .
```

Run with Docker:
```bash
# Basic run with required API key
docker run -d \
  -p 3000:3000 \
  -p 3001:3001 \
  -e OPENAI_API_KEY=sk-your-key-here \
  --name dialectic-web \
  dialectic-web
```

Or use Docker Compose:
```bash
# Create .env file with your API keys, e.g for OPENAI
echo "OPENAI_API_KEY=sk-your-key-here" > .env

# Start services
docker-compose up -d
```

**Environment Variable Examples:**

Single origin (localhost):
```bash
docker run -d \
  -p 3000:3000 -p 3001:3001 \
  -e OPENAI_API_KEY=sk-your-key \
  -e CORS_ORIGINS=http://localhost:3000 \
  dialectic-web
```

Multiple origins (production):
```bash
docker run -d \
  -p 3000:3000 -p 3001:3001 \
  -e OPENAI_API_KEY=sk-your-key \
  -e NEXT_PUBLIC_API_URL=https://api.yourdomain.com \
  -e CORS_ORIGINS=https://app.yourdomain.com,https://www.yourdomain.com \
  dialectic-web
```

With Langfuse tracing:
```bash
docker run -d \
  -p 3000:3000 -p 3001:3001 \
  -e OPENAI_API_KEY=sk-your-key \
  -e LANGFUSE_SECRET_KEY=sk-lf-your-key \
  -e LANGFUSE_PUBLIC_KEY=pk-lf-your-key \
  dialectic-web
```

With volume mounts for debates and config:
```bash
docker run -d \
  -p 3000:3000 -p 3001:3001 \
  -e OPENAI_API_KEY=sk-your-key \
  -v ./debates:/app/debates \
  -v ./debate-config.json:/app/debate-config.json:ro \
  dialectic-web
```

**Ports:**
- `3000` - Web UI (Next.js)
- `3001` - Web API (NestJS)

For CORS configuration details, see [docs/configuration.md](docs/configuration.md#cors_origins).

For detailed instructions on running the different packages, see [docs/operation.md](docs/operation.md).

## Interfaces

### Command-Line Interface (CLI)

The CLI provides full control over debates through command-line options:

```bash
# Simple debate
npm run dev:cli -- debate "Design a secure authentication system"

# Debate with specific agents and output
npm run dev:cli -- debate "Design a microservices architecture" \
  --agents architect,performance,security \
  --rounds 5 \
  --output solution.txt \
  --report report.md \
  --verbose

# From a problem file
npm run dev:cli -- debate --problemDescription problem.txt

# With interactive clarifications
npm run dev:cli -- debate "Design a distributed cache" --clarify
```

### Web User Interface

The Web UI provides an interactive dashboard for running debates:

- **Real-time Updates**: Watch agents propose, critique, and refine in real-time
- **Agent Cards**: See each agent's activity and outputs
- **Status Tracking**: Monitor current round, phase, and progress
- **Notifications**: View warnings, errors, and status messages
- **Solution Panel**: Access the final synthesized solution
- **User Feedback**: Provide feedback on completed debates using thumb-up (positive) or thumb-down (negative) buttons
- **Download Debate**: Download the complete debate JSON file, including all contributions, rounds, and user feedback (if provided)

Start the Web UI:
```bash
# Start both servers with one command
npm run dev:web

# Or start separately:
npm run dev:api  # API server (port 3001)
npm run dev:ui   # UI server (port 3000)
```

Then open http://localhost:3000 in your browser.

**Configuration:**

The Web UI connects to the API server via WebSocket. By default, it connects to `http://localhost:3001`. To configure a different API URL, set the `NEXT_PUBLIC_API_URL` environment variable:

```bash
# In .env file or environment
NEXT_PUBLIC_API_URL=http://localhost:3001
```

For production deployments, set this to your API server's URL (e.g., `https://api.yourdomain.com`).

For comprehensive details on running the web components, including production builds and configuration options, see [AGENTS.md](AGENTS.md#web-components).

### Web API Endpoints

The Web API provides REST endpoints for interacting with debates:

**POST `/api/debates/:id/feedback`**
- Description: Submit user feedback for a completed debate
- Request body: `{ feedback: number }` where `feedback` is `1` (positive) or `-1` (negative)
- Response: `{ success: true, message: "Feedback submitted successfully" }`
- Status codes: `200` (success), `400` (invalid feedback), `404` (debate not found)

**GET `/api/debates/:id/download`**
- Description: Download the complete debate JSON file
- Response: JSON file with `Content-Disposition: attachment`
- Status codes: `200` (success), `404` (debate not found)
- File includes: All debate state including rounds, contributions, solution, and user feedback (if provided)
- Filename: `{debateId}.json`

**User Feedback Persistence:**
- User feedback is saved to the debate JSON file and included in downloaded files
- Feedback values: `1` for positive (thumb-up), `-1` for negative (thumb-down)
- The `userFeedback` property is stored in the debate state JSON file

## Commands

Dialectic CLI provides three main commands:

- **`debate`** - Orchestrate a multi-agent debate to solve a design problem
- **`eval`** - Evaluate a completed debate using evaluator agents
- **`report`** - Generate a markdown report from a saved debate state

For detailed command documentation, including all options and examples, see [docs/commands.md](docs/commands.md).

### Debate Command

The `debate` command orchestrates a multi-agent debate to solve a software design problem. You provide a problem statement (either inline or from a file), and multiple AI agents with different perspectives debate the problem through structured rounds. Each round consists of proposals, critiques, and refinements, culminating in a synthesized solution from a judge agent.

```bash
npm run dev:cli -- debate "Design a rate limiting system" --rounds 3 --verbose
```

### Evaluator Command

The `eval` command evaluates a completed debate using evaluator agents. This allows you to assess the quality and effectiveness of a debate's outcome by running specialized evaluator agents that analyze the debate process and final solution.

```bash
npm run dev:cli -- eval --config eval-config.json --debate ./debates/my-debate.json
```

### Report Command

The `report` command generates a comprehensive markdown report from a saved debate state JSON file. This is useful for creating detailed reports from previously completed debates.

```bash
npm run dev:cli -- report --debate ./debates/my-debate.json --output report.md
```

## Configuration

Debate behavior is configured via a JSON file (default: `./debate-config.json`). If the file is missing, built-in defaults are used.

**Features:**
- Agent and judge configuration (models, temperatures, custom prompts)
- Debate settings (rounds, timeouts, synthesis methods)
- Context summarization to manage debate history length
- Tool configuration for agents to interact with external functionality
- Observability tracing via Langfuse (optional)

For detailed configuration documentation, see [docs/configuration.md](docs/configuration.md).

For information about available tools, see [docs/tools.md](docs/tools.md).

For running and deployment instructions, see [docs/operation.md](docs/operation.md).
