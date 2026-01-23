import { LLMProvider, CompletionRequest, CompletionResponse } from '../providers/llm-provider';
import { ToolImplementation } from '../tools/tool-implementation';
import { ToolRegistry } from '../tools/tool-registry';
import { AgentConfig, Proposal, Critique, AGENT_ROLES, LLM_PROVIDERS } from '../types/agent.types';
import { DebateContext, DebateState, ContextPreparationResult, ClarificationQuestionsResponse } from '../types/debate.types';

import { Agent, AgentLogger } from './agent';
import { AgentLLMResponse } from './agent';

// Test constants
const DEFAULT_TOOL_CALL_LIMIT = 10;
const LIMITED_TOOL_CALL_LIMIT = 2;
const SINGLE_TOOL_CALL_LIMIT = 1;
const MOCK_INPUT_TOKENS = 100;
const MOCK_OUTPUT_TOKENS = 50;
const MOCK_TOTAL_TOKENS = 150;

/**
 * Creates a minimal AgentConfig for testing.
 */
function createTestAgentConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    id: 'test-agent',
    name: 'Test Agent',
    role: AGENT_ROLES.ARCHITECT,
    model: 'gpt-4',
    provider: LLM_PROVIDERS.OPENAI,
    temperature: 0.5,
    ...overrides,
  };
}

// Mock tool implementation
class MockTool implements ToolImplementation {
  name = 'mock_tool';
  schema = {
    name: 'mock_tool',
    description: 'A mock tool for testing',
    parameters: {
      type: 'object' as const,
      properties: {
        input: { type: 'string' as const, description: 'Input string' },
      },
      required: ['input'],
    },
  };

  execute(args: Record<string, unknown>, _context?: DebateContext, _state?: DebateState): string {
    const input = typeof args.input === 'string' ? args.input : '';
    if (input === 'error') {
      return JSON.stringify({ status: 'error', error: 'Mock error' });
    }
    return JSON.stringify({ status: 'success', result: { output: `Processed: ${input}` } });
  }
}

// Mock provider that returns tool calls
class MockProviderWithTools implements LLMProvider {
  private callCount = 0;
  private toolCallResponses: CompletionResponse[] = [];

  setResponses(responses: CompletionResponse[]): void {
    this.toolCallResponses = responses;
    this.callCount = 0;
  }

  async complete(_request: CompletionRequest): Promise<CompletionResponse> {
    const response = this.toolCallResponses[this.callCount] || { text: 'Final response' };
    this.callCount++;
    
    return {
      text: response.text,
      ...(response.toolCalls !== undefined && { toolCalls: response.toolCalls }),
      usage: {
        inputTokens: MOCK_INPUT_TOKENS,
        outputTokens: MOCK_OUTPUT_TOKENS,
        totalTokens: MOCK_TOTAL_TOKENS,
      },
    };
  }
}

/**
 * Type for accessing protected members of Agent in tests.
 * This allows us to test protected methods without using `any`.
 */
type TestAgentAccess = Agent & {
  toolRegistry: ToolRegistry | undefined;
  toolCallLimit: number;
  callLLM(systemPrompt: string, userPrompt: string, context?: DebateContext, state?: DebateState): Promise<AgentLLMResponse>;
};

// Mock agent class for testing
class TestAgent extends Agent {
  constructor(config: AgentConfig, provider: LLMProvider, toolRegistry?: ToolRegistry, toolCallLimit?: number, logger?: AgentLogger) {
    super(config, provider, toolRegistry, toolCallLimit, logger);
    const self = this as unknown as TestAgentAccess;
    self.toolRegistry = toolRegistry;
    // Don't override toolCallLimit - let the parent constructor handle it
  }

  async propose(_problem: string, _context: DebateContext): Promise<Proposal> {
    throw new Error('Not implemented in test');
  }

  async critique(_proposal: Proposal, _context: DebateContext): Promise<Critique> {
    throw new Error('Not implemented in test');
  }

  async refine(_original: Proposal, _critiques: Critique[], _context: DebateContext): Promise<Proposal> {
    throw new Error('Not implemented in test');
  }

  shouldSummarize(_context: DebateContext): boolean {
    return false;
  }

  async prepareContext(_context: DebateContext, _roundNumber: number): Promise<ContextPreparationResult> {
    return { context: _context };
  }

  async askClarifyingQuestions(_problem: string, _context: DebateContext): Promise<ClarificationQuestionsResponse> {
    return { questions: [] };
  }

  // Expose callLLM for testing
  async testCallLLM(systemPrompt: string, userPrompt: string, context?: DebateContext, state?: DebateState): Promise<AgentLLMResponse> {
    const self = this as unknown as TestAgentAccess;
    return self.callLLM(systemPrompt, userPrompt, context, state);
  }

  // Expose proposeImpl, critiqueImpl, refineImpl for testing
  async testProposeImpl(context: DebateContext, systemPrompt: string, userPrompt: string, state?: DebateState): Promise<Proposal> {
    const self = this as unknown as TestAgentAccess;
    return (self as unknown as { proposeImpl: typeof Agent.prototype['proposeImpl'] }).proposeImpl(context, systemPrompt, userPrompt, state);
  }

  async testCritiqueImpl(context: DebateContext, systemPrompt: string, userPrompt: string, state?: DebateState): Promise<Critique> {
    const self = this as unknown as TestAgentAccess;
    return (self as unknown as { critiqueImpl: typeof Agent.prototype['critiqueImpl'] }).critiqueImpl(context, systemPrompt, userPrompt, state);
  }

  async testRefineImpl(context: DebateContext, systemPrompt: string, userPrompt: string, state?: DebateState): Promise<Proposal> {
    const self = this as unknown as TestAgentAccess;
    return (self as unknown as { refineImpl: typeof Agent.prototype['refineImpl'] }).refineImpl(context, systemPrompt, userPrompt, state);
  }
}

describe('Agent Tool Calling', () => {
  let mockProvider: MockProviderWithTools;
  let toolRegistry: ToolRegistry;
  let agent: TestAgent;
  let mockContext: DebateContext;

  beforeEach(() => {
    mockProvider = new MockProviderWithTools();
    toolRegistry = new ToolRegistry();
    toolRegistry.register(new MockTool());
    
    agent = new TestAgent(
      createTestAgentConfig(),
      mockProvider,
      toolRegistry,
      DEFAULT_TOOL_CALL_LIMIT
    );

    mockContext = {
      problem: 'Test problem',
      history: [],
    };
  });

  describe('Tool Call Detection', () => {
    it('should detect tool calls from provider response', async () => {
      mockProvider.setResponses([
        {
          text: 'I need to call a tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'mock_tool',
              arguments: '{"input":"test"}',
            },
          ],
        },
        {
          text: 'Tool executed successfully',
        },
      ]);

      const response = await agent.testCallLLM('System', 'User prompt', mockContext);
      
      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls?.length).toBe(1);
      expect(response.toolCalls?.[0]?.name).toBe('mock_tool');
    });

    it('should handle response without tool calls', async () => {
      mockProvider.setResponses([
        {
          text: 'No tools needed',
        },
      ]);

      const response = await agent.testCallLLM('System', 'User prompt', mockContext);
      
      expect(response.toolCalls).toBeUndefined();
      expect(response.text).toBe('No tools needed');
    });
  });

  describe('Tool Execution Loop', () => {
    it('should execute single tool call', async () => {
      mockProvider.setResponses([
        {
          text: 'Calling tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'mock_tool',
              arguments: '{"input":"test"}',
            },
          ],
        },
        {
          text: 'Final response after tool',
        },
      ]);

      const response = await agent.testCallLLM('System', 'User prompt', mockContext);
      
      expect(response.toolCalls?.length).toBe(1);
      expect(response.toolResults?.length).toBe(1);
      expect(response.toolCallIterations).toBe(1);
      expect(response.text).toBe('Final response after tool');
    });

    it('should execute multiple tool calls in sequence', async () => {
      mockProvider.setResponses([
        {
          text: 'Calling tools',
          toolCalls: [
            {
              id: 'call_1',
              name: 'mock_tool',
              arguments: '{"input":"first"}',
            },
            {
              id: 'call_2',
              name: 'mock_tool',
              arguments: '{"input":"second"}',
            },
          ],
        },
        {
          text: 'Final response',
        },
      ]);

      const response = await agent.testCallLLM('System', 'User prompt', mockContext);
      
      expect(response.toolCalls?.length).toBe(2);
      expect(response.toolResults?.length).toBe(2);
      expect(response.toolCallIterations).toBe(1);
    });

    it('should handle multiple iterations', async () => {
      mockProvider.setResponses([
        {
          text: 'First call',
          toolCalls: [
            {
              id: 'call_1',
              name: 'mock_tool',
              arguments: '{"input":"iter1"}',
            },
          ],
        },
        {
          text: 'Second call',
          toolCalls: [
            {
              id: 'call_2',
              name: 'mock_tool',
              arguments: '{"input":"iter2"}',
            },
          ],
        },
        {
          text: 'Final response',
        },
      ]);

      const response = await agent.testCallLLM('System', 'User prompt', mockContext);
      
      expect(response.toolCallIterations).toBe(2);
      expect(response.toolCalls?.length).toBe(2);
      expect(response.toolResults?.length).toBe(2);
    });
  });

  describe('Iteration Limits', () => {
    it('should stop at iteration limit', async () => {
      const limitedAgent = new TestAgent(
        createTestAgentConfig({ id: 'test', name: 'Test' }),
        mockProvider,
        toolRegistry,
        LIMITED_TOOL_CALL_LIMIT // Limit to 2 iterations
      );

      mockProvider.setResponses([
        { text: 'Iter 1', toolCalls: [{ id: 'call_1', name: 'mock_tool', arguments: '{"input":"1"}' }] },
        { text: 'Iter 2', toolCalls: [{ id: 'call_2', name: 'mock_tool', arguments: '{"input":"2"}' }] },
        { text: 'Iter 3', toolCalls: [{ id: 'call_3', name: 'mock_tool', arguments: '{"input":"3"}' }] },
        { text: 'Would continue', toolCalls: [{ id: 'call_4', name: 'mock_tool', arguments: '{"input":"4"}' }] },
      ]);

      const response = await limitedAgent.testCallLLM('System', 'User', mockContext);
      
      expect(response.toolCallIterations).toBe(2);
      expect(response.text).toBe('Iter 2');
    });
  });

  describe('Error Handling', () => {
    it('should handle tool not found in registry', async () => {
      mockProvider.setResponses([
        {
          text: 'Calling unknown tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'unknown_tool',
              arguments: '{}',
            },
          ],
        },
        {
          text: 'Final response',
        },
      ]);

      const response = await agent.testCallLLM('System', 'User', mockContext);
      
      expect(response.toolResults?.length).toBe(1);
      const toolResult = response.toolResults?.[0];
      expect(toolResult).toBeDefined();
      if (toolResult) {
        const result = JSON.parse(toolResult.content);
        expect(result.status).toBe('error');
        expect(result.error).toContain('not found');
      }
    });

    it('should handle tool execution errors', async () => {
      mockProvider.setResponses([
        {
          text: 'Calling tool with error',
          toolCalls: [
            {
              id: 'call_1',
              name: 'mock_tool',
              arguments: '{"input":"error"}',
            },
          ],
        },
        {
          text: 'Final response',
        },
      ]);

      const response = await agent.testCallLLM('System', 'User', mockContext);
      
      expect(response.toolResults?.length).toBe(1);
      const toolResult = response.toolResults?.[0];
      expect(toolResult).toBeDefined();
      if (toolResult) {
        const result = JSON.parse(toolResult.content);
        expect(result.status).toBe('error');
      }
    });

    it('should handle malformed tool call arguments', async () => {
      mockProvider.setResponses([
        {
          text: 'Calling with bad args',
          toolCalls: [
            {
              id: 'call_1',
              name: 'mock_tool',
              arguments: 'invalid json{',
            },
          ],
        },
        {
          text: 'Final response',
        },
      ]);

      const response = await agent.testCallLLM('System', 'User', mockContext);
      
      expect(response.toolResults?.length).toBe(1);
      const toolResult = response.toolResults?.[0];
      expect(toolResult).toBeDefined();
      if (toolResult) {
        const result = JSON.parse(toolResult.content);
        expect(result.status).toBe('error');
      }
    });

    it('should count failed tool invocations toward limit', async () => {
      const limitedAgent = new TestAgent(
        createTestAgentConfig({ id: 'test', name: 'Test' }),
        mockProvider,
        toolRegistry,
        LIMITED_TOOL_CALL_LIMIT
      );

      mockProvider.setResponses([
        {
          text: 'Call 1',
          toolCalls: [
            {
              id: 'call_1',
              name: 'unknown_tool',
              arguments: '{}',
            },
          ],
        },
        {
          text: 'Call 2',
          toolCalls: [
            {
              id: 'call_2',
              name: 'unknown_tool',
              arguments: '{}',
            },
          ],
        },
        {
          text: 'Would continue',
          toolCalls: [
            {
              id: 'call_3',
              name: 'unknown_tool',
              arguments: '{}',
            },
          ],
        },
      ]);

      const response = await limitedAgent.testCallLLM('System', 'User', mockContext);
      
      expect(response.toolCallIterations).toBe(2);
    });
  });

  describe('Tool Result Formatting', () => {
    it('should format tool results in OpenAI format', async () => {
      mockProvider.setResponses([
        {
          text: 'Calling tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'mock_tool',
              arguments: '{"input":"test"}',
            },
          ],
        },
        {
          text: 'Final',
        },
      ]);

      const response = await agent.testCallLLM('System', 'User', mockContext);
      
      expect(response.toolResults?.length).toBe(1);
      const result = response.toolResults?.[0];
      expect(result).toBeDefined();
      if (result) {
        expect(result.tool_call_id).toBe('call_1');
        expect(result.role).toBe('tool');
        expect(result.content).toBeDefined();
        
        const parsed = JSON.parse(result.content);
        expect(parsed.status).toBeDefined();
      }
    });
  });

  describe('Messages Array Building', () => {
    it('should build messages array for subsequent LLM calls', async () => {
      mockProvider.setResponses([
        {
          text: 'First response',
          toolCalls: [
            {
              id: 'call_1',
              name: 'mock_tool',
              arguments: '{"input":"test"}',
            },
          ],
        },
        {
          text: 'Second response',
        },
      ]);

      const response = await agent.testCallLLM('System', 'User prompt', mockContext);
      
      // Verify provider was called twice (initial + with tool results)
      expect(mockProvider['callCount']).toBe(2);
      expect(response.toolCallIterations).toBe(1);
    });
  });

  describe('Loop Termination', () => {
    it('should terminate when no tool calls returned', async () => {
      mockProvider.setResponses([
        {
          text: 'No tools',
        },
      ]);

      const response = await agent.testCallLLM('System', 'User', mockContext);
      
      expect(response.toolCallIterations).toBe(0);
      expect(response.toolCalls).toBeUndefined();
    });

    it('should terminate when limit reached', async () => {
      const limitedAgent = new TestAgent(
        createTestAgentConfig({ id: 'test', name: 'Test' }),
        mockProvider,
        toolRegistry,
        SINGLE_TOOL_CALL_LIMIT
      );

      mockProvider.setResponses([
        {
          text: 'Iter 1',
          toolCalls: [
            {
              id: 'call_1',
              name: 'mock_tool',
              arguments: '{"input":"1"}',
            },
          ],
        },
        {
          text: 'Iter 2',
          toolCalls: [
            {
              id: 'call_2',
              name: 'mock_tool',
              arguments: '{"input":"2"}',
            },
          ],
        },
      ]);

      const response = await limitedAgent.testCallLLM('System', 'User', mockContext);
      
      expect(response.toolCallIterations).toBe(1);
      expect(response.text).toBe('Iter 1');
    });
  });

  describe('Logger Functionality', () => {
    it('should call logger for tool execution messages', async () => {
      const loggedMessages: Array<{ message: string; onlyVerbose?: boolean }> = [];
      const logger = (message: string, onlyVerbose?: boolean): void => {
        loggedMessages.push(onlyVerbose !== undefined ? { message, onlyVerbose } : { message });
      };

      const agentWithLogger = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        toolRegistry,
        DEFAULT_TOOL_CALL_LIMIT,
        logger
      );

      mockProvider.setResponses([
        {
          text: 'I need to call a tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'mock_tool',
              arguments: '{"input":"test"}',
            },
          ],
        },
        {
          text: 'Tool executed successfully',
        },
      ]);

      await agentWithLogger.testCallLLM('System', 'User prompt', mockContext);

      const executionMessages = loggedMessages.filter(m => m.message.includes('Executing tool'));
      expect(executionMessages.length).toBeGreaterThan(0);
      expect(executionMessages[0]?.onlyVerbose).toBe(false);
    });

    it('should call logger for tool warning messages', async () => {
      const loggedMessages: Array<{ message: string; onlyVerbose?: boolean }> = [];
      const logger = (message: string, onlyVerbose?: boolean): void => {
        loggedMessages.push(onlyVerbose !== undefined ? { message, onlyVerbose } : { message });
      };

      // Use a registry with a tool so hasTools() returns true, but call a different tool name that doesn't exist
      const registryWithTool = new ToolRegistry();
      registryWithTool.register(new MockTool());

      const agentWithLogger = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        registryWithTool,
        10,
        logger
      );

      mockProvider.setResponses([
        {
          text: 'I need to call a tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'nonexistent_tool',
              arguments: '{"input":"test"}',
            },
          ],
        },
        {
          text: 'Final response',
        },
      ]);

      await agentWithLogger.testCallLLM('System', 'User prompt', mockContext);

      // Should have "Executing tool" message (logger should be called)
      const executionMessages = loggedMessages.filter(m => m.message.includes('Executing tool'));
      expect(executionMessages.length).toBeGreaterThan(0);
      expect(executionMessages[0]?.onlyVerbose).toBe(false);
      
      // Should have warning message for tool not found (logger should be called)
      const warningMessages = loggedMessages.filter(m => m.message.includes('Warning') && m.message.includes('not found'));
      expect(warningMessages.length).toBeGreaterThan(0);
      expect(warningMessages[0]?.onlyVerbose).toBe(false);
    });

    it('should respect onlyVerbose parameter - logs when onlyVerbose=false', () => {
      const loggedMessages: string[] = [];
      const logger = (message: string, onlyVerbose?: boolean): void => {
        if (onlyVerbose === false || (onlyVerbose === true && false)) {
          loggedMessages.push(message);
        }
      };

      const agentWithLogger = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        toolRegistry,
        DEFAULT_TOOL_CALL_LIMIT,
        logger
      );

      mockProvider.setResponses([
        {
          text: 'I need to call a tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'mock_tool',
              arguments: '{"input":"test"}',
            },
          ],
        },
        {
          text: 'Tool executed successfully',
        },
      ]);

      return agentWithLogger.testCallLLM('System', 'User prompt', mockContext).then(() => {
        // Should log execution message (onlyVerbose=false)
        const executionMessages = loggedMessages.filter(m => m.includes('Executing tool'));
        expect(executionMessages.length).toBeGreaterThan(0);
        
        // Should NOT log verbose result message (onlyVerbose=true, verbose=false)
        const resultMessages = loggedMessages.filter(m => m.includes('execution result'));
        expect(resultMessages.length).toBe(0);
      });
    });

    it('should respect onlyVerbose parameter - logs when onlyVerbose=true and verbose=true', () => {
      const loggedMessages: string[] = [];
      const verbose = true;
      const logger = (message: string, onlyVerbose?: boolean): void => {
        if (onlyVerbose === false || (onlyVerbose === true && verbose)) {
          loggedMessages.push(message);
        }
      };

      const agentWithLogger = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        toolRegistry,
        DEFAULT_TOOL_CALL_LIMIT,
        logger
      );

      mockProvider.setResponses([
        {
          text: 'I need to call a tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'mock_tool',
              arguments: '{"input":"test"}',
            },
          ],
        },
        {
          text: 'Tool executed successfully',
        },
      ]);

      return agentWithLogger.testCallLLM('System', 'User prompt', mockContext).then(() => {
        // Should log execution message (onlyVerbose=false)
        const executionMessages = loggedMessages.filter(m => m.includes('Executing tool'));
        expect(executionMessages.length).toBeGreaterThan(0);
        
        // Should log verbose result message (onlyVerbose=true, verbose=true)
        const resultMessages = loggedMessages.filter(m => m.includes('execution result'));
        expect(resultMessages.length).toBeGreaterThan(0);
      });
    });

    it('should fallback to writeStderr when logger not provided', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const consoleUtils = require('../utils/console');
      const originalWriteStderr = consoleUtils.writeStderr;
      const stderrCalls: string[] = [];
      
      // Mock writeStderr
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../utils/console').writeStderr = (msg: string): void => {
        stderrCalls.push(msg);
      };

      const agentWithoutLogger = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        toolRegistry,
        10
      );

      mockProvider.setResponses([
        {
          text: 'I need to call a tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'mock_tool',
              arguments: '{"input":"test"}',
            },
          ],
        },
        {
          text: 'Tool executed successfully',
        },
      ]);

      await agentWithoutLogger.testCallLLM('System', 'User prompt', mockContext);

      const executionMessages = stderrCalls.filter(m => m.includes('Executing tool'));
      expect(executionMessages.length).toBeGreaterThan(0);

      // Restore original
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../utils/console').writeStderr = originalWriteStderr;
    });

    it('should log all 7 tool-related messages through logger', async () => {
      const loggedMessages: Array<{ message: string; onlyVerbose?: boolean }> = [];
      const logger = (message: string, onlyVerbose?: boolean): void => {
        loggedMessages.push(onlyVerbose !== undefined ? { message, onlyVerbose } : { message });
      };

      const agentWithLogger = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        toolRegistry,
        DEFAULT_TOOL_CALL_LIMIT,
        logger
      );

      mockProvider.setResponses([
        {
          text: 'I need to call a tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'mock_tool',
              arguments: '{"input":"test"}',
            },
          ],
        },
        {
          text: 'Tool executed successfully',
        },
      ]);

      await agentWithLogger.testCallLLM('System', 'User prompt', mockContext);

      // Should have at least execution message and result message
      expect(loggedMessages.length).toBeGreaterThan(0);
      
      // Check that execution message is present (onlyVerbose=false)
      const executionMessages = loggedMessages.filter(m => m.message.includes('Executing tool'));
      expect(executionMessages.length).toBeGreaterThan(0);
      
      // Check that result message is present (onlyVerbose=true)
      const resultMessages = loggedMessages.filter(m => m.message.includes('execution result'));
      expect(resultMessages.length).toBeGreaterThan(0);
      expect(resultMessages[0]?.onlyVerbose).toBe(true);
    });
  });

  describe('callLLMWithoutTools path', () => {
    it('should use callLLMWithoutTools when no tool registry provided', async () => {
      const agentWithoutTools = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        undefined, // No tool registry
        DEFAULT_TOOL_CALL_LIMIT
      );

      mockProvider.setResponses([
        {
          text: 'Simple response without tools',
        },
      ]);

      const response = await agentWithoutTools.testCallLLM('System', 'User prompt', mockContext);
      
      expect(response.text).toBe('Simple response without tools');
      expect(response.toolCalls).toBeUndefined();
      expect(response.toolResults).toBeUndefined();
      expect(response.toolCallIterations).toBeUndefined();
      expect(response.usage).toBeDefined();
    });

    it('should use callLLMWithoutTools when tool registry has no tools', async () => {
      const emptyRegistry = new ToolRegistry();
      const agentWithEmptyRegistry = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        emptyRegistry,
        DEFAULT_TOOL_CALL_LIMIT
      );

      mockProvider.setResponses([
        {
          text: 'Response with empty registry',
        },
      ]);

      const response = await agentWithEmptyRegistry.testCallLLM('System', 'User prompt', mockContext);
      
      expect(response.text).toBe('Response with empty registry');
      expect(response.toolCalls).toBeUndefined();
      expect(response.toolResults).toBeUndefined();
    });
  });

  describe('Template methods (proposeImpl, critiqueImpl, refineImpl)', () => {
    it('should build proposal metadata correctly in proposeImpl', async () => {
      const agentWithoutTools = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        undefined, // No tools
        DEFAULT_TOOL_CALL_LIMIT
      );

      mockProvider.setResponses([
        {
          text: 'Proposal content',
        },
      ]);

      const proposal = await agentWithoutTools.testProposeImpl(mockContext, 'System', 'User prompt');
      
      expect(proposal.content).toBe('Proposal content');
      expect(proposal.metadata.latencyMs).toBeGreaterThanOrEqual(0);
      expect(proposal.metadata.model).toBe('gpt-4');
      expect(proposal.metadata.tokensUsed).toBe(MOCK_TOTAL_TOKENS);
    });

    it('should build critique metadata correctly in critiqueImpl', async () => {
      const agentWithoutTools = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        undefined, // No tools
        DEFAULT_TOOL_CALL_LIMIT
      );

      mockProvider.setResponses([
        {
          text: 'Critique content',
        },
      ]);

      const critique = await agentWithoutTools.testCritiqueImpl(mockContext, 'System', 'User prompt');
      
      expect(critique.content).toBe('Critique content');
      expect(critique.metadata.latencyMs).toBeGreaterThanOrEqual(0);
      expect(critique.metadata.model).toBe('gpt-4');
      expect(critique.metadata.tokensUsed).toBe(MOCK_TOTAL_TOKENS);
    });

    it('should build refined proposal metadata correctly in refineImpl', async () => {
      const agentWithoutTools = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        undefined, // No tools
        DEFAULT_TOOL_CALL_LIMIT
      );

      mockProvider.setResponses([
        {
          text: 'Refined proposal content',
        },
      ]);

      const refined = await agentWithoutTools.testRefineImpl(mockContext, 'System', 'User prompt');
      
      expect(refined.content).toBe('Refined proposal content');
      expect(refined.metadata.latencyMs).toBeGreaterThanOrEqual(0);
      expect(refined.metadata.model).toBe('gpt-4');
      expect(refined.metadata.tokensUsed).toBe(MOCK_TOTAL_TOKENS);
    });

    it('should include tool calls and results in metadata when present', async () => {
      mockProvider.setResponses([
        {
          text: 'Proposal with tools',
          toolCalls: [
            {
              id: 'call_1',
              name: 'mock_tool',
              arguments: '{"input":"test"}',
            },
          ],
        },
        {
          text: 'Final response',
        },
      ]);

      const proposal = await agent.testProposeImpl(mockContext, 'System', 'User prompt');
      
      expect(proposal.metadata.toolCalls).toBeDefined();
      expect(proposal.metadata.toolCalls?.length).toBe(1);
      expect(proposal.metadata.toolResults).toBeDefined();
      expect(proposal.metadata.toolResults?.length).toBe(1);
      expect(proposal.metadata.toolCallIterations).toBe(1);
    });

    it('should handle missing usage in metadata', async () => {
      const providerWithoutUsage = new MockProviderWithTools();
      providerWithoutUsage.setResponses([
        {
          text: 'Response without usage',
        },
      ]);
      
      // Override to not include usage
      const originalComplete = providerWithoutUsage.complete.bind(providerWithoutUsage);
      providerWithoutUsage.complete = async (): Promise<CompletionResponse> => {
        const res = await originalComplete({} as CompletionRequest);
        return { text: res.text };
      };

      const agentWithoutUsage = new TestAgent(
        createTestAgentConfig(),
        providerWithoutUsage,
        undefined,
        DEFAULT_TOOL_CALL_LIMIT
      );

      const proposal = await agentWithoutUsage.testProposeImpl(mockContext, 'System', 'User prompt');
      
      expect(proposal.metadata.tokensUsed).toBeUndefined();
    });
  });

  describe('Constructor and toolCallLimit', () => {
    it('should use toolCallLimit from parameter when provided', () => {
      const agent = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        toolRegistry,
        5
      );
      
      const self = agent as unknown as TestAgentAccess;
      expect(self.toolCallLimit).toBe(5);
    });

    it('should use toolCallLimit from config when parameter not provided', () => {
      const config = createTestAgentConfig({ toolCallLimit: 7 });
      const agent = new TestAgent(
        config,
        mockProvider,
        toolRegistry,
        undefined // Explicitly pass undefined to test config fallback
      );
      
      const self = agent as unknown as TestAgentAccess;
      expect(self.toolCallLimit).toBe(7);
    });

    it('should use DEFAULT_TOOL_CALL_LIMIT when neither parameter nor config provided', () => {
      const agent = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        toolRegistry
      );
      
      const self = agent as unknown as TestAgentAccess;
      expect(self.toolCallLimit).toBe(DEFAULT_TOOL_CALL_LIMIT);
    });
  });

  describe('Error handling in processToolCall', () => {
    it('should handle errors thrown during tool processing', async () => {
      // Create a tool registry that throws when get() is called
      const throwingRegistry = new ToolRegistry();
      // Register a tool so hasTools() returns true
      throwingRegistry.register(new MockTool());
      
      // Override get() to throw
      const originalGet = throwingRegistry.get.bind(throwingRegistry);
      throwingRegistry.get = (name: string): ToolImplementation | undefined => {
        if (name === 'mock_tool') {
          throw new Error('Registry error');
        }
        return originalGet(name);
      };

      const agentWithThrowingRegistry = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        throwingRegistry,
        DEFAULT_TOOL_CALL_LIMIT
      );

      mockProvider.setResponses([
        {
          text: 'Calling tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'mock_tool',
              arguments: '{"input":"test"}',
            },
          ],
        },
        {
          text: 'Final response',
        },
      ]);

      const response = await agentWithThrowingRegistry.testCallLLM('System', 'User prompt', mockContext);
      
      expect(response.toolResults?.length).toBe(1);
      const toolResult = response.toolResults?.[0];
      if (toolResult) {
        const result = JSON.parse(toolResult.content);
        expect(result.status).toBe('error');
        expect(result.error).toContain('Registry error');
      }
    });
  });

  describe('Error handling in executeTool', () => {
    it('should handle errors thrown during tool execution', async () => {
      // Create a tool that throws when execute() is called
      class ThrowingTool implements ToolImplementation {
        name = 'throwing_tool';
        schema = {
          name: 'throwing_tool',
          description: 'A tool that throws',
          parameters: {
            type: 'object' as const,
            properties: {},
            required: [],
          },
        };

        execute(): string {
          throw new Error('Tool execution error');
        }
      }

      const registryWithThrowingTool = new ToolRegistry();
      registryWithThrowingTool.register(new ThrowingTool());

      const agentWithThrowingTool = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        registryWithThrowingTool,
        DEFAULT_TOOL_CALL_LIMIT
      );

      mockProvider.setResponses([
        {
          text: 'Calling throwing tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'throwing_tool',
              arguments: '{}',
            },
          ],
        },
        {
          text: 'Final response',
        },
      ]);

      const response = await agentWithThrowingTool.testCallLLM('System', 'User prompt', mockContext);
      
      expect(response.toolResults?.length).toBe(1);
      const toolResult = response.toolResults?.[0];
      if (toolResult) {
        const result = JSON.parse(toolResult.content);
        expect(result.status).toBe('error');
        expect(result.error).toContain('Tool execution error');
      }
    });
  });

  describe('formatToolInformation', () => {
    it('should return empty string when no tools available', async () => {
      const emptyRegistry = new ToolRegistry();
      const agentWithEmptyRegistry = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        emptyRegistry,
        DEFAULT_TOOL_CALL_LIMIT
      );

      mockProvider.setResponses([
        {
          text: 'Response',
        },
      ]);

      const response = await agentWithEmptyRegistry.testCallLLM('System', 'User prompt', mockContext);
      
      // Should complete successfully without tool information in prompt
      expect(response.text).toBe('Response');
    });

    it('should handle empty toolSchemas array in formatToolInformation', async () => {
      // Create a registry that hasTools() returns true but getAllSchemas() returns empty array
      // This tests the edge case where formatToolInformation receives an empty array
      const mockRegistry = new ToolRegistry();
      // Register a tool so hasTools() returns true
      mockRegistry.register(new MockTool());
      
      // Override getAllSchemas to return empty array
      const originalGetAllSchemas = mockRegistry.getAllSchemas.bind(mockRegistry);
      mockRegistry.getAllSchemas = (): ReturnType<typeof originalGetAllSchemas> => {
        return []; // Return empty array to test the early return in formatToolInformation
      };

      const agentWithMockRegistry = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        mockRegistry,
        DEFAULT_TOOL_CALL_LIMIT
      );

      mockProvider.setResponses([
        {
          text: 'Response with empty schemas',
        },
      ]);

      const response = await agentWithMockRegistry.testCallLLM('System', 'User prompt', mockContext);
      
      // Should complete successfully - formatToolInformation should return empty string
      expect(response.text).toBe('Response with empty schemas');
    });

    it('should format tool information with all optional fields', async () => {
      // Create a tool with missing optional fields
      class ToolWithOptionalFields implements ToolImplementation {
        name = 'optional_tool';
        schema = {
          name: 'optional_tool',
          description: 'A tool with optional fields',
          parameters: {
            type: 'object' as const,
            properties: {
              param1: { type: 'string' as const }, // No description
              param2: { type: 'number' as const, description: 'Has description' },
            },
            // No required field
          },
        };

        execute(): string {
          return JSON.stringify({ result: 'success' });
        }
      }

      const registryWithOptionalTool = new ToolRegistry();
      registryWithOptionalTool.register(new ToolWithOptionalFields());

      const agentWithOptionalTool = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        registryWithOptionalTool,
        DEFAULT_TOOL_CALL_LIMIT
      );

      mockProvider.setResponses([
        {
          text: 'Response with optional tool',
        },
      ]);

      const response = await agentWithOptionalTool.testCallLLM('System', 'User prompt', mockContext);
      
      // Should complete successfully - the tool information should be formatted
      expect(response.text).toBe('Response with optional tool');
    });

    it('should format tool information with empty parameters', async () => {
      class ToolWithNoParams implements ToolImplementation {
        name = 'no_params_tool';
        schema = {
          name: 'no_params_tool',
          description: 'A tool with no parameters',
          parameters: {
            type: 'object' as const,
            properties: {},
            required: [],
          },
        };

        execute(): string {
          return JSON.stringify({ result: 'success' });
        }
      }

      const registryWithNoParamsTool = new ToolRegistry();
      registryWithNoParamsTool.register(new ToolWithNoParams());

      const agentWithNoParamsTool = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        registryWithNoParamsTool,
        DEFAULT_TOOL_CALL_LIMIT
      );

      mockProvider.setResponses([
        {
          text: 'Response with no params tool',
        },
      ]);

      const response = await agentWithNoParamsTool.testCallLLM('System', 'User prompt', mockContext);
      
      // Should complete successfully
      expect(response.text).toBe('Response with no params tool');
    });
  });

  describe('Edge cases in metadata building', () => {
    it('should not include toolCalls in metadata when array is empty', async () => {
      mockProvider.setResponses([
        {
          text: 'Response without tool calls',
        },
      ]);

      const proposal = await agent.testProposeImpl(mockContext, 'System', 'User prompt');
      
      expect(proposal.metadata.toolCalls).toBeUndefined();
    });

    it('should not include toolResults in metadata when array is empty', async () => {
      mockProvider.setResponses([
        {
          text: 'Response without tool results',
        },
      ]);

      const proposal = await agent.testProposeImpl(mockContext, 'System', 'User prompt');
      
      expect(proposal.metadata.toolResults).toBeUndefined();
    });

    it('should handle toolCallIterations being 0', async () => {
      const emptyRegistry = new ToolRegistry();
      const agentWithEmptyRegistry = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        emptyRegistry,
        DEFAULT_TOOL_CALL_LIMIT
      );

      mockProvider.setResponses([
        {
          text: 'Response',
        },
      ]);

      const response = await agentWithEmptyRegistry.testCallLLM('System', 'User prompt', mockContext);
      
      // When no tools, toolCallIterations should be undefined
      expect(response.toolCallIterations).toBeUndefined();
    });

    it('should not include toolCalls in response when array is empty', async () => {
      const emptyRegistry = new ToolRegistry();
      const agentWithEmptyRegistry = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        emptyRegistry,
        DEFAULT_TOOL_CALL_LIMIT
      );

      mockProvider.setResponses([
        {
          text: 'Response',
        },
      ]);

      const response = await agentWithEmptyRegistry.testCallLLM('System', 'User prompt', mockContext);
      
      expect(response.toolCalls).toBeUndefined();
    });

    it('should not include toolResults in response when array is empty', async () => {
      const emptyRegistry = new ToolRegistry();
      const agentWithEmptyRegistry = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        emptyRegistry,
        DEFAULT_TOOL_CALL_LIMIT
      );

      mockProvider.setResponses([
        {
          text: 'Response',
        },
      ]);

      const response = await agentWithEmptyRegistry.testCallLLM('System', 'User prompt', mockContext);
      
      expect(response.toolResults).toBeUndefined();
    });

    it('should handle usage being undefined in callLLMWithoutTools', async () => {
      const providerWithoutUsage = new MockProviderWithTools();
      providerWithoutUsage.setResponses([
        {
          text: 'Response without usage',
        },
      ]);
      
      // Override to not include usage
      const originalComplete = providerWithoutUsage.complete.bind(providerWithoutUsage);
      providerWithoutUsage.complete = async (): Promise<CompletionResponse> => {
        const res = await originalComplete({} as CompletionRequest);
        return { text: res.text }; // No usage field
      };

      const agentWithoutUsage = new TestAgent(
        createTestAgentConfig(),
        providerWithoutUsage,
        undefined,
        DEFAULT_TOOL_CALL_LIMIT
      );

      const response = await agentWithoutUsage.testCallLLM('System', 'User prompt', mockContext);
      
      expect(response.usage).toBeUndefined();
    });

    it('should handle toolCallIterations being undefined when no tools', async () => {
      const agentWithoutTools = new TestAgent(
        createTestAgentConfig(),
        mockProvider,
        undefined,
        DEFAULT_TOOL_CALL_LIMIT
      );

      mockProvider.setResponses([
        {
          text: 'Response',
        },
      ]);

      const response = await agentWithoutTools.testCallLLM('System', 'User prompt', mockContext);
      
      expect(response.toolCallIterations).toBeUndefined();
    });
  });
});

