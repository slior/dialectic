import { buildToolRegistry, AgentConfig, AGENT_ROLES, LLM_PROVIDERS, ToolRegistry } from 'dialectic-core';

// Test constants
const AGENT_ID_TEST = 'test-agent';
const AGENT_ID_1 = 'agent-1';
const AGENT_ID_2 = 'agent-2';
const AGENT_NAME_TEST = 'Test Agent';
const TOOL_NAME_CONTEXT_SEARCH = 'context_search';
const TOOL_NAME_UNKNOWN = 'unknown_tool';
const TOOL_NAME_UNKNOWN_1 = 'unknown_tool_1';
const TOOL_NAME_UNKNOWN_2 = 'unknown_tool_2';
const ERROR_MESSAGE_INVALID_TOOL_NAME = 'Invalid tool name (empty string) configured for agent';
const ERROR_MESSAGE_UNKNOWN_TOOL_PREFIX = 'Unknown tool';
const ERROR_MESSAGE_SKIPPING_SUFFIX = 'Skipping.';

describe('buildToolRegistry', () => {
  let agentConfig: AgentConfig;

  beforeEach(() => {
    agentConfig = {
      id: AGENT_ID_TEST,
      name: AGENT_NAME_TEST,
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
          name: TOOL_NAME_CONTEXT_SEARCH,
        },
      ];

      const registry = buildToolRegistry(agentConfig);
      
      expect(registry.hasTools()).toBe(true);
      expect(registry.has(TOOL_NAME_CONTEXT_SEARCH)).toBe(true);
      const schemas = registry.getAllSchemas();
      expect(schemas.length).toBe(1);
      expect(schemas[0]?.name).toBe(TOOL_NAME_CONTEXT_SEARCH);
    });

    it('should register multiple valid tools', () => {
      agentConfig.tools = [
        {
          name: TOOL_NAME_CONTEXT_SEARCH,
        },
        {
          name: TOOL_NAME_CONTEXT_SEARCH,
        },
      ];

      const registry = buildToolRegistry(agentConfig);
      
      expect(registry.hasTools()).toBe(true);
      expect(registry.has(TOOL_NAME_CONTEXT_SEARCH)).toBe(true);
      const schemas = registry.getAllSchemas();
      expect(schemas.length).toBe(1); // Duplicate name overwrites
    });

    it('should return registry with correct schemas for registered tools', () => {
      agentConfig.tools = [
        {
          name: TOOL_NAME_CONTEXT_SEARCH,
        },
      ];

      const registry = buildToolRegistry(agentConfig);
      const schemas = registry.getAllSchemas();
      
      expect(schemas.length).toBe(1);
      expect(schemas[0]?.name).toBe(TOOL_NAME_CONTEXT_SEARCH);
      expect(schemas[0]?.description).toContain('Search');
      expect(schemas[0]?.parameters.properties.term).toBeDefined();
    });
  });

  describe('Unrecognized Tools', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('should warn and skip tool with empty string name', () => {
      const emptyToolName = '';
      agentConfig.tools = [
        {
          name: emptyToolName,
        },
      ];

      const registry = buildToolRegistry(agentConfig);
      
      expect(registry.hasTools()).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${ERROR_MESSAGE_INVALID_TOOL_NAME} "${AGENT_ID_TEST}". ${ERROR_MESSAGE_SKIPPING_SUFFIX}`)
      );
    });

    it('should warn and skip unrecognized tool name', () => {
      agentConfig.tools = [
        {
          name: TOOL_NAME_UNKNOWN,
        },
      ];

      const registry = buildToolRegistry(agentConfig);
      
      expect(registry.hasTools()).toBe(false);
      expect(registry.has(TOOL_NAME_UNKNOWN)).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${ERROR_MESSAGE_UNKNOWN_TOOL_PREFIX} "${TOOL_NAME_UNKNOWN}" configured for agent "${AGENT_ID_TEST}". ${ERROR_MESSAGE_SKIPPING_SUFFIX}`)
      );
    });

    it('should warn and skip multiple unrecognized tools', () => {
      agentConfig.tools = [
        {
          name: TOOL_NAME_UNKNOWN_1,
        },
        {
          name: TOOL_NAME_UNKNOWN_2,
        },
      ];

      const registry = buildToolRegistry(agentConfig);
      
      expect(registry.hasTools()).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${ERROR_MESSAGE_UNKNOWN_TOOL_PREFIX} "${TOOL_NAME_UNKNOWN_1}" configured for agent "${AGENT_ID_TEST}". ${ERROR_MESSAGE_SKIPPING_SUFFIX}`)
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${ERROR_MESSAGE_UNKNOWN_TOOL_PREFIX} "${TOOL_NAME_UNKNOWN_2}" configured for agent "${AGENT_ID_TEST}". ${ERROR_MESSAGE_SKIPPING_SUFFIX}`)
      );
    });

    it('should register valid tools and skip unrecognized ones', () => {
      agentConfig.tools = [
        {
          name: TOOL_NAME_CONTEXT_SEARCH,
        },
        {
          name: TOOL_NAME_UNKNOWN,
        },
      ];

      const registry = buildToolRegistry(agentConfig);
      
      expect(registry.hasTools()).toBe(true);
      expect(registry.has(TOOL_NAME_CONTEXT_SEARCH)).toBe(true);
      expect(registry.has(TOOL_NAME_UNKNOWN)).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${ERROR_MESSAGE_UNKNOWN_TOOL_PREFIX} "${TOOL_NAME_UNKNOWN}" configured for agent "${AGENT_ID_TEST}". ${ERROR_MESSAGE_SKIPPING_SUFFIX}`)
      );
    });
  });

  describe('Independent Registries', () => {
    it('should create independent registries for different agents', () => {
      const agentConfig1: AgentConfig = {
        ...agentConfig,
        id: AGENT_ID_1,
        tools: [
          {
            name: TOOL_NAME_CONTEXT_SEARCH,
          },
        ],
      };

      const agentConfig2: AgentConfig = {
        ...agentConfig,
        id: AGENT_ID_2,
        tools: [], // No tools
      };

      const registry1 = buildToolRegistry(agentConfig1);
      const registry2 = buildToolRegistry(agentConfig2);
      
      expect(registry1.hasTools()).toBe(true);
      expect(registry2.hasTools()).toBe(false);
      expect(registry1.has(TOOL_NAME_CONTEXT_SEARCH)).toBe(true);
      expect(registry2.has(TOOL_NAME_CONTEXT_SEARCH)).toBe(false);
    });
  });
});

