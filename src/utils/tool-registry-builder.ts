import { AgentConfig } from '../types/agent.types';
import { ToolRegistry } from '../tools/tool-registry';
import { DebateContext } from '../types/debate.types';

/**
 * Builds a tool registry for an agent based on configuration.
 * 
 * If the agent has no tools configured, returns the base registry.
 * If the agent has tools configured, creates an extended registry with agent-specific tools.
 * 
 * Note: Currently, only base registry tools are supported. Agent-specific tools from config
 * require tool implementation factories (future enhancement).
 * 
 * @param agentConfig - Agent configuration containing optional tools.
 * @param baseRegistry - Base registry with common tools (e.g., Context Search).
 * @param context - Optional debate context (currently unused, reserved for future use).
 * @returns Tool registry for the agent (base or extended).
 */
export function buildToolRegistry(
  agentConfig: AgentConfig,
  baseRegistry: ToolRegistry,
  _context?: DebateContext
): ToolRegistry {
  // If agent has no tools in config, return base registry
  if (!agentConfig.tools || agentConfig.tools.length === 0) {
    return baseRegistry;
  }

  // If agent has tools, create extended registry
  // For now, only base registry tools are supported
  // Agent-specific tools from config require implementation factory (future enhancement)
  const extendedRegistry = new ToolRegistry().extend(baseRegistry);
  
  // TODO: When tool implementation factory is available, register agent-specific tools here
  // for (const toolSchema of agentConfig.tools) {
  //   const toolImplementation = createToolFromSchema(toolSchema);
  //   extendedRegistry.register(toolImplementation);
  // }
  
  return extendedRegistry;
}

