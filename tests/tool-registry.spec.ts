import { ToolRegistry } from '../src/tools/tool-registry';
import { ToolImplementation } from '../src/tools/tool-implementation';
import { createBaseRegistry } from '../src/tools/tool-registry';

describe('ToolRegistry', () => {
  describe('Base Registry Creation', () => {
    it('should create a base registry with Context Search tool', () => {
      const registry = createBaseRegistry();
      expect(registry).toBeInstanceOf(ToolRegistry);
      expect(registry.has('context_search')).toBe(true);
    });

    it('should return Context Search tool schema', () => {
      const registry = createBaseRegistry();
      const schemas = registry.getAllSchemas();
      expect(schemas.length).toBeGreaterThan(0);
      const contextSearchSchema = schemas.find((s) => s.name === 'context_search');
      expect(contextSearchSchema).toBeDefined();
      expect(contextSearchSchema?.description).toContain('Search');
    });
  });

  describe('Tool Registration', () => {
    it('should register a tool and retrieve it by name', () => {
      const registry = new ToolRegistry();
      const mockTool: ToolImplementation = {
        name: 'test_tool',
        schema: {
          name: 'test_tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
        execute: () => '{"status":"success"}',
      };

      registry.register(mockTool);
      expect(registry.has('test_tool')).toBe(true);
      expect(registry.get('test_tool')).toBe(mockTool);
    });

    it('should return undefined for unregistered tool', () => {
      const registry = new ToolRegistry();
      expect(registry.get('nonexistent')).toBeUndefined();
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('getAllSchemas', () => {
    it('should return all registered tool schemas', () => {
      const registry = new ToolRegistry();
      const tool1: ToolImplementation = {
        name: 'tool1',
        schema: {
          name: 'tool1',
          description: 'Tool 1',
          parameters: { type: 'object', properties: {} },
        },
        execute: () => '{}',
      };
      const tool2: ToolImplementation = {
        name: 'tool2',
        schema: {
          name: 'tool2',
          description: 'Tool 2',
          parameters: { type: 'object', properties: {} },
        },
        execute: () => '{}',
      };

      registry.register(tool1);
      registry.register(tool2);

      const schemas = registry.getAllSchemas();
      expect(schemas.length).toBe(2);
      expect(schemas.map((s) => s.name)).toContain('tool1');
      expect(schemas.map((s) => s.name)).toContain('tool2');
    });
  });

  describe('Registry Extension', () => {
    it('should create extended registry with base tools', () => {
      const baseRegistry = createBaseRegistry();
      const extendedRegistry = baseRegistry.extend(new ToolRegistry());

      expect(extendedRegistry.has('context_search')).toBe(true);
    });

    it('should allow extended registry to add new tools', () => {
      const baseRegistry = createBaseRegistry();
      const extendedRegistry = baseRegistry.extend(new ToolRegistry());

      const newTool: ToolImplementation = {
        name: 'new_tool',
        schema: {
          name: 'new_tool',
          description: 'New tool',
          parameters: { type: 'object', properties: {} },
        },
        execute: () => '{}',
      };

      extendedRegistry.register(newTool);
      expect(extendedRegistry.has('new_tool')).toBe(true);
      expect(extendedRegistry.has('context_search')).toBe(true);
    });

    it('should allow extended registry to override base tools', () => {
      const baseRegistry = createBaseRegistry();
      const extendedRegistry = baseRegistry.extend(new ToolRegistry());

      const overrideTool: ToolImplementation = {
        name: 'context_search',
        schema: {
          name: 'context_search',
          description: 'Overridden context search',
          parameters: { type: 'object', properties: {} },
        },
        execute: () => '{}',
      };

      extendedRegistry.register(overrideTool);
      const tool = extendedRegistry.get('context_search');
      expect(tool?.schema.description).toBe('Overridden context search');
    });
  });

  describe('Error Cases', () => {
    it('should handle registering duplicate tools (last one wins)', () => {
      const registry = new ToolRegistry();
      const tool1: ToolImplementation = {
        name: 'duplicate',
        schema: {
          name: 'duplicate',
          description: 'First',
          parameters: { type: 'object', properties: {} },
        },
        execute: () => '{}',
      };
      const tool2: ToolImplementation = {
        name: 'duplicate',
        schema: {
          name: 'duplicate',
          description: 'Second',
          parameters: { type: 'object', properties: {} },
        },
        execute: () => '{}',
      };

      registry.register(tool1);
      registry.register(tool2);

      const tool = registry.get('duplicate');
      expect(tool?.schema.description).toBe('Second');
    });
  });
});

