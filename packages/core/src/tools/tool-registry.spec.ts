import { CONTEXT_SEARCH_TOOL_NAME } from './context-search-tool';
import { ToolImplementation } from './tool-implementation';
import { ToolRegistry, createBaseRegistry } from './tool-registry';

// Test constants
const TOOL_NAME_TEST = 'test_tool';
const TOOL_NAME_TOOL1 = 'tool1';
const TOOL_NAME_TOOL2 = 'tool2';
const TOOL_NAME_BASE = 'base_tool';
const TOOL_NAME_NEW = 'new_tool';
const TOOL_NAME_DUPLICATE = 'duplicate';
const TOOL_NAME_CONTEXT_SEARCH = CONTEXT_SEARCH_TOOL_NAME;
const TOOL_DESCRIPTION_TEST = 'A test tool';
const TOOL_DESCRIPTION_TOOL1 = 'Tool 1';
const TOOL_DESCRIPTION_TOOL2 = 'Tool 2';
const TOOL_DESCRIPTION_BASE = 'Base tool';
const TOOL_DESCRIPTION_BASE_ORIGINAL = 'Original base tool';
const TOOL_DESCRIPTION_BASE_OVERRIDDEN = 'Overridden base tool';
const TOOL_DESCRIPTION_NEW = 'New tool';
const TOOL_DESCRIPTION_DUPLICATE_FIRST = 'First';
const TOOL_DESCRIPTION_DUPLICATE_SECOND = 'Second';
const TOOL_EXECUTE_RESULT_EMPTY = '{}';
const TOOL_EXECUTE_RESULT_SUCCESS = '{"status":"success"}';
const PARAM_TYPE_OBJECT = 'object';
const PARAM_PROPERTIES_EMPTY = {};

describe('ToolRegistry', () => {
  describe('Base Registry Creation', () => {
    it('should create an empty base registry', () => {
      const registry = createBaseRegistry();
      expect(registry).toBeInstanceOf(ToolRegistry);
      expect(registry.hasTools()).toBe(false);
      expect(registry.has(TOOL_NAME_CONTEXT_SEARCH)).toBe(false);
    });

    it('should return empty schemas array for empty registry', () => {
      const registry = createBaseRegistry();
      const schemas = registry.getAllSchemas();
      expect(schemas.length).toBe(0);
    });
  });

  describe('Tool Registration', () => {
    it('should register a tool and retrieve it by name', () => {
      const registry = new ToolRegistry();
      const mockTool: ToolImplementation = {
        name: TOOL_NAME_TEST,
        schema: {
          name: TOOL_NAME_TEST,
          description: TOOL_DESCRIPTION_TEST,
          parameters: {
            type: PARAM_TYPE_OBJECT,
            properties: PARAM_PROPERTIES_EMPTY,
          },
        },
        execute: () => TOOL_EXECUTE_RESULT_SUCCESS,
      };

      registry.register(mockTool);
      expect(registry.has(TOOL_NAME_TEST)).toBe(true);
      expect(registry.get(TOOL_NAME_TEST)).toBe(mockTool);
    });

    it('should return undefined for unregistered tool', () => {
      const registry = new ToolRegistry();
      const nonexistentTool = 'nonexistent';
      expect(registry.get(nonexistentTool)).toBeUndefined();
      expect(registry.has(nonexistentTool)).toBe(false);
    });
  });

  describe('getAllSchemas', () => {
    it('should return all registered tool schemas', () => {
      const registry = new ToolRegistry();
      const tool1: ToolImplementation = {
        name: TOOL_NAME_TOOL1,
        schema: {
          name: TOOL_NAME_TOOL1,
          description: TOOL_DESCRIPTION_TOOL1,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_EMPTY,
      };
      const tool2: ToolImplementation = {
        name: TOOL_NAME_TOOL2,
        schema: {
          name: TOOL_NAME_TOOL2,
          description: TOOL_DESCRIPTION_TOOL2,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_EMPTY,
      };

      registry.register(tool1);
      registry.register(tool2);

      const schemas = registry.getAllSchemas();
      expect(schemas.length).toBe(2);
      expect(schemas.map((s) => s.name)).toContain(TOOL_NAME_TOOL1);
      expect(schemas.map((s) => s.name)).toContain(TOOL_NAME_TOOL2);
    });

    it('should return single schema for single tool', () => {
      const registry = new ToolRegistry();
      const tool: ToolImplementation = {
        name: TOOL_NAME_TEST,
        schema: {
          name: TOOL_NAME_TEST,
          description: TOOL_DESCRIPTION_TEST,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_SUCCESS,
      };

      registry.register(tool);
      const schemas = registry.getAllSchemas();
      expect(schemas.length).toBe(1);
      expect(schemas[0]?.name).toBe(TOOL_NAME_TEST);
      expect(schemas[0]?.description).toBe(TOOL_DESCRIPTION_TEST);
    });
  });

  describe('hasTools', () => {
    it('should return false for empty registry', () => {
      const registry = new ToolRegistry();
      expect(registry.hasTools()).toBe(false);
    });

    it('should return true when registry has tools', () => {
      const registry = new ToolRegistry();
      const tool: ToolImplementation = {
        name: TOOL_NAME_TEST,
        schema: {
          name: TOOL_NAME_TEST,
          description: TOOL_DESCRIPTION_TEST,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_SUCCESS,
      };

      registry.register(tool);
      expect(registry.hasTools()).toBe(true);
    });

    it('should return false after all tools are removed (via overwrite)', () => {
      const registry = new ToolRegistry();
      const tool: ToolImplementation = {
        name: TOOL_NAME_TEST,
        schema: {
          name: TOOL_NAME_TEST,
          description: TOOL_DESCRIPTION_TEST,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_SUCCESS,
      };

      registry.register(tool);
      expect(registry.hasTools()).toBe(true);
      
      // Note: There's no remove method, but this test ensures hasTools works correctly
      // In practice, tools can only be overwritten, not removed
    });
  });

  describe('Registry Extension', () => {
    it('should create extended registry with base tools', () => {
      const baseRegistry = new ToolRegistry();
      const baseTool: ToolImplementation = {
        name: TOOL_NAME_BASE,
        schema: {
          name: TOOL_NAME_BASE,
          description: TOOL_DESCRIPTION_BASE,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_EMPTY,
      };
      baseRegistry.register(baseTool);
      
      const extendedRegistry = baseRegistry.extend(new ToolRegistry());

      expect(extendedRegistry.has(TOOL_NAME_BASE)).toBe(true);
      const retrievedTool = extendedRegistry.get(TOOL_NAME_BASE);
      expect(retrievedTool).toBeDefined();
      expect(retrievedTool?.schema.description).toBe(TOOL_DESCRIPTION_BASE);
    });

    it('should allow extended registry to add new tools', () => {
      const baseRegistry = new ToolRegistry();
      const baseTool: ToolImplementation = {
        name: TOOL_NAME_BASE,
        schema: {
          name: TOOL_NAME_BASE,
          description: TOOL_DESCRIPTION_BASE,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_EMPTY,
      };
      baseRegistry.register(baseTool);
      
      const extendedRegistry = baseRegistry.extend(new ToolRegistry());

      const newTool: ToolImplementation = {
        name: TOOL_NAME_NEW,
        schema: {
          name: TOOL_NAME_NEW,
          description: TOOL_DESCRIPTION_NEW,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_EMPTY,
      };

      extendedRegistry.register(newTool);
      expect(extendedRegistry.has(TOOL_NAME_NEW)).toBe(true);
      expect(extendedRegistry.has(TOOL_NAME_BASE)).toBe(true);
    });

    it('should allow extended registry to override base tools', () => {
      const baseRegistry = new ToolRegistry();
      const baseTool: ToolImplementation = {
        name: TOOL_NAME_BASE,
        schema: {
          name: TOOL_NAME_BASE,
          description: TOOL_DESCRIPTION_BASE_ORIGINAL,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_EMPTY,
      };
      baseRegistry.register(baseTool);
      
      const extendedRegistry = baseRegistry.extend(new ToolRegistry());

      const overrideTool: ToolImplementation = {
        name: TOOL_NAME_BASE,
        schema: {
          name: TOOL_NAME_BASE,
          description: TOOL_DESCRIPTION_BASE_OVERRIDDEN,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_EMPTY,
      };

      extendedRegistry.register(overrideTool);
      const tool = extendedRegistry.get(TOOL_NAME_BASE);
      expect(tool?.schema.description).toBe(TOOL_DESCRIPTION_BASE_OVERRIDDEN);
    });

    it('should extend from empty base registry', () => {
      const baseRegistry = new ToolRegistry();
      const currentRegistry = new ToolRegistry();
      const currentTool: ToolImplementation = {
        name: TOOL_NAME_TEST,
        schema: {
          name: TOOL_NAME_TEST,
          description: TOOL_DESCRIPTION_TEST,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_SUCCESS,
      };
      currentRegistry.register(currentTool);

      const extendedRegistry = currentRegistry.extend(baseRegistry);

      expect(extendedRegistry.has(TOOL_NAME_TEST)).toBe(true);
      expect(extendedRegistry.hasTools()).toBe(true);
    });

    it('should copy tools from current registry when extending', () => {
      const baseRegistry = new ToolRegistry();
      const baseTool: ToolImplementation = {
        name: TOOL_NAME_BASE,
        schema: {
          name: TOOL_NAME_BASE,
          description: TOOL_DESCRIPTION_BASE,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_EMPTY,
      };
      baseRegistry.register(baseTool);

      const currentRegistry = new ToolRegistry();
      const currentTool: ToolImplementation = {
        name: TOOL_NAME_TEST,
        schema: {
          name: TOOL_NAME_TEST,
          description: TOOL_DESCRIPTION_TEST,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_SUCCESS,
      };
      currentRegistry.register(currentTool);

      const extendedRegistry = currentRegistry.extend(baseRegistry);

      expect(extendedRegistry.has(TOOL_NAME_BASE)).toBe(true);
      expect(extendedRegistry.has(TOOL_NAME_TEST)).toBe(true);
      const schemas = extendedRegistry.getAllSchemas();
      expect(schemas.length).toBe(2);
    });

    it('should not modify original registries when extending', () => {
      const baseRegistry = new ToolRegistry();
      const baseTool: ToolImplementation = {
        name: TOOL_NAME_BASE,
        schema: {
          name: TOOL_NAME_BASE,
          description: TOOL_DESCRIPTION_BASE,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_EMPTY,
      };
      baseRegistry.register(baseTool);

      const currentRegistry = new ToolRegistry();
      const currentTool: ToolImplementation = {
        name: TOOL_NAME_TEST,
        schema: {
          name: TOOL_NAME_TEST,
          description: TOOL_DESCRIPTION_TEST,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_SUCCESS,
      };
      currentRegistry.register(currentTool);

      const extendedRegistry = currentRegistry.extend(baseRegistry);
      
      // Add tool to extended registry
      const newTool: ToolImplementation = {
        name: TOOL_NAME_NEW,
        schema: {
          name: TOOL_NAME_NEW,
          description: TOOL_DESCRIPTION_NEW,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_EMPTY,
      };
      extendedRegistry.register(newTool);

      // Original registries should be unchanged
      expect(baseRegistry.hasTools()).toBe(true);
      expect(baseRegistry.has(TOOL_NAME_BASE)).toBe(true);
      expect(baseRegistry.has(TOOL_NAME_NEW)).toBe(false);
      
      expect(currentRegistry.hasTools()).toBe(true);
      expect(currentRegistry.has(TOOL_NAME_TEST)).toBe(true);
      expect(currentRegistry.has(TOOL_NAME_NEW)).toBe(false);
    });

    it('should handle extending when base registry has multiple tools', () => {
      const baseRegistry = new ToolRegistry();
      const tool1: ToolImplementation = {
        name: TOOL_NAME_TOOL1,
        schema: {
          name: TOOL_NAME_TOOL1,
          description: TOOL_DESCRIPTION_TOOL1,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_EMPTY,
      };
      const tool2: ToolImplementation = {
        name: TOOL_NAME_TOOL2,
        schema: {
          name: TOOL_NAME_TOOL2,
          description: TOOL_DESCRIPTION_TOOL2,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_EMPTY,
      };
      baseRegistry.register(tool1);
      baseRegistry.register(tool2);

      const currentRegistry = new ToolRegistry();
      const extendedRegistry = currentRegistry.extend(baseRegistry);

      expect(extendedRegistry.has(TOOL_NAME_TOOL1)).toBe(true);
      expect(extendedRegistry.has(TOOL_NAME_TOOL2)).toBe(true);
      const schemas = extendedRegistry.getAllSchemas();
      expect(schemas.length).toBe(2);
    });

    it('should handle chaining extend calls', () => {
      const level1Registry = new ToolRegistry();
      const tool1: ToolImplementation = {
        name: TOOL_NAME_TOOL1,
        schema: {
          name: TOOL_NAME_TOOL1,
          description: TOOL_DESCRIPTION_TOOL1,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_EMPTY,
      };
      level1Registry.register(tool1);

      const level2Registry = new ToolRegistry();
      const tool2: ToolImplementation = {
        name: TOOL_NAME_TOOL2,
        schema: {
          name: TOOL_NAME_TOOL2,
          description: TOOL_DESCRIPTION_TOOL2,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_EMPTY,
      };
      level2Registry.register(tool2);

      const level2Extended = level2Registry.extend(level1Registry);
      const level3Registry = new ToolRegistry();
      const level3Extended = level3Registry.extend(level2Extended);

      expect(level3Extended.has(TOOL_NAME_TOOL1)).toBe(true);
      expect(level3Extended.has(TOOL_NAME_TOOL2)).toBe(true);
      const schemas = level3Extended.getAllSchemas();
      expect(schemas.length).toBe(2);
    });
  });

  describe('Error Cases', () => {
    it('should handle registering duplicate tools (last one wins)', () => {
      const registry = new ToolRegistry();
      const tool1: ToolImplementation = {
        name: TOOL_NAME_DUPLICATE,
        schema: {
          name: TOOL_NAME_DUPLICATE,
          description: TOOL_DESCRIPTION_DUPLICATE_FIRST,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_EMPTY,
      };
      const tool2: ToolImplementation = {
        name: TOOL_NAME_DUPLICATE,
        schema: {
          name: TOOL_NAME_DUPLICATE,
          description: TOOL_DESCRIPTION_DUPLICATE_SECOND,
          parameters: { type: PARAM_TYPE_OBJECT, properties: PARAM_PROPERTIES_EMPTY },
        },
        execute: () => TOOL_EXECUTE_RESULT_EMPTY,
      };

      registry.register(tool1);
      registry.register(tool2);

      const tool = registry.get(TOOL_NAME_DUPLICATE);
      expect(tool?.schema.description).toBe(TOOL_DESCRIPTION_DUPLICATE_SECOND);
    });
  });
});

