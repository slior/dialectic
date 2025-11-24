import { buildToolRegistry } from '../src/utils/tool-registry-builder';
import { AgentConfig, AGENT_ROLES, LLM_PROVIDERS } from '../src/types/agent.types';
import { ToolRegistry } from '../src/tools/tool-registry';

describe('buildToolRegistry', () => {
  let agentConfig: AgentConfig;

  beforeEach(() => {
    agentConfig = {
      id: 'test-agent',
      name: 'Test Agent',
      role: AGENT_ROLES.ARCHITECT,
      model: 'gpt-4',
      provider: LLM_PROVIDERS.OPENAI,
      temperature: 0.5,
    };
  });

  describe('Empty Registry', () => {
    it('should return empty registry when agent has no tools configured', () => {
      const registry = buildToolRegistry(agentConfig);
      
      expect(registry).toBeInstanceOf(ToolRegistry);
      expect(registry.hasTools()).toBe(false);
      expect(registry.getAllSchemas().length).toBe(0);
    });

    it('should return empty registry when agent.tools is undefined', () => {
      delete agentConfig.tools;
      const registry = buildToolRegistry(agentConfig);
      
      expect(registry.hasTools()).toBe(false);
      expect(registry.getAllSchemas().length).toBe(0);
    });

    it('should return empty registry when agent.tools is empty array', () => {
      agentConfig.tools = [];
      const registry = buildToolRegistry(agentConfig);
      
      expect(registry.hasTools()).toBe(false);
      expect(registry.getAllSchemas().length).toBe(0);
    });
  });

  describe('Valid Tools', () => {
    it('should register context_search tool when configured in agent.tools', () => {
      agentConfig.tools = [
        {
          name: 'context_search',
        },
      ];

      const registry = buildToolRegistry(agentConfig);
      
      expect(registry.hasTools()).toBe(true);
      expect(registry.has('context_search')).toBe(true);
      const schemas = registry.getAllSchemas();
      expect(schemas.length).toBe(1);
      expect(schemas[0]?.name).toBe('context_search');
    });

    it('should register multiple valid tools', () => {
      agentConfig.tools = [
        {
          name: 'context_search',
        },
        {
          name: 'context_search',
        },
      ];

      const registry = buildToolRegistry(agentConfig);
      
      expect(registry.hasTools()).toBe(true);
      expect(registry.has('context_search')).toBe(true);
      const schemas = registry.getAllSchemas();
      expect(schemas.length).toBe(1); // Duplicate name overwrites
    });

    it('should return registry with correct schemas for registered tools', () => {
      agentConfig.tools = [
        {
          name: 'context_search',
        },
      ];

      const registry = buildToolRegistry(agentConfig);
      const schemas = registry.getAllSchemas();
      
      expect(schemas.length).toBe(1);
      expect(schemas[0]?.name).toBe('context_search');
      expect(schemas[0]?.description).toContain('Search');
      expect(schemas[0]?.parameters.properties.term).toBeDefined();
    });
  });

  describe('Unrecognized Tools', () => {
    let stderrSpy: jest.SpyInstance;

    beforeEach(() => {
      stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      stderrSpy.mockRestore();
    });

    it('should warn and skip tool with empty string name', () => {
      agentConfig.tools = [
        {
          name: '',
        },
      ];

      const registry = buildToolRegistry(agentConfig);
      
      expect(registry.hasTools()).toBe(false);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Invalid tool name (empty string) configured for agent "test-agent". Skipping.\n')
      );
    });

    it('should warn and skip unrecognized tool name', () => {
      agentConfig.tools = [
        {
          name: 'unknown_tool',
        },
      ];

      const registry = buildToolRegistry(agentConfig);
      
      expect(registry.hasTools()).toBe(false);
      expect(registry.has('unknown_tool')).toBe(false);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Unknown tool "unknown_tool" configured for agent "test-agent". Skipping.\n')
      );
    });

    it('should warn and skip multiple unrecognized tools', () => {
      agentConfig.tools = [
        {
          name: 'unknown_tool_1',
        },
        {
          name: 'unknown_tool_2',
        },
      ];

      const registry = buildToolRegistry(agentConfig);
      
      expect(registry.hasTools()).toBe(false);
      expect(stderrSpy).toHaveBeenCalledTimes(2);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Unknown tool "unknown_tool_1" configured for agent "test-agent". Skipping.\n')
      );
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Unknown tool "unknown_tool_2" configured for agent "test-agent". Skipping.\n')
      );
    });

    it('should register valid tools and skip unrecognized ones', () => {
      agentConfig.tools = [
        {
          name: 'context_search',
        },
        {
          name: 'unknown_tool',
        },
      ];

      const registry = buildToolRegistry(agentConfig);
      
      expect(registry.hasTools()).toBe(true);
      expect(registry.has('context_search')).toBe(true);
      expect(registry.has('unknown_tool')).toBe(false);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Unknown tool "unknown_tool" configured for agent "test-agent". Skipping.\n')
      );
    });
  });

  describe('Independent Registries', () => {
    it('should create independent registries for different agents', () => {
      const agentConfig1: AgentConfig = {
        ...agentConfig,
        id: 'agent-1',
        tools: [
          {
            name: 'context_search',
          },
        ],
      };

      const agentConfig2: AgentConfig = {
        ...agentConfig,
        id: 'agent-2',
        tools: [], // No tools
      };

      const registry1 = buildToolRegistry(agentConfig1);
      const registry2 = buildToolRegistry(agentConfig2);
      
      expect(registry1.hasTools()).toBe(true);
      expect(registry2.hasTools()).toBe(false);
      expect(registry1.has('context_search')).toBe(true);
      expect(registry2.has('context_search')).toBe(false);
    });
  });
});

