import { TracingDecoratorAgent } from '../src/utils/tracing-decorator-agent';
import { RoleBasedAgent } from '../src/agents/role-based-agent';
import { AgentConfig, AGENT_ROLES, LLM_PROVIDERS, Proposal, Critique } from '../src/types/agent.types';
import { SummarizationConfig } from '../src/types/config.types';
import { DebateContext, DebateState } from '../src/types/debate.types';
import { TracingContext } from '../src/types/tracing.types';
import { LLMProvider } from '../src/providers/llm-provider';
import { ToolImplementation } from '../src/tools/tool-implementation';
import { ToolCall, ToolResult } from '../src/types/tool.types';

/**
 * Test-only type that exposes protected methods for testing.
 * This allows us to test protected methods without using `any`.
 */
type TracingDecoratorAgentTestAccess = TracingDecoratorAgent & {
  executeTool(
    tool: ToolImplementation,
    args: Record<string, unknown>,
    toolCall: ToolCall,
    context: DebateContext | undefined,
    state: DebateState | undefined,
    toolResultsForThisIteration: ToolResult[],
    allToolResults: ToolResult[]
  ): void;
};

describe('TracingDecoratorAgent', () => {
  let mockProvider: LLMProvider;
  let mockLangfuse: any;
  let mockTrace: any;
  let mockSpan: any;
  let tracingContext: TracingContext;
  let agentConfig: AgentConfig;
  let summaryConfig: SummarizationConfig;
  let wrappedAgent: RoleBasedAgent;
  let decoratorAgent: TracingDecoratorAgent;

  beforeEach(() => {
    mockProvider = {
      complete: jest.fn().mockResolvedValue({
        text: 'test response',
        usage: { totalTokens: 100 },
      }),
    };

    mockSpan = {
      end: jest.fn(),
      generation: jest.fn().mockReturnValue({
        end: jest.fn(),
      }),
      span: jest.fn().mockReturnValue({
        end: jest.fn(),
      }),
    };

    mockTrace = {
      span: jest.fn().mockReturnValue(mockSpan),
    };

    mockLangfuse = {
      trace: jest.fn().mockReturnValue(mockTrace),
      flushAsync: jest.fn().mockResolvedValue(undefined),
    } as any;

    tracingContext = {
      langfuse: mockLangfuse,
      trace: mockTrace,
      currentSpans: new Map(),
    };

    agentConfig = {
      id: 'test-agent',
      name: 'Test Agent',
      role: AGENT_ROLES.ARCHITECT,
      model: 'gpt-4',
      provider: LLM_PROVIDERS.OPENAI,
      temperature: 0.5,
    };

    summaryConfig = {
      enabled: false,
      threshold: 5000,
      maxLength: 2500,
      method: 'length-based',
    };

    wrappedAgent = RoleBasedAgent.create(
      agentConfig,
      mockProvider,
      'System prompt',
      undefined,
      summaryConfig
    );

    decoratorAgent = new TracingDecoratorAgent(wrappedAgent, tracingContext);
  });

  describe('propose', () => {
    it('should create span and delegate to wrapped agent', async () => {
      const problem = 'Test problem';
      const context: DebateContext = {
        problem,
        tracingContext,
      };

      const result = await decoratorAgent.propose(problem, context);

      expect(mockTrace.span).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'agent-propose-test-agent',
        })
      );
      expect(result).toBeDefined();
      expect(result.content).toBe('test response');
    });

    it('should handle tracing errors gracefully', async () => {
      mockTrace.span = jest.fn().mockImplementation(() => {
        throw new Error('Tracing error');
      });

      const problem = 'Test problem';
      const context: DebateContext = {
        problem,
        tracingContext,
      };

      const result = await decoratorAgent.propose(problem, context);

      expect(result).toBeDefined();
      expect(result.content).toBe('test response');
    });

    it('should include correct tags in span', async () => {
      const problem = 'Test problem';
      const context: DebateContext = {
        problem,
        tracingContext,
      };

      await decoratorAgent.propose(problem, context);

      expect(mockTrace.span).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            agentName: 'Test Agent',
            agentRole: 'architect',
            agentId: 'test-agent',
          }),
        })
      );
    });
  });

  describe('critique', () => {
    it('should create span and delegate to wrapped agent', async () => {
      const proposal: Proposal = {
        content: 'Test proposal',
        metadata: {},
      };
      const context: DebateContext = {
        problem: 'Test problem',
        tracingContext,
      };

      const result = await decoratorAgent.critique(proposal, context);

      expect(mockTrace.span).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'agent-critique-test-agent',
        })
      );
      expect(result).toBeDefined();
    });
  });

  describe('refine', () => {
    it('should create span and delegate to wrapped agent', async () => {
      const original: Proposal = {
        content: 'Original proposal',
        metadata: {},
      };
      const critiques: Critique[] = [];
      const context: DebateContext = {
        problem: 'Test problem',
        tracingContext,
      };

      const result = await decoratorAgent.refine(original, critiques, context);

      expect(mockTrace.span).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'agent-refine-test-agent',
        })
      );
      expect(result).toBeDefined();
    });
  });

  describe('prepareContext', () => {
    it('should create span and delegate to wrapped agent', async () => {
      const context: DebateContext = {
        problem: 'Test problem',
        tracingContext,
      };

      const result = await decoratorAgent.prepareContext(context, 1);

      expect(mockTrace.span).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'agent-prepareContext-test-agent',
        })
      );
      expect(result).toBeDefined();
    });
  });

  describe('askClarifyingQuestions', () => {
    it('should create span and delegate to wrapped agent', async () => {
      const problem = 'Test problem';
      const context: DebateContext = {
        problem,
        tracingContext,
      };

      const result = await decoratorAgent.askClarifyingQuestions(problem, context);

      expect(mockTrace.span).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'agent-askClarifyingQuestions-test-agent',
        })
      );
      expect(result).toBeDefined();
    });
  });

  describe('shouldSummarize', () => {
    it('should delegate to wrapped agent', () => {
      const context: DebateContext = {
        problem: 'Test problem',
        tracingContext,
      };

      const result = decoratorAgent.shouldSummarize(context);

      expect(result).toBe(false); // summaryConfig.enabled is false
    });
  });

  describe('executeTool', () => {
    it('should create tool span and delegate to wrapped agent', () => {
      const tool: ToolImplementation = {
        name: 'test_tool',
        schema: {
          name: 'test_tool',
          description: 'Test tool',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        execute: jest.fn().mockReturnValue('{"result": "success"}'),
      };
      const args = { param: 'value' };
      const toolCall = {
        id: 'call-123',
        name: 'test_tool',
        arguments: '{"param":"value"}',
      };
      const toolResultsForThisIteration: any[] = [];
      const allToolResults: any[] = [];

      // Access protected method via type assertion for testing
      // Using a test-only type that exposes the protected method
      const context: DebateContext = {
        problem: 'Test problem',
        tracingContext,
      };
      (decoratorAgent as TracingDecoratorAgentTestAccess).executeTool(
        tool,
        args,
        toolCall,
        context,
        undefined, // state parameter
        toolResultsForThisIteration,
        allToolResults
      );

      expect(mockTrace.span).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tool-execution-test_tool',
        })
      );
    });
  });
});

