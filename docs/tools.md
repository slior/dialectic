# Tools

Tools allow agents to interact with external functionality during debate phases (proposal, critique, and refinement). Agents can call tools to gather information, search debate history, or perform other actions that enhance their contributions.

## Tool Configuration

Tools are configured per agent in the debate configuration file using the `tools` field in `AgentConfig`. Each tool must follow the OpenAI function calling schema format.

### Basic Configuration

To enable tools for an agent, add a `tools` array to the agent's configuration:

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
      "name": "context_search",
      "description": "Search for a term in the debate history. Returns relevant contributions containing the search term.",
      "parameters": {
        "type": "object",
        "properties": {
          "term": {
            "type": "string",
            "description": "The search term to find in debate history"
          }
        },
        "required": ["term"]
      }
    }
  ],
  "toolCallLimit": 10
}
```

### Configuration Fields

#### `tools`
- **Type**: Array of `ToolSchema` objects (optional)
- **Default**: Empty array (agent receives no tools)
- **Semantics**: Defines tool schemas available to this agent. Each tool schema must include `name`, `description`, and `parameters` fields matching OpenAI's function calling format.

#### `toolCallLimit`
- **Type**: Number (optional)
- **Default**: `10`
- **Semantics**: Maximum number of tool call iterations per phase (proposal, critique, or refinement). Each iteration counts toward the limit, including failed tool invocations.

### Tool Schema Format

Each tool schema must follow this structure:

```json
{
  "name": "tool_name",
  "description": "Human-readable description of what the tool does",
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
```

**Schema Requirements**:
- `name`: Unique tool identifier (string, required) - must match an available tool name
- `description`: Human-readable description explaining what the tool does (string, required)
- `parameters`: JSON Schema object defining tool parameters (object, required)
  - `type`: Must be `"object"`
  - `properties`: Object mapping parameter names to their schemas
  - `required`: Array of required parameter names (optional)

**Parameter Types**: Supported JSON Schema types include `string`, `number`, `boolean`, `array`, and `object`. Each parameter can include a `description` field to help the LLM understand its purpose.

### Tool Registry Behavior

When tools are configured for an agent:
1. The system validates that each tool name matches an available tool implementation
2. Unknown or invalid tool names result in warnings and are skipped
3. The agent receives a tool registry containing only the successfully registered tools
4. Tool schemas are automatically added to the agent's system prompt, making the agent aware of available tools

**Note**: Currently, only tools with available implementations can be used. If a tool name in the configuration doesn't match an available tool, a warning is issued and the tool is skipped.

## Available Tools

### Context Search (`context_search`)

Searches the debate history for contributions containing a specific term. This tool helps agents reference earlier discussions and maintain consistency across debate rounds.

#### Description

Search for a term in the debate history. Returns relevant contributions containing the search term.

#### Input Schema

```json
{
  "type": "object",
  "properties": {
    "term": {
      "type": "string",
      "description": "The search term to find in debate history"
    }
  },
  "required": ["term"]
}
```

**Parameters**:
- `term` (string, required): The search term to find in debate history. Case-insensitive substring matching is performed.

#### Output Schema

The tool returns a JSON string with the following structure:

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

**Output Fields**:
- `status`: Either `"success"` or `"error"`
- `result`: Object containing the tool results (on success) or error message (on error)
  - `matches`: Array of match objects, each containing:
    - `roundNumber`: The round number where the match was found (number)
    - `agentId`: The ID of the agent who made the contribution (string)
    - `agentRole`: The role of the agent who made the contribution (string)
    - `type`: The type of contribution (e.g., "proposal", "critique", "refinement") (string)
    - `contentSnippet`: A snippet of the matching content, truncated to 200 characters (string)

**Error Response**:
```json
{
  "status": "error",
  "result": "Error message describing what went wrong"
}
```

#### Behavior

- **Case-insensitive matching**: The search is performed case-insensitively
- **Substring matching**: Finds contributions containing the search term anywhere in the content
- **Comprehensive search**: Searches across all rounds and all contribution types (proposals, critiques, refinements)
- **Content truncation**: Content snippets are limited to 200 characters for readability
- **History source**: Uses `state.rounds` if available (takes precedence), otherwise falls back to `context.history`

#### Example Usage

An agent can use this tool to:
- Search for previous mentions of specific concepts (e.g., "caching", "authentication", "rate limiting")
- Reference earlier proposals or critiques in their own contributions
- Maintain consistency by checking what was discussed in previous rounds
- Find specific technical terms or design patterns mentioned earlier

**Example tool call**:
```json
{
  "name": "context_search",
  "arguments": "{\"term\": \"rate limiting\"}"
}
```

**Example response**:
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
        "contentSnippet": "I propose implementing a token bucket algorithm for rate limiting. This approach allows for burst traffic while maintaining overall rate limits..."
      },
      {
        "roundNumber": 2,
        "agentId": "agent-performance",
        "agentRole": "performance",
        "type": "critique",
        "contentSnippet": "The rate limiting approach should consider distributed scenarios. A single token bucket won't work across multiple servers..."
      }
    ]
  }
}
```

## Tool Execution

When an agent has tools configured:

1. **System Prompt Enhancement**: The agent's system prompt is automatically enhanced with tool information, making agents explicitly aware of available tools and their usage
2. **Tool Calling Loop**: During proposal, critique, or refinement phases:
   - Agent makes an LLM call with tool schemas available
   - LLM may request tool execution via function calling API
   - Tools are executed synchronously
   - Tool results are sent back to the LLM
   - Process continues until no tool calls or limit reached
3. **Metadata Storage**: Tool calls, results, and iteration counts are stored in contribution metadata for persistence and analysis

## Best Practices

1. **Start with Defaults**: Begin with default tool call limits (10) and adjust based on needs
2. **Monitor Tool Usage**: Use verbose mode (`--verbose`) to see tool execution in real-time
3. **Set Appropriate Limits**: Balance between allowing sufficient tool usage and preventing excessive iterations
4. **Review Tool Metadata**: Check contribution metadata in debate state files to understand tool usage patterns
5. **Error Handling**: Be aware that failed tool invocations count toward limits; ensure tools are properly configured
6. **Context Search**: Leverage Context Search tool to help agents reference earlier contributions and maintain consistency

## Future Enhancements

- **Custom Tool Implementations**: Support for agent-specific tools defined in configuration (requires tool implementation factories)
- **Additional Base Tools**: More built-in tools for common debate tasks
- **Tool Configuration Overrides**: Ability to customize tool behavior per agent
- **Async Tool Execution**: Support for asynchronous tool execution for long-running operations

