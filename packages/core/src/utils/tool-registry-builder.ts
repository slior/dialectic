import { CONTEXT_SEARCH_TOOL_NAME, ContextSearchTool } from '../tools/context-search-tool';
import { FILE_READ_TOOL_NAME, FileReadTool } from '../tools/file-read-tool';
import { LIST_FILES_TOOL_NAME, ListFilesTool } from '../tools/list-files-tool';
import { ToolImplementation } from '../tools/tool-implementation';
import { ToolRegistry } from '../tools/tool-registry';
import { AgentConfig } from '../types/agent.types';

import { logWarning } from './console';

/**
 * Map of available tool implementations.
 * Tools are registered here with their implementation factories.
 * Tool schemas are defined in the tool classes themselves.
 */
const AVAILABLE_TOOLS: Record<string, () => ToolImplementation> = {
  [CONTEXT_SEARCH_TOOL_NAME]: () => new ContextSearchTool(),
  [FILE_READ_TOOL_NAME]: () => new FileReadTool(),
  [LIST_FILES_TOOL_NAME]: () => new ListFilesTool(),
};

/**
 * Builds a tool registry for an agent based on configuration.
 * 
 * Each agent gets its own independent tool registry. Tools are registered based on
 * the agent's configuration. Tool implementations are resolved from AVAILABLE_TOOLS based on
 * the tool name. Tool schemas come from the tool implementations themselves.
 * If a tool name in the configuration is not recognized or is empty,
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

    const createImplementation = AVAILABLE_TOOLS[toolName];

    if (!createImplementation) {
      logWarning(`Unknown tool "${toolName}" configured for agent "${agentConfig.id}". Skipping.`);
      continue;
    }

    const toolImplementation = createImplementation();
    
    // TODO: Support tool configuration overrides from toolConfig if needed
    // For now, use default implementation
    
    registry.register(toolImplementation);
  }

  return registry;
}

