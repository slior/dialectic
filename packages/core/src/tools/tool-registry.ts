import { ToolImplementation } from './tool-implementation';
import { ToolSchema } from '../types/tool.types';

/**
 * Registry for managing tool implementations.
 * Supports extension from other registries for building agent-specific tool sets.
 */
export class ToolRegistry {
  private tools: Map<string, ToolImplementation> = new Map();

  /**
   * Registers a tool in the registry.
   * If a tool with the same name already exists, it will be overwritten.
   * 
   * @param tool - The tool implementation to register.
   */
  register(tool: ToolImplementation): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Retrieves a tool by name.
   * 
   * @param name - The name of the tool to retrieve.
   * @returns The tool implementation, or undefined if not found.
   */
  get(name: string): ToolImplementation | undefined {
    return this.tools.get(name);
  }

  /**
   * Checks if a tool exists in the registry.
   * 
   * @param name - The name of the tool to check.
   * @returns True if the tool exists, false otherwise.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Returns all tool schemas from registered tools.
   * 
   * @returns Array of tool schemas.
   */
  getAllSchemas(): ToolSchema[] {
    return Array.from(this.tools.values()).map((tool) => tool.schema);
  }

  hasTools(): boolean {
    return this.tools.size > 0;
  }

  /**
   * Creates an extended registry that inherits from a base registry.
   * The extended registry starts with all tools from the base registry,
   * and can add or override tools.
   * 
   * @param baseRegistry - The base registry to extend from.
   * @returns A new ToolRegistry instance with base tools registered.
   */
  extend(baseRegistry: ToolRegistry): ToolRegistry {
    const extended = new ToolRegistry();
    
    // Copy all tools from base registry
    const baseSchemas = baseRegistry.getAllSchemas();
    for (const schema of baseSchemas) {
      const tool = baseRegistry.get(schema.name);
      if (tool) {
        extended.register(tool);
      }
    }
    
    // Copy any tools already in this registry (for chaining)
    for (const [, tool] of this.tools) {
      extended.register(tool);
    }
    
    return extended;
  }
}

/**
 * Creates an empty base tool registry.
 * Tools are now configured per-agent via agent configuration.
 * 
 * @returns An empty ToolRegistry instance.
 */
export function createBaseRegistry(): ToolRegistry {
  return new ToolRegistry();
}

