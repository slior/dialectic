import { SummarizationNode } from './summarization-node';
import {
  DebateState,
  DebateConfig,
  DebateContext,
  DEBATE_STATUS,
  SUMMARIZATION_METHODS,
  type DebateSummary,
} from '../../types/debate.types';
import { NodeContext } from '../node';
import { DEBATE_EVENTS } from '../events';
import { NODE_TYPES } from '../types';
import type { Agent } from '../../core/agent';
import type { StateManager } from '../../core/state-manager';
import type { OrchestratorHooks } from '../../core/orchestrator';
import type { TracingContext } from '../../types/tracing.types';

describe('SummarizationNode', () => {
  let node: SummarizationNode;
  let state: DebateState;
  let mockStateManager: jest.Mocked<StateManager>;
  let mockContext: NodeContext;

  function createState(overrides: Partial<DebateState> = {}): DebateState {
    const s = new DebateState();
    s.id = 'debate-1';
    s.problem = 'Test problem';
    s.status = DEBATE_STATUS.RUNNING;
    s.currentRound = 1;
    s.rounds = [
      { roundNumber: 1, contributions: [], timestamp: new Date() },
    ];
    s.createdAt = new Date();
    s.updatedAt = new Date();
    return Object.assign(s, overrides);
  }

  function createMockAgent(
    id: string,
    name: string,
    prepareContextResult: { context: DebateContext; summary?: DebateSummary }
  ): jest.Mocked<Agent> {
    return {
      config: { id, name },
      prepareContext: jest.fn().mockResolvedValue(prepareContextResult),
    } as unknown as jest.Mocked<Agent>;
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
      judge: {} as NodeContext['judge'],
      stateManager: mockStateManager,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    state = createState();
    mockStateManager = {
      addSummary: jest.fn().mockResolvedValue(undefined),
      getDebate: jest.fn().mockResolvedValue(state),
    } as unknown as jest.Mocked<StateManager>;
    mockContext = createContext();
    node = new SummarizationNode();
  });

  describe('nodeType', () => {
    it('should have nodeType SUMMARIZATION', () => {
      expect(node.nodeType).toBe(NODE_TYPES.SUMMARIZATION);
    });
  });

  describe('constructor', () => {
    it('should work without hooks', () => {
      const n = new SummarizationNode();
      expect(n.nodeType).toBe(NODE_TYPES.SUMMARIZATION);
    });

    it('should accept optional hooks', () => {
      const hooks: OrchestratorHooks = {};
      const n = new SummarizationNode(hooks);
      expect(n.nodeType).toBe(NODE_TYPES.SUMMARIZATION);
    });
  });

  describe('execute', () => {
    it('should emit CONTEXTS_READY with updated state and preparedContexts when no agents', async () => {
      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.CONTEXTS_READY);
      expect(result.event.timestamp).toBeInstanceOf(Date);
      expect(result.updatedContext).toEqual({
        state,
        preparedContexts: new Map(),
      });
      expect(mockStateManager.getDebate).toHaveBeenCalledWith(state.id);
    });

    it('should call processAgentSummarization for each agent and set preparedContexts', async () => {
      const agent1 = createMockAgent('agent-1', 'Agent 1', {
        context: { problem: state.problem },
      });
      const agent2 = createMockAgent('agent-2', 'Agent 2', {
        context: { problem: state.problem },
      });
      mockContext = createContext({ agents: [agent1, agent2] });

      const result = await node.execute(mockContext);

      expect(agent1.prepareContext).toHaveBeenCalledWith(
        expect.objectContaining({ problem: state.problem }),
        1
      );
      expect(agent2.prepareContext).toHaveBeenCalledWith(
        expect.objectContaining({ problem: state.problem }),
        1
      );
      expect(result.updatedContext?.preparedContexts?.get('agent-1')).toEqual({
        problem: state.problem,
      });
      expect(result.updatedContext?.preparedContexts?.get('agent-2')).toEqual({
        problem: state.problem,
      });
    });

    it('should call addSummary and onSummarizationComplete when agent returns summary', async () => {
      const summary: DebateSummary = {
        agentId: 'agent-1',
        agentRole: 'architect',
        summary: 'Summary text',
        metadata: {
          beforeChars: 1000,
          afterChars: 200,
          method: SUMMARIZATION_METHODS.LENGTH_BASED,
          timestamp: new Date(),
        },
      };
      const agent = createMockAgent('agent-1', 'Agent 1', {
        context: { problem: state.problem },
        summary,
      });
      mockContext = createContext({ agents: [agent] });

      await node.execute(mockContext);

      expect(mockStateManager.addSummary).toHaveBeenCalledWith(state.id, summary);
    });

    it('should not call addSummary when agent returns no summary', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1', {
        context: { problem: state.problem },
      });
      mockContext = createContext({ agents: [agent] });

      await node.execute(mockContext);

      expect(mockStateManager.addSummary).not.toHaveBeenCalled();
    });

    it('should throw when getDebate returns null after summarization', async () => {
      mockStateManager.getDebate.mockResolvedValue(null);

      await expect(node.execute(mockContext)).rejects.toThrow(
        `Debate ${state.id} not found after summarization`
      );
    });

    it('should call onSummarizationStart for each agent when hooks provided', async () => {
      const onSummarizationStart = jest.fn();
      const hooks: OrchestratorHooks = { onSummarizationStart };
      node = new SummarizationNode(hooks);
      const agent = createMockAgent('agent-1', 'Agent 1', {
        context: { problem: state.problem },
      });
      mockContext = createContext({ agents: [agent] });

      await node.execute(mockContext);

      expect(onSummarizationStart).toHaveBeenCalledWith('Agent 1');
    });

    it('should call onSummarizationComplete with beforeChars and afterChars when agent returns summary and hooks provided', async () => {
      const onSummarizationComplete = jest.fn();
      const hooks: OrchestratorHooks = { onSummarizationComplete };
      node = new SummarizationNode(hooks);
      const summary: DebateSummary = {
        agentId: 'agent-1',
        agentRole: 'architect',
        summary: 'Summary text',
        metadata: {
          beforeChars: 1000,
          afterChars: 200,
          method: SUMMARIZATION_METHODS.LENGTH_BASED,
          timestamp: new Date(),
        },
      };
      const agent = createMockAgent('agent-1', 'Agent 1', {
        context: { problem: state.problem },
        summary,
      });
      mockContext = createContext({ agents: [agent] });

      await node.execute(mockContext);

      expect(onSummarizationComplete).toHaveBeenCalledWith('Agent 1', 1000, 200);
    });

    it('should call onSummarizationEnd when agent returns no summary and hooks provided', async () => {
      const onSummarizationEnd = jest.fn();
      const hooks: OrchestratorHooks = { onSummarizationEnd };
      node = new SummarizationNode(hooks);
      const agent = createMockAgent('agent-1', 'Agent 1', {
        context: { problem: state.problem },
      });
      mockContext = createContext({ agents: [agent] });

      await node.execute(mockContext);

      expect(onSummarizationEnd).toHaveBeenCalledWith('Agent 1');
    });

    it('should not throw when hooks are provided but callbacks are undefined', async () => {
      node = new SummarizationNode({});

      await expect(node.execute(mockContext)).resolves.toBeDefined();
    });
  });

  describe('buildContext (via prepareContext call)', () => {
    it('should include context in baseContext when state.context is defined', async () => {
      state.context = 'extra context';
      const agent = createMockAgent('agent-1', 'Agent 1', {
        context: { problem: state.problem },
      });
      mockContext = createContext({ agents: [agent] });

      await node.execute(mockContext);

      expect(agent.prepareContext).toHaveBeenCalledWith(
        expect.objectContaining({ context: 'extra context' }),
        1
      );
    });

    it('should include contextDirectory when provided', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1', {
        context: { problem: state.problem },
      });
      mockContext = createContext({
        agents: [agent],
        contextDirectory: '/path/to/context',
      });

      await node.execute(mockContext);

      expect(agent.prepareContext).toHaveBeenCalledWith(
        expect.objectContaining({ contextDirectory: '/path/to/context' }),
        1
      );
    });

    it('should include history when config.includeFullHistory is true', async () => {
      state.rounds = [
        {
          roundNumber: 1,
          contributions: [],
          timestamp: new Date(),
        },
      ];
      const agent = createMockAgent('agent-1', 'Agent 1', {
        context: { problem: state.problem },
      });
      mockContext = createContext({
        agents: [agent],
        config: {
          rounds: 3,
          terminationCondition: { type: 'fixed' },
          synthesisMethod: 'judge',
          includeFullHistory: true,
          timeoutPerRound: 300000,
        } as DebateConfig,
      });

      await node.execute(mockContext);

      expect(agent.prepareContext).toHaveBeenCalledWith(
        expect.objectContaining({
          history: state.rounds,
          includeFullHistory: true,
        }),
        1
      );
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
      const agent = createMockAgent('agent-1', 'Agent 1', {
        context: { problem: state.problem },
      });
      mockContext = createContext({ agents: [agent] });

      await node.execute(mockContext);

      expect(agent.prepareContext).toHaveBeenCalledWith(
        expect.objectContaining({ clarifications }),
        1
      );
    });

    it('should include tracingContext when provided', async () => {
      const tracingContext = { traceId: 'trace-1' } as unknown as TracingContext;
      const agent = createMockAgent('agent-1', 'Agent 1', {
        context: { problem: state.problem },
      });
      mockContext = createContext({
        agents: [agent],
        tracingContext,
      });

      await node.execute(mockContext);

      expect(agent.prepareContext).toHaveBeenCalledWith(
        expect.objectContaining({ tracingContext }),
        1
      );
    });

    it('should omit context when state.context is undefined', async () => {
      delete state.context;
      const agent = createMockAgent('agent-1', 'Agent 1', {
        context: { problem: state.problem },
      });
      mockContext = createContext({ agents: [agent] });

      await node.execute(mockContext);

      const callArg = (agent.prepareContext as jest.Mock).mock.calls[0][0];
      expect(callArg).not.toHaveProperty('context');
    });

    it('should omit clarifications when state has no clarifications', async () => {
      delete state.clarifications;
      const agent = createMockAgent('agent-1', 'Agent 1', {
        context: { problem: state.problem },
      });
      mockContext = createContext({ agents: [agent] });

      await node.execute(mockContext);

      const callArg = (agent.prepareContext as jest.Mock).mock.calls[0][0];
      expect(callArg).not.toHaveProperty('clarifications');
    });
  });
});
