import type { JudgeAgent } from '../../core/judge';
import type { OrchestratorHooks } from '../../core/orchestrator';
import type { StateManager } from '../../core/state-manager';
import { AGENT_ROLES } from '../../types/agent.types';
import {
  DebateState,
  DebateConfig,
  DEBATE_STATUS,
  SUMMARIZATION_METHODS,
  type Solution,
} from '../../types/debate.types';
import type { TracingContext } from '../../types/tracing.types';
import { enhanceProblemWithContext } from '../../utils/context-enhancer';
import { DEBATE_EVENTS } from '../events';
import { NodeContext } from '../node';
import { NODE_TYPES } from '../types';

import { SynthesisNode } from './synthesis-node';

jest.mock('../../utils/context-enhancer', () => ({
  enhanceProblemWithContext: jest.fn((problem: string) => problem),
}));

const mockEnhanceProblemWithContext = enhanceProblemWithContext as jest.MockedFunction<
  typeof enhanceProblemWithContext
>;

describe('SynthesisNode', () => {
  let node: SynthesisNode;
  let state: DebateState;
  let mockJudge: jest.Mocked<JudgeAgent>;
  let mockStateManager: jest.Mocked<StateManager>;
  let mockContext: NodeContext;

  const defaultSolution: Solution = {
    description: 'Final solution',
    tradeoffs: [],
    recommendations: [],
    confidence: 80,
    synthesizedBy: 'judge-1',
  };

  function createState(overrides: Partial<DebateState> = {}): DebateState {
    const s = new DebateState();
    s.id = 'debate-1';
    s.problem = 'Test problem';
    s.status = DEBATE_STATUS.RUNNING;
    s.currentRound = 1;
    s.rounds = [];
    s.createdAt = new Date();
    s.updatedAt = new Date();
    return Object.assign(s, overrides);
  }

  function createContext(overrides: Partial<NodeContext> = {}): NodeContext {
    return {
      state,
      config: {
        rounds: 3,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: false,
        timeoutPerRound: 300000,
      } as DebateConfig,
      agents: [],
      judge: mockJudge,
      stateManager: mockStateManager,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    state = createState();
    mockJudge = {
      prepareContext: jest.fn().mockResolvedValue({ context: { problem: state.problem } }),
      synthesize: jest.fn().mockResolvedValue(defaultSolution),
    } as unknown as jest.Mocked<JudgeAgent>;
    mockStateManager = {
      addJudgeSummary: jest.fn().mockResolvedValue(undefined),
      completeDebate: jest.fn().mockResolvedValue(undefined),
      getDebate: jest.fn().mockResolvedValue(state),
    } as unknown as jest.Mocked<StateManager>;
    mockContext = createContext();
    node = new SynthesisNode();
  });

  describe('nodeType', () => {
    it('should have nodeType SYNTHESIS', () => {
      expect(node.nodeType).toBe(NODE_TYPES.SYNTHESIS);
    });
  });

  describe('constructor', () => {
    it('should work without hooks', () => {
      const n = new SynthesisNode();
      expect(n.nodeType).toBe(NODE_TYPES.SYNTHESIS);
    });

    it('should accept optional hooks', () => {
      const hooks: OrchestratorHooks = {};
      const n = new SynthesisNode(hooks);
      expect(n.nodeType).toBe(NODE_TYPES.SYNTHESIS);
    });
  });

  describe('execute', () => {
    it('should emit COMPLETE with updated state on success', async () => {
      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.COMPLETE);
      expect(result.event.timestamp).toBeInstanceOf(Date);
      expect(result.updatedContext).toEqual({ state });
    });

    it('should call judge.prepareContext with state.rounds and tracingContext', async () => {
      const tracingContext = {} as TracingContext;
      mockContext = createContext({ tracingContext });

      await node.execute(mockContext);

      expect(mockJudge.prepareContext).toHaveBeenCalledWith(state.rounds, tracingContext);
    });

    it('should call addJudgeSummary when prepareContext returns a summary', async () => {
      const summary = {
        agentId: 'judge-1',
        agentRole: AGENT_ROLES.GENERALIST,
        summary: 'Summary text',
        metadata: {
          beforeChars: 100,
          afterChars: 50,
          method: SUMMARIZATION_METHODS.LENGTH_BASED,
          timestamp: new Date(),
        },
      };
      mockJudge.prepareContext.mockResolvedValue({
        context: { problem: state.problem },
        summary,
      });

      await node.execute(mockContext);

      expect(mockStateManager.addJudgeSummary).toHaveBeenCalledWith(state.id, summary);
    });

    it('should not call addJudgeSummary when prepareContext returns no summary', async () => {
      mockJudge.prepareContext.mockResolvedValue({ context: { problem: state.problem } });

      await node.execute(mockContext);

      expect(mockStateManager.addJudgeSummary).not.toHaveBeenCalled();
    });

    it('should call enhanceProblemWithContext with problem, context, and contextDirectory', async () => {
      state.context = 'extra context';
      mockContext = createContext({ contextDirectory: '/path/to/ctx' });

      await node.execute(mockContext);

      expect(mockEnhanceProblemWithContext).toHaveBeenCalledWith(
        state.problem,
        state.context,
        '/path/to/ctx'
      );
    });

    it('should call judge.synthesize with enhanced problem, rounds, and built context', async () => {
      mockEnhanceProblemWithContext.mockReturnValue('enhanced problem');
      state.rounds = [{ roundNumber: 1, contributions: [], timestamp: new Date() }];

      await node.execute(mockContext);

      expect(mockJudge.synthesize).toHaveBeenCalledWith(
        'enhanced problem',
        state.rounds,
        expect.objectContaining({
          problem: state.problem,
          includeFullHistory: false,
        })
      );
    });

    it('should call stateManager.completeDebate with state id and solution', async () => {
      await node.execute(mockContext);

      expect(mockStateManager.completeDebate).toHaveBeenCalledWith(state.id, defaultSolution);
    });

    it('should throw when getDebate returns null after synthesis', async () => {
      mockStateManager.getDebate.mockResolvedValue(null);

      await expect(node.execute(mockContext)).rejects.toThrow(
        `Debate ${state.id} not found after synthesis`
      );
    });

    it('should call onSynthesisStart and onSynthesisComplete when hooks provided', async () => {
      const onSynthesisStart = jest.fn();
      const onSynthesisComplete = jest.fn();
      const hooks: OrchestratorHooks = { onSynthesisStart, onSynthesisComplete };
      node = new SynthesisNode(hooks);

      await node.execute(mockContext);

      expect(onSynthesisStart).toHaveBeenCalledTimes(1);
      expect(onSynthesisComplete).toHaveBeenCalledTimes(1);
    });

    it('should not throw when hooks are provided but callbacks are undefined', async () => {
      node = new SynthesisNode({});

      await expect(node.execute(mockContext)).resolves.toBeDefined();
    });
  });

  describe('buildContext (via synthesize call)', () => {
    it('should include context in DebateContext when state.context is defined', async () => {
      state.context = 'extra';
      mockContext = createContext();

      await node.execute(mockContext);

      const call = mockJudge.synthesize.mock.calls[0];
      expect(call).toBeDefined();
      expect(call![2]).toHaveProperty('context', 'extra');
    });

    it('should include contextDirectory when provided', async () => {
      mockContext = createContext({ contextDirectory: '/ctx/dir' });

      await node.execute(mockContext);

      const call = mockJudge.synthesize.mock.calls[0];
      expect(call).toBeDefined();
      expect(call![2]).toHaveProperty('contextDirectory', '/ctx/dir');
    });

    it('should include history when config.includeFullHistory is true', async () => {
      state.rounds = [{ roundNumber: 1, contributions: [], timestamp: new Date() }];
      mockContext = createContext({
        config: {
          rounds: 3,
          terminationCondition: { type: 'fixed' },
          synthesisMethod: 'judge',
          includeFullHistory: true,
          timeoutPerRound: 300000,
        } as DebateConfig,
      });

      await node.execute(mockContext);

      const call = mockJudge.synthesize.mock.calls[0];
      expect(call).toBeDefined();
      expect(call![2]).toHaveProperty('history', state.rounds);
      expect(call![2]).toHaveProperty('includeFullHistory', true);
    });

    it('should include clarifications when state has clarifications', async () => {
      const clarifications = [
        {
          agentId: 'a1',
          agentName: 'Agent 1',
          role: 'architect' as const,
          items: [{ id: 'q1', question: 'Q?', answer: 'A' }],
        },
      ];
      state.clarifications = clarifications;
      mockContext = createContext();

      await node.execute(mockContext);

      const call = mockJudge.synthesize.mock.calls[0];
      expect(call).toBeDefined();
      expect(call![2]).toHaveProperty('clarifications', clarifications);
    });

    it('should include tracingContext when provided', async () => {
      const tracingContext = { traceId: 'trace-1' } as unknown as TracingContext;
      mockContext = createContext({ tracingContext });

      await node.execute(mockContext);

      const call = mockJudge.synthesize.mock.calls[0];
      expect(call).toBeDefined();
      expect(call![2]).toHaveProperty('tracingContext', tracingContext);
    });

    it('should omit context when state.context is undefined', async () => {
      delete state.context;
      mockContext = createContext();

      await node.execute(mockContext);

      const call = mockJudge.synthesize.mock.calls[0];
      expect(call).toBeDefined();
      expect(call![2]).not.toHaveProperty('context');
    });

    it('should omit clarifications when state has no clarifications', async () => {
      delete state.clarifications;
      mockContext = createContext();

      await node.execute(mockContext);

      const call = mockJudge.synthesize.mock.calls[0];
      expect(call).toBeDefined();
      expect(call![2]).not.toHaveProperty('clarifications');
    });
  });
});
