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
| `provider` | `string` | Yes | The LLM provider. Supports `"openai"` or `"openrouter"`. |
| `temperature` | `number` | Yes | Sampling temperature for the LLM. |
| `systemPromptPath` | `string` | No | Path to a markdown/text file containing the system prompt. If omitted, a built-in prompt for the role is used. |
| `enabled` | `boolean` | No | Whether the agent is enabled. Defaults to `true` if omitted. |
| `clarificationPromptPath` | `string` | No | Path to a markdown/text file containing the clarifications prompt for this agent. If omitted, a built-in role-specific prompt is used. |
| `tools` | `ToolSchema[]` | No | Array of tool schemas available to this agent. Uses OpenAI function calling schema format. Currently, only base registry tools are supported; agent-specific tools require implementation factories (future enhancement). See [Tool Calling](#tool-calling) section for details. |
| `toolCallLimit` | `number` | No | Maximum number of tool call iterations per phase (proposal, critique, or refinement). Defaults to `10`. Each iteration counts toward this limit, including failed tool invocations. The limit applies independently to each phase. |

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
  - `"kiss"` - Simplicity-focused perspective, challenges complexity
  - `"generalist"` - General-purpose role (typically used for judge)
- **Semantics**: Defines the agent's functional perspective in the debate. Agents with unknown roles default to architect behavior with a warning.
- **Example**: `"architect"`

#### `model`
- **Type**: String
- **Accepted Values**: 
  - For OpenAI provider: Any valid OpenAI model name (e.g., `"gpt-4"`, `"gpt-4-turbo"`, `"gpt-3.5-turbo"`)
  - For OpenRouter provider: Full qualified model names (e.g., `"openai/gpt-4"`, `"anthropic/claude-3-sonnet"`)
- **Semantics**: Specifies which LLM model the agent uses. More capable models generally produce better reasoning but cost more.
- **Example**: `"gpt-4"` (OpenAI) or `"openai/gpt-4"` (OpenRouter)

#### `provider`
- **Type**: String (literal)
- **Accepted Values**: `"openai"` or `"openrouter"`
- **Semantics**: Specifies the LLM provider. Each provider requires its own API key and supports different model naming conventions.
- **Example**: `"openai"` or `"openrouter"`

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

#### `tools`
- **Type**: Array of `ToolSchema` objects (optional)
- **Accepted Values**: Array of tool schema objects following OpenAI function calling format
- **Default**: Empty array (agent receives base registry tools only)
- **Semantics**: Defines custom tool schemas available to this agent. Tools allow agents to interact with external functionality during proposal, critique, and refinement phases. Each tool schema must include `name`, `description`, and `parameters` fields matching OpenAI's function calling format.
- **Current Limitation**: Only base registry tools (e.g., Context Search) are currently supported. Agent-specific tools from this configuration require tool implementation factories (future enhancement). When tool schemas are provided but implementations are not available, the agent will use base registry tools only.
- **Tool Registry**: If tools are configured, an extended registry is created that inherits from the base registry. If no tools are configured, the agent uses the base registry directly.
- **Example**: See [Tool Calling](#tool-calling) section for detailed examples

#### `toolCallLimit`
- **Type**: Number (optional)
- **Accepted Values**: Positive integers >= 1
- **Default**: `10`
- **Semantics**: Maximum number of tool call iterations allowed per phase (proposal, critique, or refinement). Each iteration represents one complete cycle of: (1) LLM call with tool schemas, (2) tool execution if tool calls are present, (3) next LLM call with tool results. The limit applies independently to each phase, so an agent can use up to `toolCallLimit` iterations in proposal, `toolCallLimit` in critique, and `toolCallLimit` in refinement.
- **Counting**: Each iteration counts toward the limit, including:
  - Successful tool executions
  - Failed tool invocations (tool not found, invalid arguments, execution errors)
- **Termination**: When the limit is reached, the tool calling loop stops and uses the last LLM response text as the contribution content.
- **Recommendations**: 
  - Lower limits (5-10) for faster execution and lower token usage
  - Higher limits (15-20) for complex problems requiring extensive tool usage
  - Consider model context window capacity when setting limits
- **Example**: `5` (allows up to 5 tool call iterations per phase)

### Example Agent Configuration

#### Single Provider (OpenAI)
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

#### Single Provider (OpenRouter)
```json
{
  "id": "agent-architect",
  "name": "System Architect",
  "role": "architect",
  "model": "openai/gpt-4",
  "provider": "openrouter",
  "temperature": 0.5,
  "systemPromptPath": "./prompts/architect.md",
  "enabled": true
}
```

#### Mixed Provider Configuration
```json
{
  "id": "agent-architect",
  "name": "System Architect",
  "role": "architect",
  "model": "openai/gpt-4",
  "provider": "openrouter",
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
  "enabled": true
}
```

#### Agent with Tool Configuration
```json
{
  "id": "agent-architect",
  "name": "System Architect",
  "role": "architect",
  "model": "gpt-4",
  "provider": "openai",
  "temperature": 0.5,
  "enabled": true,
  "toolCallLimit": 5
}
```

This agent has access to base registry tools (Context Search) with a custom tool call limit. See [Tool Calling](#tool-calling) section for more examples with custom tool schemas.

### Default agents values:

- System Architect (role: `architect`, model: `gpt-4`, temperature: `0.5`)
- Performance Engineer (role: `performance`, model: `gpt-4`, temperature: `0.5`)
- Simplicity Advocate (role: `kiss`, model: `gpt-4`, temperature: `0.5`)

### Tool Calling

Agents can call tools during proposal, critique, and refinement phases. Tools allow agents to interact with external functionality, such as searching debate history or accessing external APIs. The tool calling system uses OpenAI's function calling format, allowing agents to request tool execution and receive results within the same LLM interaction.

#### Overview

When an agent has tools configured, the system implements a tool calling loop:
1. **System Prompt Enhancement**: The agent's system prompt is automatically enhanced with tool information, making agents explicitly aware of available tools and their usage
2. **Initial LLM Call**: Agent makes a request with enhanced system prompt, user prompt, and tool schemas (via OpenAI function calling API)
3. **Tool Call Detection**: LLM response may include tool call requests
4. **Tool Execution**: Each requested tool is executed synchronously
5. **Result Integration**: Tool results are sent back to the LLM
6. **Iteration**: Process continues until no tool calls or limit reached

Tool calls, results, and iteration counts are stored in contribution metadata for persistence and analysis.

#### Tool Configuration

Tools are configured per agent in the `AgentConfig` using the `tools` field. Each tool must follow the OpenAI function calling schema format:

```json
{
  "tools": [
    {
      "name": "tool_name",
      "description": "Description of what the tool does",
      "parameters": {
        "type": "object",
        "properties": {
          "paramName": {
            "type": "string",
            "description": "Parameter description"
          }
        },
        "required": ["paramName"]
      }
    }
  ],
  "toolCallLimit": 10
}
```

**Schema Requirements**:
- `name`: Unique tool identifier (string, required)
- `description`: Human-readable description explaining what the tool does (string, required)
- `parameters`: JSON Schema object defining tool parameters (object, required)
  - `type`: Must be `"object"`
  - `properties`: Object mapping parameter names to their schemas
  - `required`: Array of required parameter names (optional)

**Parameter Types**: Supported JSON Schema types include `string`, `number`, `boolean`, `array`, and `object`. Each parameter can include a `description` field to help the LLM understand its purpose.

#### Tool Registry System

The system uses a hierarchical tool registry:

- **Base Registry**: Created once per debate, contains common tools available to all agents
- **Extended Registry**: Agent-specific registries that inherit from the base registry
- **Registry Building**: If an agent has `tools` configured, an extended registry is created; otherwise, the base registry is used

**Current Limitation**: Only base registry tools are currently supported. Agent-specific tools defined in `AgentConfig.tools` require tool implementation factories (future enhancement). For now, agents with custom tool schemas will receive the base registry tools only.

#### Base Tools

All agents have access to a base set of tools registered in the base registry:

##### Context Search (`context_search`)

Searches the debate history for contributions containing a specific term.

**Parameters**:
- `term` (string, required): The search term to find in debate history

**Returns**: JSON object with status and matches array:
```json
{
  "status": "success",
  "result": {
    "matches": [
      {
        "roundNumber": 1,
        "agentId": "agent-architect",
        "agentRole": "architect",
        "type": "proposal",
        "contentSnippet": "First 200 characters of matching content..."
      }
    ]
  }
}
```

**Behavior**:
- Case-insensitive substring matching
- Searches across all rounds and contribution types
- Returns matches with metadata (round number, agent ID, role, type, content snippet)
- Content snippets are truncated to 200 characters

**Example Usage**: An agent can search for previous mentions of "caching" or "authentication" to reference earlier discussions in their proposal or critique.

#### Tool Call Limits

The `toolCallLimit` field controls the maximum number of tool call iterations per phase (proposal, critique, or refinement).

**Behavior**:
- **Default**: `10` iterations per phase per agent
- **Scope**: Limit applies independently to each phase (proposal, critique, refinement)
- **Counting**: Each iteration counts toward the limit, including:
  - Successful tool executions
  - Failed tool invocations (tool not found, invalid arguments, execution errors)
- **Termination**: When the limit is reached, the loop stops and uses the last LLM response text

**Recommendations**:
- Lower limits (5-10) for faster execution and lower token usage
- Higher limits (15-20) for complex problems requiring extensive tool usage
- Consider your model's context window when setting limits, as each iteration adds messages to the conversation

#### Tool Execution Flow

When an agent makes an LLM call with tools available:

1. **System Prompt Enhancement**: The agent's system prompt is automatically enhanced with a "## Available Tools" section that describes:
   - Each available tool's name and description
   - Tool parameters with types, required/optional status, and parameter descriptions
   - Instructions on how to use tools naturally in responses
   
   This enhancement ensures agents are explicitly aware of available tools and their capabilities, complementing the OpenAI function calling API format.

2. **Initial Request**: System sends enhanced system prompt (with tool information), user prompt, and tool schemas to the LLM via the OpenAI function calling API
3. **Response Processing**: LLM may return:
   - Text response only (no tool calls) → process completes
   - Text response with tool calls → proceed to execution
4. **Tool Execution Loop**:
   - For each tool call in the response:
     - Parse tool call arguments (JSON string)
     - Retrieve tool from registry by name
     - Execute tool synchronously with debate context
     - Create tool result in OpenAI format
     - Display user feedback: `[Agent Name] Executing tool: {toolName}`
   - Build messages array for next LLM call:
     - Add assistant message with tool calls
     - Add tool result messages (one per tool call)
   - Make next LLM call with accumulated conversation history (using enhanced system prompt)
   - Repeat until no tool calls or limit reached
5. **Final Response**: Use text from the last LLM call as the contribution content

**System Prompt Format**: The tool information section is formatted as:
```
## Available Tools

You have access to the following tools that you can use to gather information or perform actions:

- **tool_name**: Tool description
  - paramName (type) (required) - Parameter description
  - optionalParam (type) (optional) - Optional parameter description

When you need to use a tool, request it naturally in your response. The tool will be executed automatically and the results will be provided to you.
```

#### Error Handling

The system handles tool execution errors gracefully:

- **Tool Not Found**: Warning logged, error result created, continues to next tool call
- **Invalid Arguments**: JSON parse errors result in warnings and error results
- **Execution Errors**: Tool execution exceptions are caught, logged, and result in error results
- **Non-Fatal**: All errors are non-fatal; the debate continues normally
- **Error Results**: Failed tool invocations produce error results with status `"error"` and error message
- **Limit Counting**: Failed invocations count toward the iteration limit

Error results follow this format:
```json
{
  "status": "error",
  "error": "Error message describing what went wrong"
}
```

#### Tool Metadata Persistence

Tool calling metadata is stored in contribution metadata:

- **`toolCalls`**: Array of tool calls made during this contribution
  - Each tool call includes: `id`, `name`, `arguments` (JSON string)
- **`toolResults`**: Array of tool results received during this contribution
  - Each result includes: `tool_call_id`, `role` ("tool"), `content` (JSON string)
- **`toolCallIterations`**: Number of tool call iterations performed

This metadata is:
- Persisted in debate state JSON files
- Included in generated reports
- Available for analysis and debugging

#### User Feedback

When tools are executed, user feedback messages are displayed in real-time:

```
[System Architect] Executing tool: context_search with arguments: {"term":"caching"}
[System Architect] Tool "context_search" execution result: {"status":"success","result":{"matches":[...]}}
```

These messages are written to stderr, ensuring they don't interfere with stdout output (solution text).

#### Example Configurations

##### Agent with Base Tools Only (Default)

```json
{
  "id": "agent-architect",
  "name": "System Architect",
  "role": "architect",
  "model": "gpt-4",
  "provider": "openai",
  "temperature": 0.5
}
```

This agent will have access to base registry tools (Context Search) with default tool call limit of 10.

##### Agent with Custom Tool Call Limit

```json
{
  "id": "agent-architect",
  "name": "System Architect",
  "role": "architect",
  "model": "gpt-4",
  "provider": "openai",
  "temperature": 0.5,
  "toolCallLimit": 5
}
```

This agent uses base tools but with a lower iteration limit for faster execution.

##### Agent with Tool Schemas (Future Enhancement)

```json
{
  "id": "agent-architect",
  "name": "System Architect",
  "role": "architect",
  "model": "gpt-4",
  "provider": "openai",
  "temperature": 0.5,
  "tools": [
    {
      "name": "custom_tool",
      "description": "A custom tool for the architect",
      "parameters": {
        "type": "object",
        "properties": {
          "input": {
            "type": "string",
            "description": "Input parameter"
          },
          "options": {
            "type": "object",
            "description": "Optional configuration"
          }
        },
        "required": ["input"]
      }
    }
  ],
  "toolCallLimit": 15
}
```

**Note**: Currently, only base registry tools (like Context Search) are available. Agent-specific tools from configuration require tool implementation factories (future enhancement). When tool implementation factories are available, agents with custom tool schemas will have access to both base tools and their custom tools.

#### Best Practices

1. **Start with Defaults**: Use base tools with default limits initially, then adjust based on needs
2. **Monitor Tool Usage**: Use verbose mode (`--verbose`) to see tool execution in real-time
3. **Set Appropriate Limits**: Balance between allowing sufficient tool usage and preventing excessive iterations
4. **Review Tool Metadata**: Check contribution metadata in debate state files to understand tool usage patterns
5. **Error Handling**: Be aware that failed tool invocations count toward limits; ensure tools are properly configured
6. **Context Search**: Leverage Context Search tool to help agents reference earlier contributions and maintain consistency

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
| `interactiveClarifications` | `boolean` | No | Run a one-time pre-debate clarifications phase (default: false). |
| `clarificationsMaxPerAgent` | `number` | No | Max questions per agent in clarifications phase (default: 5; excess truncated with a warning). |
| `trace` | `string` | No | Tracing provider to use for observability. Currently supports `"langfuse"` only. If omitted, tracing is disabled. |

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

#### `trace`
- **Type**: String (optional)
- **Accepted Values**: `"langfuse"` (currently the only supported value)
- **Semantics**: Enables observability tracing for the debate. When set to `"langfuse"`, all agent operations, LLM calls, and tool executions are traced to Langfuse. Requires Langfuse environment variables to be configured (see [Tracing Configuration](#tracing-configuration) section).
- **Default**: Tracing is disabled if omitted
- **Example**: `"langfuse"`

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

## Tracing Configuration

The debate system supports observability tracing through Langfuse, allowing you to monitor and analyze agent behavior, LLM calls, and tool executions in real-time.

### Overview

When tracing is enabled, the system creates a hierarchical trace structure in Langfuse:
- **Top-level trace**: Represents the entire debate command execution
- **Agent spans**: One span per agent method call (propose, critique, refine, prepareContext, askClarifyingQuestions)
- **LLM generations**: Nested within agent spans, one per LLM call (including tool-calling iterations)
- **Tool execution spans**: Nested within agent spans, one per tool invocation

This structure provides complete visibility into the debate execution flow, making it easier to debug issues, analyze performance, and understand agent behavior.

### Configuration

Tracing is enabled by setting the `trace` field in the debate configuration:

```json
{
  "debate": {
    "rounds": 3,
    "terminationCondition": { "type": "fixed" },
    "synthesisMethod": "judge",
    "includeFullHistory": true,
    "timeoutPerRound": 300000,
    "trace": "langfuse"
  }
}
```

### Environment Variables

Langfuse tracing requires the following environment variables to be set:

#### `LANGFUSE_SECRET_KEY`
- **Type**: String
- **Required**: Yes (when tracing is enabled)
- **Description**: Your Langfuse secret key for authenticating API requests. This is a write-only key used to send traces to Langfuse.
- **How to Set**:
  - Windows PowerShell: `$Env:LANGFUSE_SECRET_KEY = "sk-lf-..."`
  - macOS/Linux bash/zsh: `export LANGFUSE_SECRET_KEY="sk-lf-..."`
- **Security**: Never commit this value to version control. Use environment variables or secret management systems.
- **Where to Find**: Available in your Langfuse project settings under "API Keys"

#### `LANGFUSE_PUBLIC_KEY`
- **Type**: String
- **Required**: Yes (when tracing is enabled)
- **Description**: Your Langfuse public key for identifying your project. This is a read-only key used to identify which project the traces belong to.
- **How to Set**:
  - Windows PowerShell: `$Env:LANGFUSE_PUBLIC_KEY = "pk-lf-..."`
  - macOS/Linux bash/zsh: `export LANGFUSE_PUBLIC_KEY="pk-lf-..."`
- **Security**: While this is a read-only key, it's still recommended to keep it secure and not commit it to version control.
- **Where to Find**: Available in your Langfuse project settings under "API Keys"

#### `LANGFUSE_BASE_URL`
- **Type**: String
- **Required**: No
- **Description**: Base URL for the Langfuse API. Use this to point to a self-hosted Langfuse instance or a custom endpoint.
- **Default**: `"https://cloud.langfuse.com"` (Langfuse Cloud)
- **How to Set**:
  - Windows PowerShell: `$Env:LANGFUSE_BASE_URL = "https://your-langfuse-instance.com"`
  - macOS/Linux bash/zsh: `export LANGFUSE_BASE_URL="https://your-langfuse-instance.com"`
- **Example**: For self-hosted instances: `"https://langfuse.yourcompany.com"`

### Trace Structure

When tracing is enabled, the following structure is created in Langfuse:

```
debate-command (trace)
├── agent-propose-{agentId} (span)
│   ├── llm-generation-0 (generation)
│   ├── tool-execution-{toolName} (span) [if tools are called]
│   ├── llm-generation-1 (generation) [if tool calling continues]
│   └── ...
├── agent-critique-{agentId} (span)
│   └── llm-generation-0 (generation)
├── agent-refine-{agentId} (span)
│   └── llm-generation-0 (generation)
└── ...
```

### Trace Metadata

Each trace and span includes relevant metadata:

**Top-level trace metadata:**
- `debateId`: Unique identifier for the debate

**Agent span metadata:**
- `agentName`: Human-readable agent name
- `agentRole`: Agent role (architect, performance, security, etc.)
- `agentId`: Unique agent identifier
- `debateId`: Debate identifier
- `roundNumber`: Current round number (if available)

**LLM generation metadata:**
- `model`: LLM model used
- `temperature`: Temperature setting
- `provider`: LLM provider (openai, openrouter)
- `iteration`: Tool calling iteration number (0-indexed)

**Tool execution span metadata:**
- `toolName`: Name of the tool executed
- `agentId`: Agent that executed the tool
- `debateId`: Debate identifier

### Behavior

#### Initialization

When tracing is enabled:
1. The system validates that required environment variables (`LANGFUSE_SECRET_KEY` and `LANGFUSE_PUBLIC_KEY`) are set
2. A Langfuse client is created with the provided credentials
3. A top-level trace is created for the debate command
4. If initialization fails, a warning is logged and the debate continues without tracing

#### During Execution

- All agent operations are wrapped in spans
- LLM calls create generation spans within the active agent span
- Tool executions create nested spans within the active agent span
- Errors are captured and marked with error level in spans
- Tracing failures are non-blocking - warnings are logged but the debate continues

#### Completion

- After the debate completes, the trace is automatically flushed to Langfuse
- The trace is ended when all spans are completed
- If flushing fails, a warning is logged but does not affect the debate result

### Error Handling

The tracing system is designed to be non-blocking:
- **Missing Environment Variables**: If tracing is enabled but environment variables are missing, a warning is logged and the debate continues without tracing
- **Initialization Failures**: If Langfuse client creation fails, a warning is logged and the debate continues without tracing
- **Tracing Failures**: If individual span or generation creation fails, a warning is logged for that operation but execution continues
- **Flush Failures**: If trace flushing fails at the end, a warning is logged but does not affect the debate result

### Example Configuration

#### Enable Tracing in Configuration File

```json
{
  "debate": {
    "rounds": 3,
    "terminationCondition": { "type": "fixed" },
    "synthesisMethod": "judge",
    "includeFullHistory": true,
    "timeoutPerRound": 300000,
    "trace": "langfuse"
  }
}
```

#### Using Environment Variables

**Windows PowerShell:**
```powershell
$Env:LANGFUSE_SECRET_KEY = "sk-lf-..."
$Env:LANGFUSE_PUBLIC_KEY = "pk-lf-..."
# Optional: for self-hosted instances
$Env:LANGFUSE_BASE_URL = "https://your-langfuse-instance.com"
dialectic debate "Design a caching system"
```

**macOS/Linux:**
```bash
export LANGFUSE_SECRET_KEY="sk-lf-..."
export LANGFUSE_PUBLIC_KEY="pk-lf-..."
# Optional: for self-hosted instances
export LANGFUSE_BASE_URL="https://your-langfuse-instance.com"
dialectic debate "Design a caching system"
```

**Using .env file:**
```bash
# .env file
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

Then run:
```bash
dialectic debate "Design a caching system" --env-file .env
```

### Best Practices

1. **Development**: Enable tracing during development to understand agent behavior and debug issues
2. **Production**: Consider enabling tracing in production for monitoring and analysis, but be aware of the performance overhead
3. **Environment Variables**: Use `.env` files for local development and secure secret management systems for production
4. **Self-Hosted**: If using a self-hosted Langfuse instance, set `LANGFUSE_BASE_URL` to point to your instance
5. **Error Monitoring**: Check Langfuse dashboard regularly to identify any tracing failures or issues
6. **Performance**: Tracing adds minimal overhead, but for high-volume production use, monitor performance impact

### Viewing Traces

After a debate completes with tracing enabled:
1. Navigate to your Langfuse project dashboard
2. Find the trace named `debate-command` with the matching `debateId` metadata
3. Expand the trace to see all agent spans and LLM generations
4. Click on individual spans to see detailed metadata, inputs, outputs, and timing information

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
    "timeoutPerRound": 300000,
    "trace": "langfuse"
  }
}
```

**Note**: The `trace` field is optional. When set to `"langfuse"`, ensure `LANGFUSE_SECRET_KEY` and `LANGFUSE_PUBLIC_KEY` environment variables are set (see [Tracing Configuration](#tracing-configuration) section).
```

## Context Summarization Configuration

The debate system includes automatic context summarization to manage debate history length and avoid context window limitations. Each agent independently summarizes their perspective-based history when it exceeds configured thresholds. The judge agent also supports summarization for synthesis when the final round's content becomes too large.

### Overview

Context summarization is configured at two levels:
1. **System-Wide**: Default summarization settings in `debate.summarization`
2. **Per-Agent**: Agent-specific overrides in `AgentConfig.summarization`

Agent-level settings override system-wide settings, allowing fine-grained control over which agents summarize and how. The judge agent uses the same system-wide summarization configuration for its synthesis process.

### System-Wide Configuration

Add a `summarization` field to the `debate` configuration:

```json
{
  "debate": {
    "rounds": 3,
    "terminationCondition": { "type": "fixed" },
    "synthesisMethod": "judge",
    "includeFullHistory": true,
    "timeoutPerRound": 300000,
    "summarization": {
      "enabled": true,
      "threshold": 5000,
      "maxLength": 2500,
      "method": "length-based"
    }
  }
}
```

### Summarization Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enabled` | `boolean` | Yes | Whether summarization is enabled. |
| `threshold` | `number` | Yes | Character count threshold for triggering summarization. |
| `maxLength` | `number` | Yes | Maximum length of generated summary in characters. |
| `method` | `string` | Yes | Summarization method to use. Currently only `"length-based"` is supported. |
| `promptPath` | `string` | No | Optional path to custom summarization prompt file. |

### Field Details

#### `enabled`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Controls whether agents perform context summarization. When `false`, agents always receive full history (subject to `includeFullHistory` setting).
- **Example**: `true`

#### `threshold`
- **Type**: Number (integer)
- **Default**: `5000`
- **Description**: Character count threshold for triggering summarization. When an agent's perspective-based history (their proposals, received critiques, and refinements) exceeds this threshold, summarization is triggered.
- **Minimum**: 100 (practical minimum)
- **Example**: `5000`

#### `maxLength`
- **Type**: Number (integer)
- **Default**: `2500`
- **Description**: Maximum length of the generated summary in characters. Summaries exceeding this length are truncated.
- **Recommendation**: Set to approximately 50% of threshold for effective compression
- **Example**: `2500`

#### `method`
- **Type**: String (enum)
- **Accepted Values**: `"length-based"` (only supported value currently)
- **Default**: `"length-based"`
- **Description**: Summarization strategy to use. Future versions may support additional methods like `"semantic"` or `"hierarchical"`.
- **Example**: `"length-based"`

#### `promptPath`
- **Type**: String (optional)
- **Description**: Path to a custom summarization prompt file, resolved relative to the configuration file directory.
- **Fallback**: If omitted or invalid, uses built-in role-specific summary prompts
- **Example**: `"./prompts/custom-summary.md"`

### Per-Agent Configuration

Agents can override system-wide summarization settings:

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
      "summaryPromptPath": "./prompts/architect-summary.md",
      "summarization": {
        "enabled": true,
        "threshold": 3000,
        "maxLength": 1500,
        "method": "length-based"
      }
    }
  ]
}
```

### Agent-Specific Fields

In addition to the `summarization` object, agents support:

#### `summaryPromptPath`
- **Type**: String (optional)
- **Description**: Path to a custom summary prompt for this specific agent, following the same resolution rules as `systemPromptPath`
- **Fallback**: If omitted, uses built-in role-specific summary prompt
- **Resolution**: Relative paths resolved against configuration file directory
- **Example**: `"./prompts/architect-summary.md"`

### Default Configuration

If no summarization configuration is provided, the system uses:

```json
{
  "enabled": true,
  "threshold": 5000,
  "maxLength": 2500,
  "method": "length-based"
}
```

### Behavior Details

#### When Summarization Occurs

Summarization happens at the beginning of each round, before the proposal phase:

1. **Decision**: Each agent evaluates whether their history exceeds the threshold
2. **Filtering**: Agent filters history to their perspective:
   - Their own proposals
   - Critiques they received (not critiques of other agents)
   - Their own refinements
3. **Calculation**: Total character count is calculated from filtered history
4. **Trigger**: If count >= threshold, summarization is performed
5. **LLM Call**: Agent uses configured model, temperature, and provider to generate summary (falls back to defaults if not provided: model `gpt-4`, temperature `0.3`)
6. **Storage**: Summary and metadata are persisted as `round.summaries[agentId] = summary` (keyed by agent ID)

**Judge Summarization**: The judge also performs summarization during the synthesis phase if the final round's proposals and refinements exceed the threshold. The judge's summary is stored separately in `DebateState.judgeSummary`.

#### What Gets Summarized

Each agent summarizes **only their perspective** of the debate:
- **Proposals**: All proposals made by this agent across all rounds
- **Critiques Received**: Only critiques targeting this agent's proposals
- **Refinements**: All refinements made by this agent

Critiques of other agents are **excluded** from each agent's summary.

**Judge Summarization**: The judge summarizes only the final round's proposals and refinements (not critiques) when the content exceeds the threshold. This provides a focused view of the most recent solution attempts for synthesis.

#### Context Usage

The system uses summaries dynamically when formatting prompts:

1. **Storage**: Summaries are stored in `round.summaries[agentId]` (Record keyed by agent ID)
2. **Retrieval**: When generating a prompt, the formatter:
   - Searches backwards through `context.history` rounds
   - Looks for `round.summaries[agentId]`
   - Uses the **most recent summary** if found
   - Falls back to full history if no summary exists
3. **Data Isolation**: Each agent only sees their own summary
4. **Fresh Summaries**: Summary is **recalculated fresh each round** (not incremental)
5. **Original Context**: The `DebateContext` object is never modified - summaries are retrieved dynamically

**Precedence**: Agent's most recent summary > Full history > No context

#### Verbose Output

When `--verbose` is enabled, summarization information is displayed:

```
Summarization:
  - Enabled: true
  - Threshold: 5000 characters
  - Max summary length: 2500 characters
  - Method: length-based

Round 1
  summaries:
    [architect] 6234 → 2345 chars
      (latency=1234ms, tokens=456, method=length-based)
```

### Summary Prompts

The system provides built-in role-specific summary prompts that instruct agents to:
- Summarize from their role's perspective
- Preserve critical insights and decisions
- Focus on information useful for future rounds
- Stay within the maximum length

Custom summary prompts can override these using `summaryPromptPath` (per-agent) or `debate.summarization.promptPath` (system-wide).

#### Custom Summary Prompt Format

Custom prompts should include:
- Instructions to summarize from the role's perspective
- Guidance on what to preserve (key decisions, open questions, critical points)
- Maximum length constraint
- Content placeholder (the history to summarize will be provided)

**Example custom summary prompt:**
```markdown
You are summarizing the debate history from an architectural perspective.

Focus on:
- Key architectural decisions and their rationale
- Component designs and interfaces
- Scalability concerns discussed
- Open architectural questions

Create a concise summary (maximum 2500 characters) that preserves the most important architectural insights and decisions for use in future rounds.

History to summarize:
{content}
```

### Fallback Behavior

#### Missing Summary Prompt

If `summaryPromptPath` is specified but the file is missing or invalid:
- System uses built-in role-specific summary prompt
- Warning is logged to stderr
- Debate continues normally

#### Summarization Failure

If summarization fails due to LLM errors:
- Agent falls back to using full history
- Warning is logged to stderr with error details
- Debate continues normally

### Configuration Examples

#### Disable Summarization Globally

```json
{
  "debate": {
    "summarization": {
      "enabled": false
    }
  }
}
```

#### Aggressive Summarization (Low Threshold)

```json
{
  "debate": {
    "summarization": {
      "enabled": true,
      "threshold": 2000,
      "maxLength": 1000,
      "method": "length-based"
    }
  }
}
```

#### Per-Agent Customization

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
      "summarization": {
        "enabled": true,
        "threshold": 3000,
        "maxLength": 1500,
        "method": "length-based"
      }
    },
    {
      "id": "agent-security",
      "name": "Security Specialist",
      "role": "security",
      "model": "gpt-4",
      "provider": "openai",
      "temperature": 0.4,
      "summarization": {
        "enabled": false
      }
    }
  ]
}
```

### Best Practices

1. **Default Settings**: The default threshold (5000 characters) and max length (2500 characters) work well for most debates. Start with these and adjust if needed.

2. **Threshold Selection**: Set threshold based on your models' context windows and typical debate verbosity. Consider that proposals, critiques, and refinements add up quickly.

3. **Max Length**: Set maxLength to approximately 40-50% of threshold for effective compression while preserving key information.

4. **Per-Agent Tuning**: Different roles may need different thresholds:
   - Architect agents often produce longer, more detailed proposals → higher threshold
   - Security agents may be more concise → lower threshold acceptable

5. **Monitor Verbose Output**: Use `--verbose` to see when summarization triggers and verify summaries are appropriately sized.

6. **Custom Prompts**: For specialized use cases, provide custom summary prompts that emphasize domain-specific information to preserve.

7. **Balance**: Summarization reduces context size but may lose detail. If debates are producing poor results after summarization, increase the threshold or disable it for critical agents.

## Environment Variables

### `OPENAI_API_KEY`
- **Type**: String
- **Required**: Yes (when using OpenAI provider)
- **Description**: Your OpenAI API key for authenticating with the OpenAI API.
- **How to Set**:
  - Windows PowerShell: `$Env:OPENAI_API_KEY = "sk-..."`
  - macOS/Linux bash/zsh: `export OPENAI_API_KEY="sk-..."`
- **Security**: Never commit this value to version control. Use environment variables or secret management systems.

### `OPENROUTER_API_KEY`
- **Type**: String
- **Required**: Yes (when using OpenRouter provider)
- **Description**: Your OpenRouter API key for authenticating with the OpenRouter API.
- **How to Set**:
  - Windows PowerShell: `$Env:OPENROUTER_API_KEY = "sk-or-..."`
  - macOS/Linux bash/zsh: `export OPENROUTER_API_KEY="sk-or-..."`
- **Security**: Never commit this value to version control. Use environment variables or secret management systems.

### `LANGFUSE_SECRET_KEY`
- **Type**: String
- **Required**: Yes (when tracing is enabled with `trace: "langfuse"`)
- **Description**: Your Langfuse secret key for authenticating API requests. This is a write-only key used to send traces to Langfuse.
- **How to Set**:
  - Windows PowerShell: `$Env:LANGFUSE_SECRET_KEY = "sk-lf-..."`
  - macOS/Linux bash/zsh: `export LANGFUSE_SECRET_KEY="sk-lf-..."`
- **Security**: Never commit this value to version control. Use environment variables or secret management systems.
- **Where to Find**: Available in your Langfuse project settings under "API Keys"

### `LANGFUSE_PUBLIC_KEY`
- **Type**: String
- **Required**: Yes (when tracing is enabled with `trace: "langfuse"`)
- **Description**: Your Langfuse public key for identifying your project. This is a read-only key used to identify which project the traces belong to.
- **How to Set**:
  - Windows PowerShell: `$Env:LANGFUSE_PUBLIC_KEY = "pk-lf-..."`
  - macOS/Linux bash/zsh: `export LANGFUSE_PUBLIC_KEY="pk-lf-..."`
- **Security**: While this is a read-only key, it's still recommended to keep it secure and not commit it to version control.
- **Where to Find**: Available in your Langfuse project settings under "API Keys"

### `LANGFUSE_BASE_URL`
- **Type**: String
- **Required**: No
- **Description**: Base URL for the Langfuse API. Use this to point to a self-hosted Langfuse instance or a custom endpoint.
- **Default**: `"https://cloud.langfuse.com"` (Langfuse Cloud)
- **How to Set**:
  - Windows PowerShell: `$Env:LANGFUSE_BASE_URL = "https://your-langfuse-instance.com"`
  - macOS/Linux bash/zsh: `export LANGFUSE_BASE_URL="https://your-langfuse-instance.com"`
- **Example**: For self-hosted instances: `"https://langfuse.yourcompany.com"`

### `NEXT_PUBLIC_API_URL`
- **Type**: String
- **Required**: No
- **Description**: Base URL for the Web API server that the Web UI connects to via WebSocket. This is used by the Next.js frontend to establish Socket.IO connections for real-time debate updates.
- **Default**: `"http://localhost:3001"` (default NestJS API server port)
- **How to Set**:
  - Windows PowerShell: `$Env:NEXT_PUBLIC_API_URL = "http://localhost:3001"`
  - macOS/Linux bash/zsh: `export NEXT_PUBLIC_API_URL="http://localhost:3001"`
  - In `.env` file: `NEXT_PUBLIC_API_URL=http://localhost:3001`
- **Location**: Set this in the project root `.env` file or in `packages/web-ui/.env.local` for Next.js to pick it up
- **Note**: The `NEXT_PUBLIC_` prefix is required for Next.js to expose this variable to client-side code. Changes require restarting the dev server or rebuilding the application.
- **Examples**:
  - Development (default): `http://localhost:3001`
  - Custom port: `http://localhost:8080`
  - Production: `https://api.yourdomain.com`
  - Self-hosted: `https://your-api-server.com`

### `CORS_ORIGINS`
- **Type**: String (comma-separated)
- **Required**: No
- **Description**: Comma-separated list of allowed CORS origins for the web API. This controls which origins are allowed to make cross-origin requests to both the HTTP REST API and WebSocket connections. Each origin should be a complete URL including the protocol (http:// or https://).
- **Default**: `"http://localhost:3000,http://127.0.0.1:3000"` (suitable for local development)
- **How to Set**:
  - Windows PowerShell: `$Env:CORS_ORIGINS = "http://localhost:3000,https://app.yourdomain.com"`
  - macOS/Linux bash/zsh: `export CORS_ORIGINS="http://localhost:3000,https://app.yourdomain.com"`
  - In `.env` file: `CORS_ORIGINS=http://localhost:3000,https://app.yourdomain.com`
- **Examples**:
  - Single origin (localhost): `http://localhost:3000`
  - Multiple origins (development): `http://localhost:3000,http://127.0.0.1:3000`
  - Multiple origins (production): `https://app.yourdomain.com,https://www.yourdomain.com`
  - Mixed development and production: `http://localhost:3000,https://app.yourdomain.com`
- **Note**: This setting applies to both HTTP REST API endpoints and WebSocket connections. The origins are parsed by splitting on commas, trimming whitespace, and filtering out empty values. Only include trusted origins for security.
- **Security**: Only include origins that you trust. In production, restrict this to your actual frontend domain(s). Wildcards are not supported; each origin must be explicitly listed.

## Command Line Options

The CLI accepts the following options that can override configuration file settings:
- ### `--clarify`
- **Type**: Boolean flag
- **Description**: Forces a one-time pre-debate clarifications phase regardless of configuration.
- **Precedence**: Takes precedence over `debate.interactiveClarifications` in the configuration file.


### `debate <problem>`
- **Description**: Main command to run a debate
- **Arguments**:
  - `<problem>` (required): The problem statement to debate. Must be a non-empty string.

### `-a, --agents <roles>`
- **Type**: String (comma-separated list)
- **Accepted Values**: Comma-separated list of role names: `architect`, `security`, `performance`, `testing`, `kiss`, `generalist`
- **Description**: Filter which agents participate in the debate. Only agents with matching roles will be included.
- **Default**: All enabled agents from configuration
- **Example**: `--agents architect,performance`
- **Behavior**: If no agents match the filter, the system falls back to default agents (architect, performance, and kiss).
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
  },
  {
    "id": "agent-kiss",
    "name": "Simplicity Advocate",
    "role": "kiss",
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

