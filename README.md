# Multi-Agent Debate

Overview
- This project implements a simple fixed-round debate of a multi-agent debate system as a CLI tool named "debate".
- It supports three agent types (architect, performance, security) with two agents by default (architect, performance), runs fixed rounds, and synthesizes a final solution via a judge agent.
- End-to-end path: CLI → configuration → OpenAI provider → agents/orchestrator → state persisted to ./debates → output to stdout or file.

Requirements
- Node.js >= 18
- An OpenAI API key exported as an environment variable:
  - Windows (PowerShell): `$Env:OPENAI_API_KEY = "<your_key>"`
  - macOS/Linux (bash/zsh): `export OPENAI_API_KEY="<your_key>"`

Installation
- Install dependencies: `npm install`
- Build (optional for dev via ts-node): `npm run build`

CLI Usage
- Basic (string problem):
  - `debate "Design a rate limiting system"`
- Basic (file-based problem):
  - `debate --problemDescription problem.txt`
- With specific agents:
  - `debate "Design a secure authentication system" --agents architect,security`
  - `debate "Build a high-performance API" --agents architect,performance,security`
- Options:
  - `--problemDescription <path>`: Path to a text file containing the problem description. Provide exactly one of this or the problem string argument.
  - `--agents <list>`: comma-separated roles (architect,performance,security,testing); defaults to architect,performance when not specified.
  - `--rounds <n>`: number of rounds (default 3; must be >= 1). Flow mapping:
    - 1 → proposals only, then synthesis
    - 2 → proposals + critiques, then synthesis
    - >=3 → proposals + critiques + refinement, then synthesis
  - `--config <path>`: configuration file path (default `./debate-config.json`)
  - `--output <path>`: output file path
    - If the path ends with `.json`, the full debate state is written
    - Otherwise, only the final solution text is written
  - `--verbose`: enable more detailed logging (agents, round-by-round details, metadata when available)

Problem Description Files
- Alternative to inline problem strings, you can provide the problem description in a text file
- File format: Any text format (UTF-8 encoding) - plain text, markdown, etc.
- File size: No limits imposed (user controls content length)
- Content: Must be non-empty (whitespace-only files are rejected)
- Path resolution: Relative paths resolved from current working directory
- Examples:
  - `debate --problemDescription complex-problem.md`
  - `debate --problemDescription ./problems/rate-limiting.txt`
- Mutual exclusivity: Cannot provide both string problem and file path - exactly one must be specified

Output Behavior
- By default, the CLI writes only the minimal final solution text to stdout.
- A complete debate state JSON file is always persisted to `./debates/<debate-id>.json`.
- The saved path is written to stderr (so it does not interfere with stdout piping).
- When `--output` is provided:
  - If it ends with `.json`, the full debate state is written
  - Otherwise, only the final solution text is written

Configuration
- For comprehensive configuration documentation, see [docs/configuration.md](docs/configuration.md)
- Default config file: `./debate-config.json`. If missing:
  - The CLI uses built-in defaults (two agents: architect, performance; judge defaults; debate defaults)
  - A notice is written to stderr indicating defaults are used
- Example with SecurityAgent:
  ```json
  {
    "agents": [
      {"id": "agent-architect", "name": "System Architect", "role": "architect", "model": "gpt-4", "provider": "openai", "temperature": 0.5},
      {"id": "agent-security", "name": "Security Expert", "role": "security", "model": "gpt-4", "provider": "openai", "temperature": 0.4}
    ]
  }
  ```
- Config structure (root object):
  - `agents: AgentConfig[]` (required; if empty/missing, defaults are used with a notice)
  - `judge?: AgentConfig` (optional; if missing, default judge is used with a notice)
  - `debate?: DebateConfig` (optional; used for rounds and basic Flow 1 settings)
- AgentConfig shape:
  - `id: string`
  - `name: string`
  - `role: "architect" | "security" | "performance" | "testing" | "generalist"`
  - `model: string` (e.g., `gpt-4`)
  - `provider: "openai"` (Flow 1 only)
  - `temperature: number` (0.0 - 1.0)
  - `systemPrompt?: string`
  - `enabled?: boolean` (defaults to true)
- DebateConfig shape:
  - `rounds: number`
  - `terminationCondition: { type: "fixed" }`
  - `synthesisMethod: "judge"`
  - `includeFullHistory: boolean`
  - `timeoutPerRound: number` (ms)

Exit Codes
- 0: success
- 1: general error
- 2: invalid CLI arguments (e.g., missing problem, invalid rounds)
- 3: provider error (reserved for future mapping)
- 4: configuration error (e.g., missing OPENAI_API_KEY)

Error Handling
- The CLI prints error messages to stderr and exits with one of the exit codes above.
- For Flow 1, errors are not handled internally; exceptions are thrown.

Troubleshooting Problem Description Files
- "Invalid arguments: provide exactly one of <problem> or --problemDescription"
  - Fix: Use either a string problem OR --problemDescription, not both
- "Invalid arguments: problem is required (provide <problem> or --problemDescription)"
  - Fix: Provide either a problem string argument or --problemDescription option
- "Invalid arguments: problem description file not found: <path>"
  - Fix: Check file path exists and is accessible
- "Invalid arguments: problem description file is empty: <path>"
  - Fix: Add content to the file (whitespace-only files are considered empty)
- "Invalid arguments: problem description path is a directory: <path>"
  - Fix: Provide path to a file, not a directory
- "Failed to read problem description file: <error>"
  - Fix: Check file permissions and disk space

Testing (TDD)
- Tests use Jest with ts-jest.
- Run tests: `npm test`
- Watch mode: `npm run test:watch`
- The test suite mocks OpenAI SDK to avoid network calls.

Notes
- Provider Layer: Uses OpenAI SDK with preference for Responses API and fallback to Chat Completions.
- Persistence: Debate states are written to `./debates` as they progress and on completion.
- Agent Types: Supports architect (system design), performance (optimization), and security (threat modeling) perspectives.
- Defaults:
  - Default agents: architect and performance
  - Default model: `gpt-4`
  - Default temperature: `0.5`
  - Default rounds: `3`
