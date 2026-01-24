import type { Langfuse } from 'langfuse';

import { RoleBasedAgent } from '../agents/role-based-agent';
import { Agent } from '../core/agent';
import { LLMProvider } from '../providers/llm-provider';
import { ToolImplementation } from '../tools/tool-implementation';
import { AgentConfig, AGENT_ROLES, LLM_PROVIDERS, Proposal, Critique } from '../types/agent.types';
import { SummarizationConfig, DebateContext, DebateState, ContextPreparationResult, ClarificationQuestionsResponse } from '../types/debate.types';
import { ToolCall, ToolResult, TOOL_RESULT_STATUS } from '../types/tool.types';
import type { LangfuseSpan } from '../types/tracing.types';
import { TracingContext, SPAN_LEVEL } from '../types/tracing.types';

import * as consoleUtils from './console';
import { TracingDecoratorAgent } from './tracing-decorator-agent';
import { TracingLLMProvider } from './tracing-provider';


// Test constants
const DEFAULT_TEMPERATURE = 0.5;
const MOCK_TOTAL_TOKENS = 100;

/**
 * Mock type for Langfuse generation with jest mocks.
 */
interface MockLangfuseGeneration {
  end: jest.Mock;
}

/**
 * Mock type for Langfuse span with jest mocks.
 */
interface MockLangfuseSpan {
  end: jest.Mock;
  generation: jest.Mock<MockLangfuseGeneration>;
  span: jest.Mock<MockLangfuseSpan>;
}

/**
 * Mock type for Langfuse trace with jest mocks.
 */
interface MockLangfuseTrace {
  span: jest.Mock<MockLangfuseSpan>;
}

/**
 * Mock type for Langfuse client with jest mocks.
 */
interface MockLangfuse {
  trace: jest.Mock<MockLangfuseTrace>;
  flushAsync: jest.Mock<Promise<void>>;
}

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

/**
 * Minimal Agent implementation for testing getSystemPrompt/getRolePrompts fallback
 * when the wrapped agent is not a RoleBasedAgent.
 */
class MinimalAgent extends Agent {
  constructor(config: AgentConfig, provider: LLMProvider) {
    super(config, provider);
  }

  async propose(): Promise<Proposal> {
    return { content: '', metadata: {} };
  }
  async critique(): Promise<Critique> {
    return { content: '', metadata: {} };
  }
  async refine(): Promise<Proposal> {
    return { content: '', metadata: {} };
  }
  shouldSummarize(): boolean {
    return false;
  }
  async prepareContext(): Promise<ContextPreparationResult> {
    return { context: { problem: '' } };
  }
  async askClarifyingQuestions(): Promise<ClarificationQuestionsResponse> {
    return { questions: [] };
  }
}

describe('TracingDecoratorAgent', () => {
  let mockProvider: LLMProvider;
  let mockLangfuse: MockLangfuse;
  let mockTrace: MockLangfuseTrace;
  let mockSpan: MockLangfuseSpan;
  let tracingContext: TracingContext;
  let agentConfig: AgentConfig;
  let summaryConfig: SummarizationConfig;
  let wrappedAgent: RoleBasedAgent;
  let decoratorAgent: TracingDecoratorAgent;

  beforeEach(() => {
    mockProvider = {
      complete: jest.fn().mockResolvedValue({
        text: 'test response',
        usage: { totalTokens: MOCK_TOTAL_TOKENS },
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
    };

    tracingContext = {
      langfuse: mockLangfuse as unknown as Langfuse,
      trace: mockTrace as unknown as ReturnType<Langfuse['trace']>,
      currentSpans: new Map(),
    };

    agentConfig = {
      id: 'test-agent',
      name: 'Test Agent',
      role: AGENT_ROLES.ARCHITECT,
      model: 'gpt-4',
      provider: LLM_PROVIDERS.OPENAI,
      temperature: DEFAULT_TEMPERATURE,
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

  describe('constructor', () => {
    it('calls setAgentId on TracingLLMProvider when wrapped agent uses it', () => {
      const tracingProvider = new TracingLLMProvider(mockProvider, tracingContext);
      const setAgentIdSpy = jest.spyOn(tracingProvider, 'setAgentId');
      const wrapped = RoleBasedAgent.create(
        agentConfig,
        tracingProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      new TracingDecoratorAgent(wrapped, tracingContext);

      expect(setAgentIdSpy).toHaveBeenCalledWith('test-agent');
    });

    it('calls resetIterationCount on TracingLLMProvider before each executeWithSpan', async () => {
      const tracingProvider = new TracingLLMProvider(mockProvider, tracingContext);
      const resetSpy = jest.spyOn(tracingProvider, 'resetIterationCount');
      const wrapped = RoleBasedAgent.create(
        agentConfig,
        tracingProvider,
        'System prompt',
        undefined,
        summaryConfig
      );
      const decorator = new TracingDecoratorAgent(wrapped, tracingContext);

      await decorator.propose('Test problem', { problem: 'Test problem', tracingContext });

      expect(resetSpy).toHaveBeenCalled();
    });
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

    it('should include roundNumber in span metadata when history is present', async () => {
      const problem = 'Test problem';
      const context: DebateContext = {
        problem,
        tracingContext,
        history: [{ roundNumber: 2, contributions: [], timestamp: new Date() }],
      };

      await decoratorAgent.propose(problem, context);

      expect(mockTrace.span).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            roundNumber: 2,
          }),
        })
      );
    });

    it('should end span with ERROR when fn throws (inner catch); outer catch retries fn which also throws', async () => {
      (mockProvider as { complete: jest.Mock }).complete.mockRejectedValue(new Error('LLM failed'));

      const problem = 'Test problem';
      const context: DebateContext = { problem, tracingContext };

      await expect(decoratorAgent.propose(problem, context)).rejects.toThrow('LLM failed');
      expect(mockSpan.end).toHaveBeenCalledWith(
        expect.objectContaining({
          level: SPAN_LEVEL.ERROR,
          statusMessage: 'LLM failed',
        })
      );
    });

    it('should restore previousSpan in finally when it was set', async () => {
      const previousSpan = { end: jest.fn(), span: jest.fn(), generation: jest.fn() };
      tracingContext.currentSpans.set('test-agent', previousSpan as unknown as LangfuseSpan);

      const problem = 'Test problem';
      const context: DebateContext = { problem, tracingContext };

      await decoratorAgent.propose(problem, context);

      expect(tracingContext.currentSpans.get('test-agent')).toBe(previousSpan);
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
    const makeTool = (content: string): ToolImplementation => ({
      name: 'test_tool',
      schema: {
        name: 'test_tool',
        description: 'Test tool',
        parameters: { type: 'object', properties: {}, required: [] },
      },
      execute: jest.fn().mockReturnValue(content),
    });

    const toolCall: ToolCall = {
      id: 'call-123',
      name: 'test_tool',
      arguments: '{"param":"value"}',
    };

    const baseContext: DebateContext = {
      problem: 'Test problem',
      tracingContext,
    };

    it('should create tool span and delegate to wrapped agent', () => {
      const tool = makeTool('{"result": "success"}');
      const toolResultsForThisIteration: ToolResult[] = [];
      const allToolResults: ToolResult[] = [];

      (decoratorAgent as TracingDecoratorAgentTestAccess).executeTool(
        tool,
        { param: 'value' },
        toolCall,
        baseContext,
        undefined,
        toolResultsForThisIteration,
        allToolResults
      );

      expect(mockTrace.span).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'tool-execution-test_tool' })
      );
      expect(mockSpan.end).toHaveBeenCalledWith({ output: '{"result": "success"}' });
    });

    it('should delegate to super only when tracingContext is falsy', () => {
      const decoratorWithNoTracing = new TracingDecoratorAgent(
        wrappedAgent,
        null as unknown as TracingContext
      );
      const tool = makeTool('{"status":"success","result":{}}');
      const toolResultsForThisIteration: ToolResult[] = [];
      const allToolResults: ToolResult[] = [];

      (decoratorWithNoTracing as TracingDecoratorAgentTestAccess).executeTool(
        tool,
        {},
        toolCall,
        baseContext,
        undefined,
        toolResultsForThisIteration,
        allToolResults
      );

      expect(mockTrace.span).not.toHaveBeenCalled();
      expect(toolResultsForThisIteration).toHaveLength(1);
    });

    it('should end tool span with ERROR when result status is error', () => {
      const errMsg = 'Tool failed';
      const tool = makeTool(JSON.stringify({ status: TOOL_RESULT_STATUS.ERROR, error: errMsg }));
      const toolResultsForThisIteration: ToolResult[] = [];
      const allToolResults: ToolResult[] = [];

      (decoratorAgent as TracingDecoratorAgentTestAccess).executeTool(
        tool,
        {},
        toolCall,
        baseContext,
        undefined,
        toolResultsForThisIteration,
        allToolResults
      );

      expect(mockSpan.end).toHaveBeenCalledWith({
        level: SPAN_LEVEL.ERROR,
        statusMessage: errMsg,
      });
    });

    it('should end tool span with output when result content is not valid JSON', () => {
      const raw = 'not json';
      const tool = makeTool(raw);
      const toolResultsForThisIteration: ToolResult[] = [];
      const allToolResults: ToolResult[] = [];

      (decoratorAgent as TracingDecoratorAgentTestAccess).executeTool(
        tool,
        {},
        toolCall,
        baseContext,
        undefined,
        toolResultsForThisIteration,
        allToolResults
      );

      expect(mockSpan.end).toHaveBeenCalledWith({ output: raw });
    });

    it('should end tool span with no args when super does not add a result', () => {
      const tool = makeTool('{"status":"success"}');
      const toolResultsForThisIteration: ToolResult[] = [];
      const allToolResults: ToolResult[] = [];
      const proto = Agent.prototype as unknown as { executeTool: (...args: unknown[]) => void };
      const spy = jest.spyOn(proto, 'executeTool').mockImplementation(() => {
        // No-op so no result is pushed
      });

      try {
        (decoratorAgent as TracingDecoratorAgentTestAccess).executeTool(
          tool,
          {},
          toolCall,
          baseContext,
          undefined,
          toolResultsForThisIteration,
          allToolResults
        );
        expect(mockSpan.end).toHaveBeenCalledWith();
      } finally {
        spy.mockRestore();
      }
    });

    it('should log warning and delegate to super when span creation throws', () => {
      const logWarningSpy = jest.spyOn(consoleUtils, 'logWarning').mockImplementation(() => {});
      mockTrace.span = jest.fn().mockImplementation(() => {
        throw new Error('span failed');
      });
      const tool = makeTool('{"status":"success"}');
      const toolResultsForThisIteration: ToolResult[] = [];
      const allToolResults: ToolResult[] = [];

      (decoratorAgent as TracingDecoratorAgentTestAccess).executeTool(
        tool,
        {},
        toolCall,
        baseContext,
        undefined,
        toolResultsForThisIteration,
        allToolResults
      );

      expect(logWarningSpy).toHaveBeenCalledWith(
        expect.stringContaining('Langfuse tracing failed for tool execution')
      );
      expect(toolResultsForThisIteration).toHaveLength(1);
      logWarningSpy.mockRestore();
    });
  });

  describe('getSystemPrompt and getRolePrompts fallback', () => {
    it('uses getPromptsForRole when wrapped agent is not RoleBasedAgent', async () => {
      const minimal = new MinimalAgent(agentConfig, mockProvider);
      const decorator = new TracingDecoratorAgent(minimal, tracingContext);

      const result = await decorator.propose('Test problem', {
        problem: 'Test problem',
        tracingContext,
      });

      expect(result).toBeDefined();
      expect(result.content).toBe('test response');
      expect(mockTrace.span).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'agent-propose-test-agent',
          metadata: expect.objectContaining({ agentRole: 'architect' }),
        })
      );
    });
  });
});

