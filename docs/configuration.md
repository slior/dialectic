# Configuration Guide

This document describes all configuration options for the multi-agent debate system.

## Overview

The debate system can be configured through three mechanisms:

1. **Configuration File**: JSON file (default: `./debate-config.json`) defining agents, judge, and debate settings
2. **Environment Variables**: Required API keys and optional settings
3. **Command Line Options**: Runtime overrides for debate execution

If no configuration file is provided, the system uses built-in defaults.

## Configuration File

The configuration file is a JSON document with the following structure:

```json
{
  "agents": [...],
  "judge": {...},
  "debate": {...}
}
```

### File Location

- **Default Path**: `./debate-config.json` (in the current working directory)
- **Custom Path**: Specify via `--config <path>` command line option

### Root Configuration Schema

The root configuration object must conform to the `SystemConfig` interface:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agents` | `AgentConfig[]` | No | Array of agent configurations. If missing or empty, built-in defaults are used. |
| `judge` | `AgentConfig` | No | Configuration for the judge agent. If missing, a default judge is used. |
| `debate` | `DebateConfig` | No | Debate execution settings. If missing, default debate configuration is used. |

## Agent Configuration

Each agent (including the judge) is configured using the `AgentConfig` schema:

### Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the agent. Must be unique across all agents and the judge. |
| `name` | `string` | Yes | Human-readable name for the agent. Used in output and logging. |
| `role` | `AgentRole` | Yes | The functional role of the agent. |
| `model` | `string` | Yes | The LLM model name to use for this agent. |
| `provider` | `string` | Yes | The LLM provider. Currently only `"openai"` is supported. |
| `temperature` | `number` | Yes | Sampling temperature for the LLM. |
|| `systemPromptPath` | `string` | No | Path to a markdown/text file containing the system prompt. If omitted, a built-in prompt for the role is used. |
| `enabled` | `boolean` | No | Whether the agent is enabled. Defaults to `true` if omitted. |

### Field Details

#### `id`
- **Type**: String
- **Accepted Values**: Any non-empty string
- **Semantics**: Uniquely identifies the agent within the system. Used for tracking contributions and referencing agents in debate logs.
- **Example**: `"agent-architect"`, `"agent-perf-001"`

#### `name`
- **Type**: String
- **Accepted Values**: Any non-empty string
- **Semantics**: Human-readable display name for the agent. Used in console output, logs, and verbose mode.
- **Example**: `"System Architect"`, `"Performance Engineer"`

#### `role`
- **Type**: String (enum)
- **Accepted Values**:
  - `"architect"` - System architecture and design perspective
  - `"security"` - Security and privacy concerns
  - `"performance"` - Performance optimization and efficiency
  - `"testing"` - Testing strategy and quality assurance
  - `"generalist"` - General-purpose role (typically used for judge)
- **Semantics**: Defines the agent's functional perspective in the debate. Agents with unknown roles default to architect behavior with a warning.
- **Example**: `"architect"`

#### `model`
- **Type**: String
- **Accepted Values**: Any valid OpenAI model name
- **Common Values**: `"gpt-4"`, `"gpt-4-turbo"`, `"gpt-3.5-turbo"`
- **Semantics**: Specifies which LLM model the agent uses. More capable models generally produce better reasoning but cost more.
- **Example**: `"gpt-4"`

#### `provider`
- **Type**: String (literal)
- **Accepted Values**: `"openai"` (only supported value currently)
- **Semantics**: Specifies the LLM provider. Future versions may support additional providers.
- **Example**: `"openai"`

#### `temperature`
- **Type**: Number
- **Accepted Values**: `0.0` to `1.0` (inclusive)
- **Semantics**: Controls randomness in model output. Lower values (0.0-0.3) produce more deterministic and focused responses. Higher values (0.7-1.0) produce more creative and varied responses. Recommended ranges:
  - Judge: 0.2-0.3 (more deterministic)
  - Agents: 0.4-0.7 (balanced creativity)
- **Example**: `0.5`

#### `systemPromptPath`
- **Type**: String (optional)
- **Accepted Values**: File path (absolute or relative to the configuration file directory)
- **Semantics**: Filesystem path to a markdown/text file containing custom instructions that prime the agent's behavior. If omitted or invalid, the system uses a built-in prompt appropriate for the role.
- **Resolution**: Relative paths are resolved against the configuration file directory. No environment variable expansion is performed.
- **Reading**: File is read as UTF-8; the entire file content is used as the system prompt. Empty/whitespace-only files are considered invalid.
- **Fallback**: If the path is missing/unreadable/invalid, a warning is printed to stderr and the built-in prompt is used.
- **Example**: `"./prompts/architect.md"`

#### `enabled`
- **Type**: Boolean (optional)
- **Accepted Values**: `true` or `false`
- **Default**: `true`
- **Semantics**: Whether the agent participates in debates. Disabled agents are filtered out before debate execution. Useful for temporarily removing agents without deleting their configuration.
- **Example**: `true`

### Example Agent Configuration

```json
{
  "id": "agent-architect",
  "name": "System Architect",
  "role": "architect",
  "model": "gpt-4",
  "provider": "openai",
  "temperature": 0.5,
  "systemPromptPath": "./prompts/architect.md",
  "enabled": true
}
```

## Judge Configuration

The judge is a special agent that synthesizes the final solution after all debate rounds complete. It uses the same `AgentConfig` schema as regular agents.

### Judge-Specific Considerations

- Supports the same `systemPromptPath` behavior as agents (path resolved relative to the configuration file directory; invalid/empty files cause a warning and fallback to built-in).

- **Role**: Typically set to `"generalist"` to maintain objectivity
- **Temperature**: Recommended range is 0.2-0.3 for more consistent synthesis
- **Model**: Should be the same or more capable than agent models

### Default Judge Configuration

If no judge is specified in the configuration file, the system uses:

```json
{
  "id": "judge-main",
  "name": "Technical Judge",
  "role": "generalist",
  "model": "gpt-4",
  "provider": "openai",
  "temperature": 0.3
}
```

## Debate Configuration

The `DebateConfig` schema controls how debates execute:

### Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rounds` | `number` | Yes | Number of debate rounds to execute. |
| `terminationCondition` | `TerminationCondition` | Yes | Conditions for early termination. |
| `synthesisMethod` | `string` | Yes | Method for synthesizing the final solution. |
| `includeFullHistory` | `boolean` | Yes | Whether to include full debate history in agent context. |
| `timeoutPerRound` | `number` | Yes | Maximum time allowed per round in milliseconds. |

### Field Details

#### `rounds`
- **Type**: Number (integer)
- **Accepted Values**: Positive integers >= 1
- **Semantics**: Number of complete rounds to execute. Each round consists of all phases in order: proposal → critique → refinement. After the final round completes, the judge synthesizes the final solution. Proposals are fresh each round; agents may incorporate prior history when `includeFullHistory` is true.
- **Default**: 3
- **Example**: `3`

#### `terminationCondition`
- **Type**: Object
- **Schema**:
  - `type`: `"fixed"` | `"convergence"` | `"quality"`
  - `threshold`: `number` (optional, depends on type)
- **Accepted Values**:
  - `{ "type": "fixed" }` - Run exactly the specified number of rounds (currently only supported type)
  - `{ "type": "convergence", "threshold": 0.9 }` - Stop when solutions converge (planned)
  - `{ "type": "quality", "threshold": 85 }` - Stop when quality threshold reached (planned)
- **Semantics**: Determines when the debate terminates. Currently, only `"fixed"` type is implemented.
- **Default**: `{ "type": "fixed" }`
- **Example**: `{ "type": "fixed" }`

#### `synthesisMethod`
- **Type**: String (enum)
- **Accepted Values**: `"judge"` | `"voting"` | `"merge"`
- **Currently Supported**: `"judge"` only
- **Semantics**: How the final solution is produced:
  - `"judge"` - Judge agent synthesizes the solution based on all contributions
  - `"voting"` - Agents vote on proposals (planned)
  - `"merge"` - Automatic merging of proposals (planned)
- **Default**: `"judge"`
- **Example**: `"judge"`

#### `includeFullHistory`
- **Type**: Boolean
- **Accepted Values**: `true` or `false`
- **Semantics**: Whether agents receive the complete debate history or only recent context. Setting to `true` provides more context but uses more tokens.
- **Default**: `true`
- **Example**: `true`

#### `timeoutPerRound`
- **Type**: Number (integer)
- **Accepted Values**: Positive integers (milliseconds)
- **Semantics**: Maximum time allowed for a single round to complete. If exceeded, the debate may fail or proceed with partial results (behavior depends on implementation).
- **Default**: `300000` (5 minutes)
- **Example**: `300000`

### Default Debate Configuration

If no debate configuration is specified, the system uses:

```json
{
  "rounds": 3,
  "terminationCondition": { "type": "fixed" },
  "synthesisMethod": "judge",
  "includeFullHistory": true,
  "timeoutPerRound": 300000
}
```

### Example Debate Configuration

```json
{
  "rounds": 5,
  "terminationCondition": { "type": "fixed" },
  "synthesisMethod": "judge",
  "includeFullHistory": true,
  "timeoutPerRound": 600000
}
```

## Complete Configuration Example

```json
{
  "agents": [
    {
      "id": "agent-architect",
      "name": "System Architect",
      "role": "architect",
      "model": "gpt-4",
      "provider": "openai",
      "temperature": 0.5,
      "enabled": true
    },
    {
      "id": "agent-performance",
      "name": "Performance Engineer",
      "role": "performance",
      "model": "gpt-4",
      "provider": "openai",
      "temperature": 0.5,
      "enabled": true
    },
    {
      "id": "agent-security",
      "name": "Security Specialist",
      "role": "security",
      "model": "gpt-4",
      "provider": "openai",
      "temperature": 0.4,
      "enabled": false
    }
  ],
  "judge": {
    "id": "judge-main",
    "name": "Technical Judge",
    "role": "generalist",
    "model": "gpt-4",
    "provider": "openai",
    "temperature": 0.3
  },
  "debate": {
    "rounds": 3,
    "terminationCondition": { "type": "fixed" },
    "synthesisMethod": "judge",
    "includeFullHistory": true,
    "timeoutPerRound": 300000
  }
}
```

## Environment Variables

### `OPENAI_API_KEY`
- **Type**: String
- **Required**: Yes
- **Description**: Your OpenAI API key for authenticating with the OpenAI API.
- **How to Set**:
  - Windows PowerShell: `$Env:OPENAI_API_KEY = "sk-..."`
  - macOS/Linux bash/zsh: `export OPENAI_API_KEY="sk-..."`
- **Security**: Never commit this value to version control. Use environment variables or secret management systems.

## Command Line Options

The CLI accepts the following options that can override configuration file settings:

### `debate <problem>`
- **Description**: Main command to run a debate
- **Arguments**:
  - `<problem>` (required): The problem statement to debate. Must be a non-empty string.

### `-a, --agents <roles>`
- **Type**: String (comma-separated list)
- **Accepted Values**: Comma-separated list of role names: `architect`, `security`, `performance`, `testing`, `generalist`
- **Description**: Filter which agents participate in the debate. Only agents with matching roles will be included.
- **Default**: All enabled agents from configuration
- **Example**: `--agents architect,performance`
- **Behavior**: If no agents match the filter, the system falls back to default agents (architect and performance).
- **Important**: This option **filters** agents from the configuration file; it does not replace or override agent configurations. The configuration file defines the agent pool (including models, temperatures, custom prompts), while this option selects which configured agents participate in the debate. For example, if your config defines a security agent with a custom prompt and `gpt-4` model, using `--agents security` will use that configured security agent, not a default one.

### `-r, --rounds <number>`
- **Type**: Integer
- **Accepted Values**: Integers >= 1
- **Description**: Override the number of debate rounds.
- **Default**: Value from configuration file, or 3 if not specified
- **Example**: `--rounds 5`
- **Behavior**: Must be at least 1. Invalid values result in an error with exit code 2.

### `-c, --config <path>`
- **Type**: String (file path)
- **Accepted Values**: Path to a valid JSON configuration file
- **Description**: Path to the configuration file to load.
- **Default**: `./debate-config.json`
- **Example**: `--config ./custom-config.json`
- **Behavior**: If the file does not exist, the system uses built-in defaults and prints a warning to stderr.

### `-o, --output <path>`
- **Type**: String (file path)
- **Accepted Values**: Any valid file path
- **Description**: Output file for debate results.
- **Behavior**:
  - If path ends with `.json`: Full debate state (JSON) is written
  - Otherwise: Only the final solution text is written
  - If omitted: Solution is written to stdout
- **Example**: `--output result.json` or `--output solution.txt`

### `-v, --verbose`
- **Type**: Boolean flag
- **Description**: Enable verbose output showing round-by-round details, agent information, and metadata.
- **Default**: `false`
- **Example**: `--verbose`
- **Behavior**:
  - When enabled and no output file is specified, detailed round information is written to stdout after the solution.
  - Additionally, for each agent (and the judge), a one-line note shows which system prompt was used: either "built-in default" or the resolved absolute file path.

## Built-In Defaults

If the configuration file is missing or incomplete, the system uses these built-in defaults:

### Default Agents
```json
[
  {
    "id": "agent-architect",
    "name": "System Architect",
    "role": "architect",
    "model": "gpt-4",
    "provider": "openai",
    "temperature": 0.5,
    "enabled": true
  },
  {
    "id": "agent-performance",
    "name": "Performance Engineer",
    "role": "performance",
    "model": "gpt-4",
    "provider": "openai",
    "temperature": 0.5,
    "enabled": true
  }
]
```

### Default Judge
```json
{
  "id": "judge-main",
  "name": "Technical Judge",
  "role": "generalist",
  "model": "gpt-4",
  "provider": "openai",
  "temperature": 0.3
}
```

### Default Debate Settings
```json
{
  "rounds": 3,
  "terminationCondition": { "type": "fixed" },
  "synthesisMethod": "judge",
  "includeFullHistory": true,
  "timeoutPerRound": 300000
}
```

## Configuration Loading Behavior

1. **No Config File**: If the configuration file does not exist, all built-in defaults are used, and a warning is printed to stderr.

2. **Missing Agents**: If the configuration file exists but has no agents or an empty agents array, all built-in defaults are used, and a warning is printed.

3. **Missing Judge**: If the judge field is absent, the default judge is used, and a warning is printed.

4. **Missing Debate Settings**: If the debate field is absent, default debate settings are used (no warning).

5. **Invalid Agent Roles**: If an agent has an unrecognized role, it defaults to architect behavior, and a warning is printed.

6. **Disabled Agents**: Agents with `enabled: false` are excluded from debate execution.

7. **Agent Filtering**: The `--agents` CLI option filters enabled agents by role. If no agents match, defaults are used, and a warning is printed. The filtering process is: (1) load all agents from config, (2) filter out disabled agents, (3) apply role filter from `--agents` if provided, (4) fall back to defaults if result is empty.

8. **System Prompt Path Resolution**: If `systemPromptPath` is provided for an agent or judge, the CLI resolves it relative to the configuration file directory and attempts to read the full file as UTF-8. Missing/unreadable/empty files result in a warning to stderr and fallback to a built-in prompt.

## Exit Codes

The CLI uses specific exit codes to indicate different error conditions:

| Code | Meaning | Description |
|------|---------|-------------|
| 0 | Success | Debate completed successfully |
| 1 | General Error | Unexpected error during execution |
| 2 | Invalid Arguments | Invalid CLI arguments (e.g., missing problem, rounds < 1) |
| 3 | Provider Error | Reserved for future LLM provider errors |
| 4 | Configuration Error | Configuration issue (e.g., missing OPENAI_API_KEY) |

## Validation Rules

### Agent Configuration Validation
- `id` must be non-empty and unique across all agents and judge
- `name` must be non-empty
- `role` must be one of the accepted role values
- `provider` must be `"openai"`
- `temperature` must be between 0.0 and 1.0 (inclusive)
- `model` must be a valid OpenAI model identifier

### Debate Configuration Validation
- `rounds` must be >= 1 (validated at runtime)
- `terminationCondition.type` must be `"fixed"` (other types not yet implemented)
- `synthesisMethod` must be `"judge"` (other methods not yet implemented)
- `timeoutPerRound` must be a positive integer

### CLI Validation
- Problem statement must be non-empty
- `OPENAI_API_KEY` environment variable must be set
- Rounds (if specified) must be >= 1
- Configuration file (if specified) must be valid JSON

## Tips and Best Practices

1. **Start with Defaults**: Use the built-in defaults initially, then customize as needed.

2. **Temperature Settings**:
   - Use lower temperatures (0.2-0.3) for judges to ensure consistent synthesis
   - Use moderate temperatures (0.4-0.6) for agents to balance creativity and focus

3. **Agent Selection**: For complex problems, include multiple perspectives (architect, performance, security).

4. **Rounds**: Start with 3 rounds for most problems. Increase for complex issues requiring deeper exploration.

5. **Verbose Mode**: Use `--verbose` during development to understand agent behavior and debug issues.

6. **Output Files**: Save debates as JSON for later analysis and reproducibility.

7. **Environment Variables**: Use a `.env` file (with appropriate tooling) to manage API keys securely.

8. **Disabled Agents**: Use `enabled: false` to keep agent configurations without removing them entirely.

9. **Configuration vs CLI Filtering**: Use the configuration file to define your agent pool with all settings (models, temperatures, custom prompts), and use `--agents` for quick runtime selection. For example, configure all three agent types in your file, then use `--agents architect,security` for security-focused debates and `--agents architect,performance` for optimization debates—all while preserving each agent's custom configuration.

