# Dialectic - Multi-Agent Debate

## Overview

Dialectic is a CLI tool that orchestrates multi-agent debates to solve software design problems. Multiple AI agents with different perspectives (architecture, performance, security) debate a problem through structured rounds of proposals, critiques, and refinements, culminating in a synthesized solution from a judge agent.

## Setup

### Requirements

- **Node.js** >= 18
- **API Key**: Set `OPENAI_API_KEY` (for OpenAI) or `OPENROUTER_API_KEY` (for OpenRouter) in a `.env` file or as an environment variable

### Installation

**For end users (when published to npm):**
```bash
npm install -g dialectic
```

**For local development:**
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Link the dialectic command globally
npm link
```

## Usage

### CLI Usage

The `dialectic` command accepts a problem statement and optional configuration parameters.

**Basic usage:**
```bash
dialectic debate "Design a rate limiting system"
```

**With problem description file:**
```bash
dialectic debate --problemDescription problem.txt
```

**With specific agent roles:**
```bash
dialectic debate "Design a secure authentication system" --agents architect,security
dialectic debate "Build a high-performance API" --agents architect,performance,security
```

**With clarifications phase:**
```bash
dialectic debate "Design a rate limiting system" --clarify
dialectic debate --problemDescription complex-problem.md --clarify --agents architect,security,performance
```

**Available options:**

- `--problemDescription <path>`: Path to a text file containing the problem description (mutually exclusive with problem string)
- `--agents <list>`: Comma-separated agent roles to participate (default: `architect,performance`)
  - Available roles: `architect`, `performance`, `security`, `testing`, `generalist`
  - Filters agents from configuration file by role; uses defaults if no matches found
- `--rounds <n>`: Number of debate rounds (default: `3`, minimum: `1`)
- `--config <path>`: Path to configuration file (default: `./debate-config.json`)
- `--env-file <path>`: Path to environment file (default: `.env`)
- `--output <path>`: Output file path
  - If ending with `.json`: writes full debate state
  - Otherwise: writes final solution text only
- `--verbose`: Enable detailed logging with round-by-round breakdown
- `--report <path>`: Generate a detailed Markdown report of the debate
  - If the path does not end with `.md`, the extension is appended automatically
  - Creates parent directories as needed
  - Non-fatal on failure (debate still succeeds even if report generation fails)
- `--clarify`: Run a one-time pre-debate clarifications phase
  - Each agent can ask up to 5 clarifying questions (configurable)
  - Interactive Q&A session before the debate begins
  - Questions and answers are included in the debate context and final report

### Problem Description Files

Problem descriptions can be provided via text files instead of inline strings.

**Format and constraints:**
- **Encoding**: UTF-8
- **Format**: Any text format (plain text, markdown, etc.)
- **Content**: Must be non-empty (whitespace-only files are rejected)
- **Path resolution**: Relative paths resolved from current working directory
- **Mutual exclusivity**: Cannot provide both string problem and `--problemDescription` file

**Examples:**
```bash
dialectic debate --problemDescription complex-problem.md
dialectic debate --problemDescription ./problems/rate-limiting.txt
```

### Output

**Default behavior:**
- Final solution text written to `stdout`
- Complete debate state saved to `./debates/<debate-id>.json`
- Save path notification written to `stderr`

**With `--output` option:**
- If path ends with `.json`: full debate state written to file
- Otherwise: only final solution text written to file

### Markdown Report (`--report`)

Generate a comprehensive Markdown report capturing the full debate transcript and metadata.

```bash
# Write report to a specific file (extension auto-appended if missing)
dialectic debate "Design a rate limiting system" --report ./reports/rate-limit

# With verbose metadata in titles (latency, tokens)
dialectic debate --problemDescription problems/rate-limiting.md --verbose --report ./reports/rate-limit.md
```

Report contents:
- Problem Description
- Agents table and Judge table
- Clarifications (if `--clarify` was used):
  - Questions and answers grouped by agent
  - Includes "NA" responses for skipped questions
- Rounds with sections:
  - Proposals
  - Critiques
  - Refinements
- Final Synthesis

Notes:
- When `--verbose` is provided, contribution titles include metadata such as latency and tokens.
- If a section has no items, a succinct "No … in this round." line is shown.
- The report path is normalized to `.md` and parent directories are created automatically.

**Verbose mode (`--verbose`):**
- Detailed summary written to `stderr` including:
  - Round-by-round breakdown
  - Individual contributions with metadata (tokens, latency)
  - Total statistics (rounds, duration, token counts)

#### Exit Codes

| Code | Description |
|------|-------------|
| `0` | Success |
| `1` | General error |
| `2` | Invalid CLI arguments (e.g., missing problem, invalid rounds) |
| `3` | Provider error (reserved for future use) |
| `4` | Configuration error (e.g., missing `OPENAI_API_KEY`) |

### Interactive Clarifications

The `--clarify` option enables a pre-debate interactive clarification phase where agents can ask clarifying questions about the problem statement. This feature helps ensure all agents have a clear understanding before the debate begins.

**How it works:**
1. Each participating agent generates up to 5 clarifying questions (configurable via `clarificationsMaxPerAgent` in config)
2. The CLI presents questions grouped by agent in an interactive session
3. You can answer each question or press Enter to skip (recorded as "NA")
4. Questions and answers are included in the debate context and final report
5. The judge does not participate in the clarification phase

**Configuration options:**
- `debate.interactiveClarifications`: Enable clarifications by default (boolean, default: false)
- `debate.clarificationsMaxPerAgent`: Maximum questions per agent (number, default: 5)
- `AgentConfig.clarificationPromptPath`: Custom clarification prompt for specific agents

**Example workflow:**
```bash
dialectic debate "Design a distributed cache system" --clarify
# Agents ask questions like:
# [Architect] Q1: What are the expected read/write ratios?
# > 80% reads, 20% writes
# [Performance] Q2: What's the target latency requirement?
# > < 10ms for 95th percentile
# [Security] Q3: What data sensitivity level?
# > (press Enter to skip)
# Q3: NA
```

### Configuration

Debate behavior is configured via a JSON file (default: `./debate-config.json`). If the file is missing, built-in defaults are used.
For detailed configuration documentation, including all fields, validation rules, and examples, see [docs/configuration.md](docs/configuration.md).


## Technical Details

**LLM Providers:**
- **OpenAI**: Direct integration with OpenAI API using OpenAI SDK
- **OpenRouter**: Integration with OpenRouter API using OpenAI SDK for compatibility
- Both providers support Responses API with fallback to Chat Completions API

**Debate Round Flow:**
- Round 1: Proposals are generated via LLM, then critiques, then refinements.
- Rounds ≥ 2: Each agent's proposal is the previous round's refinement (no LLM call). If a prior refinement is missing, the system warns to stderr and falls back to generating a proposal via LLM for that agent only. Critiques and refinements proceed as usual against the current round's proposals.

**Debate Persistence:**
- Debate states are saved to `./debates/` directory
- Filename format: `deb-YYYYMMDD-HHMMSS-RAND.json`
- Files are saved incrementally during execution and upon completion

**Agent Roles:**
- `architect`: System design and architecture perspective
- `performance`: Performance optimization and efficiency perspective
- `security`: Security and threat modeling perspective
- `testing`: Testing strategy and quality assurance perspective (future use)
- `generalist`: General-purpose role (typically used for judge)

**Context Summarization:**
- Automatically manages debate history length to avoid context window limitations
- Each agent independently summarizes their perspective-based history when it exceeds configured thresholds
- Agent-specific summaries stored per round, keyed by agent ID for isolated access
- Dynamic retrieval: agents always see their own most recent summary
- Configurable at both system-wide and per-agent levels
- Summaries preserve critical insights while reducing context size for subsequent rounds
- Default threshold: 5000 characters, max summary length: 2500 characters
- See `docs/configuration.md` and `docs/context_summarization.md` for detailed documentation

## Evaluator Command

Evaluate a completed debate using evaluator agents:

```bash
dialectic eval --config ./eval-config.json --debate ./debates/deb-YYYYMMDD-HHMMSS-XYZ.json

# JSON output (includes averages and per-agent results)
dialectic eval --config ./eval-config.json --debate ./deb.json --output ./result.json
```

Options:
- `-c, --config <path>`: Evaluator configuration JSON (required)
- `-d, --debate <path>`: Debate state JSON to evaluate (required)
- `--env-file <path>`: Optional .env file
- `-v, --verbose`: Verbose logs to stderr
- `-o, --output <path>`: If ends with `.json`, writes JSON; otherwise writes Markdown (or stdout by default)

See detailed docs: [docs/evaluator.md](docs/evaluator.md)