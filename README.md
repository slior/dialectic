# Dialectic - Multi-Agent Debate

## Overview

Dialectic is a CLI tool that orchestrates multi-agent debates to solve software design problems. Multiple AI agents with different perspectives (architecture, performance, security) debate a problem through structured rounds of proposals, critiques, and refinements, culminating in a synthesized solution from a judge agent.

## Setup

### Requirements

- **Node.js** >= 18
- **OpenAI API Key**: Set `OPENAI_API_KEY` in a `.env` file or as an environment variable

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

#### Troubleshooting

**Common errors:**

- **"Invalid arguments: provide exactly one of <problem> or --problemDescription"**
  - Use either a string problem OR `--problemDescription`, not both

- **"Invalid arguments: problem is required (provide <problem> or --problemDescription)"**
  - Provide either a problem string or `--problemDescription` option

- **"Invalid arguments: problem description file not found: <path>"**
  - Verify the file path exists and is accessible

- **"Invalid arguments: problem description file is empty: <path>"**
  - Add content to the file (whitespace-only files are considered empty)

- **"Invalid arguments: problem description path is a directory: <path>"**
  - Provide a file path, not a directory path

- **"Failed to read problem description file: <error>"**
  - Check file permissions and available disk space

- **"Environment file not found: <path>"**
  - Ensure the specified `.env` file exists, or omit `--env-file` to use default behavior

- **"Failed to load environment file: <error>"**
  - Verify `.env` file format: `KEY=value` pairs, one per line

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

### Configuration

Debate behavior is configured via a JSON file (default: `./debate-config.json`). If the file is missing, built-in defaults are used.

**Configuration file structure:**
- `agents`: Array of agent configurations defining the agent pool
- `judge`: Judge agent configuration for synthesis
- `debate`: Debate execution settings (rounds, termination, synthesis method)

For detailed configuration documentation, including all fields, validation rules, and examples, see [docs/configuration.md](docs/configuration.md).

**Default configuration values:**

- **Agents**: 
  - System Architect (role: `architect`, model: `gpt-4`, temperature: `0.5`)
  - Performance Engineer (role: `performance`, model: `gpt-4`, temperature: `0.5`)
- **Judge**: 
  - Technical Judge (role: `generalist`, model: `gpt-4`, temperature: `0.3`)
- **Debate settings**:
  - Rounds: `3`
  - Termination: `{ "type": "fixed" }`
  - Synthesis method: `"judge"`
  - Include full history: `true`
  - Timeout per round: `300000` ms (5 minutes)

**Example configuration:**
```json
{
  "agents": [
    {
      "id": "agent-architect",
      "name": "System Architect",
      "role": "architect",
      "model": "gpt-4",
      "provider": "openai",
      "temperature": 0.5
    },
    {
      "id": "agent-security",
      "name": "Security Expert",
      "role": "security",
      "model": "gpt-4",
      "provider": "openai",
      "temperature": 0.4
    }
  ]
}
```

## Technical Details

**LLM Provider:**
- Uses OpenAI SDK with preference for Responses API and fallback to Chat Completions API

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