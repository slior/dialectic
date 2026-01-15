# Tools

Tools allow agents to interact with external functionality during debate phases (proposal, critique, and refinement). Agents can call tools to gather information, search debate history, or perform other actions that enhance their contributions.

## Tool Configuration

Tools are configured per agent in the debate configuration file using the `tools` field in `AgentConfig`. Each tool is specified by name only; tool schemas are automatically resolved from the tool implementations.

### Basic Configuration

To enable tools for an agent, add a `tools` array to the agent's configuration with tool names:

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
      "name": "context_search"
    },
    {
      "name": "list_files"
    },
    {
      "name": "file_read"
    }
  ],
  "toolCallLimit": 10
}
```

**How It Works**: The system looks up tool implementations by name and automatically retrieves their schemas (description, parameters) from the tool implementation classes. You don't need to specify schemas in the configuration.

### Configuration Fields

#### `tools`
- **Type**: Array of `ToolConfig` objects (optional)
- **Default**: Empty array (agent receives no tools)
- **Semantics**: Defines which tools are available to this agent. Each tool is specified by name only; tool schemas (description, parameters) are automatically resolved from the tool implementations.

#### `toolCallLimit`
- **Type**: Number (optional)
- **Default**: `10`
- **Semantics**: Maximum number of tool call iterations per phase (proposal, critique, or refinement). Each iteration counts toward the limit, including failed tool invocations.

### Tool Configuration Format

Each tool configuration is simple - just specify the tool name:

```json
{
  "name": "tool_name"
}
```

**Configuration Requirements**:
- `name`: Unique tool identifier (string, required) - must match an available tool name from the tool registry

**How Tool Schemas Work**:
- Tool schemas (description, parameters) are defined in the tool implementation classes (e.g., `ListFilesTool.schema`, `FileReadTool.schema`)
- The system automatically retrieves schemas from tool implementations when building the tool registry
- You don't need to specify descriptions or parameters in the configuration
- Tool schemas follow OpenAI's function calling format internally, but this is handled automatically

### Tool Registry Behavior

When tools are configured for an agent:
1. The system looks up tool implementations by name from the available tools registry
2. Tool schemas (description, parameters) are automatically retrieved from the tool implementations
3. Unknown or invalid tool names result in warnings and are skipped
4. The agent receives a tool registry containing only the successfully registered tools
5. Tool schemas are automatically added to the agent's system prompt, making the agent aware of available tools

**Note**: Currently, only tools with available implementations can be used. If a tool name in the configuration doesn't match an available tool, a warning is issued and the tool is skipped. Tool schemas are defined in the tool implementation classes, not in the configuration file.

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
  "error": "Error message describing what went wrong"
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

### File Read (`file_read`)

Reads the contents of a text file and returns it as a string. This tool allows agents to access file system content during debates, enabling them to reference documentation, configuration files, or other text-based resources.

#### Description

Read the contents of a text file. Returns the file content as a string, or an error message if the file cannot be read.

#### Input Schema

```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "The absolute path to the file to read"
    }
  },
  "required": ["path"]
}
```

**Parameters**:
- `path` (string, required): The absolute path to the file to read. Relative paths are resolved to absolute paths.

#### Output Schema

The tool returns a JSON string with the following structure:

**Success Response**:
```json
{
  "status": "success",
  "result": {
    "content": "File contents as a string..."
  }
}
```

**Error Response**:
```json
{
  "status": "error",
  "error": "Error message describing what went wrong"
}
```

**Output Fields**:
- `status`: Either `"success"` or `"error"`
- `result`: Object containing the file content (on success)
  - `content`: The file contents as a UTF-8 string (string)
- `error`: Error message describing what went wrong (on error)

#### Security

**Context Directory Restriction**: All file access via `file_read` is restricted to the context directory specified by the `--context` CLI option (defaults to current working directory). This security boundary prevents path traversal attacks and ensures agents can only access files within the intended directory.

- **Path validation**: Before reading a file, the tool validates that the resolved path is within the context directory
- **Path traversal prevention**: Paths containing `..` sequences or pointing outside the context directory are rejected
- **Symlink resolution**: Symlinks are resolved to their real paths before validation to prevent symlink-based attacks
- **Error message**: If a path is outside the context directory, the tool returns: `"Access denied: path is outside the context directory"`

#### Behavior

- **File encoding**: Files are read as UTF-8 text
- **Path resolution**: Relative paths are resolved relative to the context directory, then validated
- **File validation**: The tool checks that the path exists, is within the context directory, and is a file (not a directory)
- **Error handling**: Returns descriptive error messages for common file system errors:
  - File not found (`ENOENT`)
  - Permission denied (`EACCES`, `EPERM`)
  - Path is a directory (not a file)
  - Invalid arguments (missing or invalid path parameter)

#### Example Usage

An agent can use this tool to:
- Read configuration files referenced in the problem statement
- Access documentation files that provide context for the design problem
- Read example code or templates that inform the solution
- Access any text-based resource needed during the debate

**Example tool call**:
```json
{
  "name": "file_read",
  "arguments": "{\"path\": \"/path/to/config.json\"}"
}
```

**Example success response**:
```json
{
  "status": "success",
  "result": {
    "content": "{\n  \"database\": {\n    \"host\": \"localhost\",\n    \"port\": 5432\n  }\n}"
  }
}
```

**Example error response**:
```json
{
  "status": "error",
  "error": "File not found: /path/to/nonexistent.txt"
}
```

### List Files (`list_files`)

Lists all files and directories in a given directory. Returns an array of entries with their absolute paths and types (file or directory). This tool helps agents explore directory structures and discover available resources.

#### Description

List all files and directories in a given directory. Returns an array of entries with their absolute paths and types (file or directory).

#### Input Schema

```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "The absolute path to the directory to list"
    }
  },
  "required": ["path"]
}
```

**Parameters**:
- `path` (string, required): The absolute path to the directory to list. Relative paths are resolved to absolute paths.

#### Output Schema

The tool returns a JSON string with the following structure:

**Success Response**:
```json
{
  "status": "success",
  "result": {
    "entries": [
      {
        "path": "/absolute/path/to/file.txt",
        "type": "file"
      },
      {
        "path": "/absolute/path/to/subdirectory",
        "type": "directory"
      }
    ]
  }
}
```

**Error Response**:
```json
{
  "status": "error",
  "error": "Error message describing what went wrong"
}
```

**Output Fields**:
- `status`: Either `"success"` or `"error"`
- `result`: Object containing the directory listing (on success)
  - `entries`: Array of file system entry objects, each containing:
    - `path`: The absolute path to the entry (string)
    - `type`: Either `"file"` or `"directory"` (string)
- `error`: Error message describing what went wrong (on error)

#### Security

**Context Directory Restriction**: All directory access via `list_files` is restricted to the context directory specified by the `--context` CLI option (defaults to current working directory). This security boundary prevents path traversal attacks and ensures agents can only list files within the intended directory.

- **Path validation**: Before listing a directory, the tool validates that the resolved path is within the context directory
- **Path traversal prevention**: Paths containing `..` sequences or pointing outside the context directory are rejected
- **Symlink resolution**: Symlinks are resolved to their real paths before validation to prevent symlink-based attacks
- **Entry filtering**: Entries outside the context directory are automatically filtered out from the results
- **Error message**: If a path is outside the context directory, the tool returns: `"Access denied: path is outside the context directory"`

#### Behavior

- **Path resolution**: Relative paths are resolved relative to the context directory, then validated
- **Directory validation**: The tool checks that the path exists, is within the context directory, and is a directory (not a file)
- **Absolute paths**: All returned paths are absolute paths, making them suitable for use with other tools like `file_read`
- **Entry types**: Each entry includes a `type` field indicating whether it's a file or directory
- **Entry filtering**: Only entries within the context directory are returned in the results
- **Empty directories**: Returns an empty array for directories with no contents
- **Error handling**: Returns descriptive error messages for common file system errors:
  - Directory not found (`ENOENT`)
  - Permission denied (`EACCES`, `EPERM`)
  - Path is a file (not a directory)
  - Invalid arguments (missing or invalid path parameter)

#### Example Usage

An agent can use this tool to:
- Explore directory structures to understand project layouts
- Discover available configuration files or documentation
- Find relevant source files or examples
- Navigate file system hierarchies during problem analysis

**Example tool call**:
```json
{
  "name": "list_files",
  "arguments": "{\"path\": \"/path/to/project\"}"
}
```

**Example success response**:
```json
{
  "status": "success",
  "result": {
    "entries": [
      {
        "path": "/path/to/project/README.md",
        "type": "file"
      },
      {
        "path": "/path/to/project/config",
        "type": "directory"
      },
      {
        "path": "/path/to/project/src",
        "type": "directory"
      },
      {
        "path": "/path/to/project/package.json",
        "type": "file"
      }
    ]
  }
}
```

**Example error response**:
```json
{
  "status": "error",
  "error": "Directory not found: /path/to/nonexistent"
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
7. **File System Tools**: Use `file_read` and `list_files` to access file system resources when needed for problem context
8. **Path Safety**: Always use absolute paths when possible; relative paths are resolved relative to the current working directory

## Future Enhancements

- **Custom Tool Implementations**: Support for agent-specific tools defined in configuration (requires tool implementation factories)
- **Additional Base Tools**: More built-in tools for common debate tasks
- **Tool Configuration Overrides**: Ability to customize tool behavior per agent
- **Async Tool Execution**: Support for asynchronous tool execution for long-running operations

