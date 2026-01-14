import { ContextSearchTool } from '../tools/context-search-tool';
import { FileReadTool } from '../tools/file-read-tool';
import { ListFilesTool } from '../tools/list-files-tool';
import { ToolImplementation } from '../tools/tool-implementation';
import { ToolRegistry } from '../tools/tool-registry';
import { AgentConfig } from '../types/agent.types';
import { ToolSchema } from '../types/tool.types';

import { logWarning } from './console';

/**
 * Tool definition containing schema and implementation factory.
 */
type ToolDefinition = {
  schema: ToolSchema;
  createImplementation: () => ToolImplementation;
};

/**
 * Map of available tool definitions.
 * Tools are registered here with their schemas and implementation factories.
 */
const AVAILABLE_TOOLS: Record<string, ToolDefinition> = {
  context_search: {
    schema: {
      name: 'context_search',
      description: 'Search for a term in the debate history. Returns relevant contributions containing the search term.',
      parameters: {
        type: 'object',
        properties: {
          term: {
            type: 'string',
            description: 'The search term to find in debate history',
          },
        },
        required: ['term'],
      },
    },
    createImplementation: () => new ContextSearchTool(),
  },
  file_read: {
    schema: {
      name: 'file_read',
      description: 'Read the contents of a text file. Returns the file content as a string, or an error message if the file cannot be read.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The absolute path to the file to read',
          },
        },
        required: ['path'],
      },
    },
    createImplementation: () => new FileReadTool(),
  },
  list_files: {
    schema: {
      name: 'list_files',
      description: 'List all files and directories in a given directory. Returns an array of entries with their absolute paths and types (file or directory).',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The absolute path to the directory to list',
          },
        },
        required: ['path'],
      },
    },
    createImplementation: () => new ListFilesTool(),
  },
};

/**
 * Builds a tool registry for an agent based on configuration.
 * 
 * Each agent gets its own independent tool registry. Tools are registered based on
 * the agent's configuration. Tool schemas are resolved from AVAILABLE_TOOLS based on
 * the tool name. If a tool name in the configuration is not recognized or is empty,
 * a warning is issued and the tool is skipped.
 * 
 * @param agentConfig - Agent configuration containing optional tools.
 * @returns Tool registry for the agent (empty if no tools configured).
 */
export function buildToolRegistry(agentConfig: AgentConfig): ToolRegistry {
  const registry = new ToolRegistry();

  // If agent has no tools configured, return empty registry
  if (!agentConfig.tools || agentConfig.tools.length === 0) {
    return registry;
  }

  // Register tools from agent configuration
  for (const toolConfig of agentConfig.tools) {
    const toolName = toolConfig.name;

    if (!toolName || toolName.trim() === '') {
      logWarning(`Invalid tool name (empty string) configured for agent "${agentConfig.id}". Skipping.`);
      continue;
    }

    const toolDefinition = AVAILABLE_TOOLS[toolName];

    if (!toolDefinition) {
      logWarning(`Unknown tool "${toolName}" configured for agent "${agentConfig.id}". Skipping.`);
      continue;
    }

    const toolImplementation = toolDefinition.createImplementation();
    
    // TODO: Support tool configuration overrides from toolConfig if needed
    // For now, use default implementation
    
    registry.register(toolImplementation);
  }

  return registry;
}

