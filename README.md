# Dialectic - Multi-Agent Debate

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/slior/dialectic)

## Table of Contents

- [Overview](#overview)
- [Quickstart](#quickstart)
  - [Setup](#setup)
  - [Basic Command](#basic-command)
- [Commands](#commands)
  - [Debate Command](#debate-command)
  - [Evaluator Command](#evaluator-command)
  - [Report Command](#report-command)
- [Configuration](#configuration)

## Overview

Dialectic is a CLI tool that orchestrates multi-agent debates to solve software design problems. Multiple AI agents with different perspectives (architecture, performance, security) debate a problem through structured rounds of proposals, critiques, and refinements, culminating in a synthesized solution from a judge agent.

## Quickstart

### Setup

**Requirements:**
- **Node.js** >= 18
- **API Key**: Set `OPENAI_API_KEY` (for OpenAI) or `OPENROUTER_API_KEY` (for OpenRouter) in a `.env` file or as an environment variable

**Installation:**

For end users (when published to npm):
```bash
npm install -g dialectic
```

For local development:
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Link the dialectic command globally
npm link
```

**API Key Setup:**

Create a `.env` file in your project directory:
```bash
OPENAI_API_KEY=sk-your-key-here
# OR
OPENROUTER_API_KEY=sk-or-your-key-here
```

### Basic Command

Run a debate with a problem statement:
```bash
dialectic debate "Design a rate limiting system"
```

Or use a problem description file:
```bash
dialectic debate --problemDescription problem.txt
```

## Commands

Dialectic provides three main commands:

- **`debate`** - Orchestrate a multi-agent debate to solve a design problem
- **`eval`** - Evaluate a completed debate using evaluator agents
- **`report`** - Generate a markdown report from a saved debate state

For detailed command documentation, including all options and examples, see [docs/commands.md](docs/commands.md).

### Debate Command

The `debate` command orchestrates a multi-agent debate to solve a software design problem. You provide a problem statement (either inline or from a file), and multiple AI agents with different perspectives debate the problem through structured rounds. Each round consists of proposals, critiques, and refinements, culminating in a synthesized solution from a judge agent. The command supports various options for customizing agent roles, number of rounds, output format, and includes features like interactive clarifications and detailed reporting.

### Evaluator Command

The `eval` command evaluates a completed debate using evaluator agents. This allows you to assess the quality and effectiveness of a debate's outcome by running specialized evaluator agents that analyze the debate process and final solution. The evaluators provide structured feedback and scores across multiple dimensions, helping you understand the strengths and weaknesses of the debate outcome.

### Report Command

The `report` command generates a comprehensive markdown report from a saved debate state JSON file. This is useful when you want to create a detailed report from a previously completed debate without re-running it. The report includes the full debate transcript, agent contributions, clarifications (if any), and the final synthesis, formatted as a readable markdown document.

## Configuration

Debate behavior is configured via a JSON file (default: `./debate-config.json`). If the file is missing, built-in defaults are used.

**Features:**
- Agent and judge configuration (models, temperatures, custom prompts)
- Debate settings (rounds, timeouts, synthesis methods)
- Context summarization to manage debate history length
- Tool configuration for agents to interact with external functionality during debates
- Observability tracing via Langfuse (optional) - enables monitoring and analysis of agent behavior, LLM calls, and tool executions

For detailed configuration documentation, including all fields, validation rules, tracing setup, and examples, see [docs/configuration.md](docs/configuration.md). For information about available tools and how to configure them, see [docs/tools.md](docs/tools.md).