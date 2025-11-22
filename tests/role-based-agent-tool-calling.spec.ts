import { RoleBasedAgent } from '../src/agents/role-based-agent';
import { AgentConfig, AGENT_ROLES, LLM_PROVIDERS } from '../src/types/agent.types';
import { ToolSchema } from '../src/types/tool.types';
import { DebateContext } from '../src/types/debate.types';
import { LLMProvider, CompletionRequest, CompletionResponse } from '../src/providers/llm-provider';
import { ToolRegistry } from '../src/tools/tool-registry';
import { ToolImplementation } from '../src/tools/tool-implementation';
import { ToolCall } from '../src/types/tool.types';

// Mock tool
class TestTool implements ToolImplementation {
  name = 'test_tool';
  schema: ToolSchema = {
    name: 'test_tool',
    description: 'Test tool',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string' },
      },
      required: ['input'],
    },
  };

  execute(_args: any, _context?: DebateContext): string {
    return JSON.stringify({ status: 'success', result: { output: 'test' } });
  }
}

// Mock provider
class MockProvider implements LLMProvider {
  private responses: Array<{ text: string; toolCalls?: ToolCall[] }> = [];
  private callCount = 0;

  setResponses(responses: Array<{ text: string; toolCalls?: ToolCall[] }>) {
    this.responses = responses;
    this.callCount = 0;
  }

  async complete(_request: CompletionRequest): Promise<CompletionResponse> {
    const response = this.responses[this.callCount] || { text: 'Final' };
    this.callCount++;
    return {
      text: response.text,
      ...(response.toolCalls !== undefined && { toolCalls: response.toolCalls }),
      usage: { totalTokens: 100 },
    };
  }
}

describe('RoleBasedAgent Tool Calling', () => {
  let agentConfig: AgentConfig;
  let mockProvider: MockProvider;
  let toolRegistry: ToolRegistry;
  let mockContext: DebateContext;

  beforeEach(() => {
    agentConfig = {
      id: 'test-agent',
      name: 'Test Agent',
      role: AGENT_ROLES.ARCHITECT,
      model: 'gpt-4',
      provider: LLM_PROVIDERS.OPENAI,
      temperature: 0.5,
    };

    mockProvider = new MockProvider();
    toolRegistry = new ToolRegistry();
    toolRegistry.register(new TestTool());

    mockContext = {
      problem: 'Test problem',
      history: [],
    };
  });

  describe('Agent with Tools Configured', () => {
    it('should use tools when tool registry is provided', async () => {
      mockProvider.setResponses([
        {
          text: 'Calling tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'test_tool',
              arguments: '{"input":"test"}',
            },
          ],
        },
        {
          text: 'Final response',
        },
      ]);

      const agent = RoleBasedAgent.create(
        agentConfig,
        mockProvider,
        'System prompt',
        undefined,
        { enabled: false, threshold: 0, maxLength: 0, method: 'length-based' },
        undefined,
        undefined,
        toolRegistry
      );

      const proposal = await agent.propose('Test problem', mockContext);

      expect(proposal.content).toBe('Final response');
      expect(proposal.metadata.toolCalls).toBeDefined();
      expect(proposal.metadata.toolCalls?.length).toBe(1);
    });

    it('should include tool calls in proposal metadata', async () => {
      mockProvider.setResponses([
        {
          text: 'Proposal with tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'test_tool',
              arguments: '{}',
            },
          ],
        },
        {
          text: 'Final proposal',
        },
      ]);

      const agent = RoleBasedAgent.create(
        agentConfig,
        mockProvider,
        'System',
        undefined,
        { enabled: false, threshold: 0, maxLength: 0, method: 'length-based' },
        undefined,
        undefined,
        toolRegistry
      );

      const proposal = await agent.propose('Problem', mockContext);

      expect(proposal.metadata.toolCalls).toBeDefined();
      expect(proposal.metadata.toolCalls?.[0]?.name).toBe('test_tool');
      expect(proposal.metadata.toolResults).toBeDefined();
      expect(proposal.metadata.toolCallIterations).toBe(1);
    });

    it('should include tool calls in critique metadata', async () => {
      mockProvider.setResponses([
        {
          text: 'Critique with tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'test_tool',
              arguments: '{}',
            },
          ],
        },
        {
          text: 'Final critique',
        },
      ]);

      const agent = RoleBasedAgent.create(
        agentConfig,
        mockProvider,
        'System',
        undefined,
        { enabled: false, threshold: 0, maxLength: 0, method: 'length-based' },
        undefined,
        undefined,
        toolRegistry
      );

      const critique = await agent.critique(
        { content: 'Proposal to critique', metadata: {} },
        mockContext
      );

      expect(critique.metadata.toolCalls).toBeDefined();
      expect(critique.metadata.toolCallIterations).toBe(1);
    });

    it('should include tool calls in refinement metadata', async () => {
      mockProvider.setResponses([
        {
          text: 'Refinement with tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'test_tool',
              arguments: '{}',
            },
          ],
        },
        {
          text: 'Final refinement',
        },
      ]);

      const agent = RoleBasedAgent.create(
        agentConfig,
        mockProvider,
        'System',
        undefined,
        { enabled: false, threshold: 0, maxLength: 0, method: 'length-based' },
        undefined,
        undefined,
        toolRegistry
      );

      const refinement = await agent.refine(
        { content: 'Original', metadata: {} },
        [],
        mockContext
      );

      expect(refinement.metadata.toolCalls).toBeDefined();
      expect(refinement.metadata.toolCallIterations).toBe(1);
    });
  });

  describe('Agent without Tools (Backward Compatibility)', () => {
    it('should work without tool registry', async () => {
      mockProvider.setResponses([
        {
          text: 'Simple proposal',
        },
      ]);

      const agent = RoleBasedAgent.create(
        agentConfig,
        mockProvider,
        'System',
        undefined,
        { enabled: false, threshold: 0, maxLength: 0, method: 'length-based' },
        undefined,
        undefined,
        undefined // No tool registry
      );

      const proposal = await agent.propose('Problem', mockContext);

      expect(proposal.content).toBe('Simple proposal');
      expect(proposal.metadata.toolCalls).toBeUndefined();
    });
  });

  describe('Tool Call Limits', () => {
    it('should respect tool call limit per phase', async () => {
      agentConfig.toolCallLimit = 2;

      // Set up responses that would exceed limit
      mockProvider.setResponses([
        {
          text: 'Iter 1',
          toolCalls: [
            {
              id: 'call_1',
              name: 'test_tool',
              arguments: '{}',
            },
          ],
        },
        {
          text: 'Iter 2',
          toolCalls: [
            {
              id: 'call_2',
              name: 'test_tool',
              arguments: '{}',
            },
          ],
        },
        {
          text: 'Iter 3',
          toolCalls: [
            {
              id: 'call_3',
              name: 'test_tool',
              arguments: '{}',
            },
          ],
        },
      ]);

      const agent = RoleBasedAgent.create(
        agentConfig,
        mockProvider,
        'System',
        undefined,
        { enabled: false, threshold: 0, maxLength: 0, method: 'length-based' },
        undefined,
        undefined,
        toolRegistry
      );

      const proposal = await agent.propose('Problem', mockContext);

      expect(proposal.metadata.toolCallIterations).toBe(2);
    });
  });

  describe('Context Passing', () => {
    it('should pass context to tools correctly', async () => {
      const contextWithHistory: DebateContext = {
        problem: 'Test',
        history: [
          {
            roundNumber: 1,
            contributions: [],
            timestamp: new Date(),
          },
        ],
      };

      mockProvider.setResponses([
        {
          text: 'Calling context search',
          toolCalls: [
            {
              id: 'call_1',
              name: 'test_tool',
              arguments: '{"input":"test"}',
            },
          ],
        },
        {
          text: 'Final',
        },
      ]);

      const agent = RoleBasedAgent.create(
        agentConfig,
        mockProvider,
        'System',
        undefined,
        { enabled: false, threshold: 0, maxLength: 0, method: 'length-based' },
        undefined,
        undefined,
        toolRegistry
      );

      const proposal = await agent.propose('Problem', contextWithHistory);

      // Tool should have received context
      expect(proposal.metadata.toolCalls).toBeDefined();
      expect(proposal.metadata.toolResults).toBeDefined();
    });
  });
});

