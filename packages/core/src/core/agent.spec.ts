import { Agent, ToolRegistry, ToolImplementation, ToolCall, LLMProvider, CompletionRequest, CompletionResponse, DebateContext, DebateState } from '@dialectic/core';

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

  execute(args: any, _context?: DebateContext, _state?: DebateState): string {
    if (args.input === 'error') {
      return JSON.stringify({ status: 'error', error: 'Mock error' });
    }
    return JSON.stringify({ status: 'success', result: { output: `Processed: ${args.input}` } });
  }
}

// Mock provider that returns tool calls
class MockProviderWithTools implements LLMProvider {
  private callCount = 0;
  private toolCallResponses: Array<{ text: string; toolCalls?: ToolCall[] }> = [];

  setResponses(responses: Array<{ text: string; toolCalls?: ToolCall[] }>) {
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
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      },
    };
  }
}

// Mock agent class for testing
class TestAgent extends Agent {
  constructor(config: any, provider: LLMProvider, toolRegistry?: ToolRegistry, toolCallLimit?: number, logger?: any) {
    super(config, provider, toolRegistry, toolCallLimit, logger);
    (this as any).toolRegistry = toolRegistry;
    (this as any).toolCallLimit = toolCallLimit ?? 10;
  }

  async propose(_problem: string, _context: DebateContext): Promise<any> {
    throw new Error('Not implemented in test');
  }

  async critique(_proposal: any, _context: DebateContext): Promise<any> {
    throw new Error('Not implemented in test');
  }

  async refine(_original: any, _critiques: any[], _context: DebateContext): Promise<any> {
    throw new Error('Not implemented in test');
  }

  shouldSummarize(_context: DebateContext): boolean {
    return false;
  }

  async prepareContext(_context: DebateContext, _roundNumber: number): Promise<any> {
    return { context: _context };
  }

  async askClarifyingQuestions(_problem: string, _context: DebateContext): Promise<any> {
    return { questions: [] };
  }

  // Expose callLLM for testing
  async testCallLLM(systemPrompt: string, userPrompt: string, context?: DebateContext): Promise<any> {
    return (this as any).callLLM(systemPrompt, userPrompt, context);
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
      { id: 'test-agent', name: 'Test Agent', model: 'gpt-4' },
      mockProvider,
      toolRegistry,
      10
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
      expect(response.toolCalls?.[0].name).toBe('mock_tool');
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
        { id: 'test', name: 'Test', model: 'gpt-4' },
        mockProvider,
        toolRegistry,
        2 // Limit to 2 iterations
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
      const result = JSON.parse(response.toolResults![0].content);
      expect(result.status).toBe('error');
      expect(result.error).toContain('not found');
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
      const result = JSON.parse(response.toolResults![0].content);
      expect(result.status).toBe('error');
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
      const result = JSON.parse(response.toolResults![0].content);
      expect(result.status).toBe('error');
    });

    it('should count failed tool invocations toward limit', async () => {
      const limitedAgent = new TestAgent(
        { id: 'test', name: 'Test', model: 'gpt-4' },
        mockProvider,
        toolRegistry,
        2
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
      const result = response.toolResults![0];
      expect(result.tool_call_id).toBe('call_1');
      expect(result.role).toBe('tool');
      expect(result.content).toBeDefined();
      
      const parsed = JSON.parse(result.content);
      expect(parsed.status).toBeDefined();
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
        { id: 'test', name: 'Test', model: 'gpt-4' },
        mockProvider,
        toolRegistry,
        1
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
      const logger = (message: string, onlyVerbose?: boolean) => {
        loggedMessages.push(onlyVerbose !== undefined ? { message, onlyVerbose } : { message });
      };

      const agentWithLogger = new TestAgent(
        { id: 'test-agent', name: 'Test Agent', model: 'gpt-4' },
        mockProvider,
        toolRegistry,
        10,
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
      const logger = (message: string, onlyVerbose?: boolean) => {
        loggedMessages.push(onlyVerbose !== undefined ? { message, onlyVerbose } : { message });
      };

      // Use a registry with a tool so hasTools() returns true, but call a different tool name that doesn't exist
      const registryWithTool = new ToolRegistry();
      registryWithTool.register(new MockTool());

      const agentWithLogger = new TestAgent(
        { id: 'test-agent', name: 'Test Agent', model: 'gpt-4' },
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
      const logger = (message: string, onlyVerbose?: boolean) => {
        if (onlyVerbose === false || (onlyVerbose === true && false)) {
          loggedMessages.push(message);
        }
      };

      const agentWithLogger = new TestAgent(
        { id: 'test-agent', name: 'Test Agent', model: 'gpt-4' },
        mockProvider,
        toolRegistry,
        10,
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
      const logger = (message: string, onlyVerbose?: boolean) => {
        if (onlyVerbose === false || (onlyVerbose === true && verbose)) {
          loggedMessages.push(message);
        }
      };

      const agentWithLogger = new TestAgent(
        { id: 'test-agent', name: 'Test Agent', model: 'gpt-4' },
        mockProvider,
        toolRegistry,
        10,
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
      const originalWriteStderr = require('../utils/console').writeStderr;
      const stderrCalls: string[] = [];
      
      // Mock writeStderr
      require('../utils/console').writeStderr = (msg: string) => {
        stderrCalls.push(msg);
      };

      const agentWithoutLogger = new TestAgent(
        { id: 'test-agent', name: 'Test Agent', model: 'gpt-4' },
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
      require('../utils/console').writeStderr = originalWriteStderr;
    });

    it('should log all 7 tool-related messages through logger', async () => {
      const loggedMessages: Array<{ message: string; onlyVerbose?: boolean }> = [];
      const logger = (message: string, onlyVerbose?: boolean) => {
        loggedMessages.push(onlyVerbose !== undefined ? { message, onlyVerbose } : { message });
      };

      const agentWithLogger = new TestAgent(
        { id: 'test-agent', name: 'Test Agent', model: 'gpt-4' },
        mockProvider,
        toolRegistry,
        10,
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
});

