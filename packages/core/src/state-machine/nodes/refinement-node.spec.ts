import type { Agent } from '../../core/agent';
import type { OrchestratorHooks } from '../../core/orchestrator';
import type { StateManager } from '../../core/state-manager';
import { AGENT_ROLES } from '../../types/agent.types';
import {
  DebateState,
  DebateConfig,
  DEBATE_STATUS,
  CONTRIBUTION_TYPES,
  type Contribution,
  type DebateRound,
} from '../../types/debate.types';
import type { TracingContext } from '../../types/tracing.types';
import { DEBATE_EVENTS } from '../events';
import { NodeContext } from '../node';
import { NODE_TYPES } from '../types';

import { RefinementNode } from './refinement-node';

describe('RefinementNode', () => {
  let node: RefinementNode;
  let state: DebateState;
  let mockStateManager: jest.Mocked<StateManager>;
  let mockContext: NodeContext;

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

  function createMockAgent(
    id: string,
    name: string,
    refineResult: { content: string; metadata: Record<string, unknown> }
  ): jest.Mocked<Agent> {
    return {
      config: { id, name, role: AGENT_ROLES.ARCHITECT, model: 'gpt-4', provider: 'openai', temperature: 0.7 },
      refine: jest.fn().mockResolvedValue(refineResult),
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
      addContribution: jest.fn().mockResolvedValue(undefined),
      getDebate: jest.fn().mockResolvedValue(state),
    } as unknown as jest.Mocked<StateManager>;
    mockContext = createContext();
    node = new RefinementNode();
  });

  describe('nodeType', () => {
    it('should have nodeType REFINEMENT', () => {
      expect(node.nodeType).toBe(NODE_TYPES.REFINEMENT);
    });
  });

  describe('constructor', () => {
    it('should work without hooks', () => {
      const n = new RefinementNode();
      expect(n.nodeType).toBe(NODE_TYPES.REFINEMENT);
    });

    it('should accept optional hooks', () => {
      const hooks: OrchestratorHooks = {};
      const n = new RefinementNode(hooks);
      expect(n.nodeType).toBe(NODE_TYPES.REFINEMENT);
    });
  });

  describe('execute', () => {
    it('should emit REFINEMENTS_COMPLETE with updated state when no agents', async () => {
      mockContext = createContext({ agents: [] });

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.REFINEMENTS_COMPLETE);
      expect(result.event.timestamp).toBeInstanceOf(Date);
      expect(result.updatedContext).toEqual({ state });
      expect(mockStateManager.addContribution).not.toHaveBeenCalled();
      expect(mockStateManager.getDebate).toHaveBeenCalledWith(state.id);
    });

    it('should call agent.refine and addContribution for one agent with no prior proposal', async () => {
      const agent = createMockAgent('agent-1', 'Architect', {
        content: 'Refined content',
        metadata: { latencyMs: 100 },
      });
      state.rounds = [
        { roundNumber: 1, contributions: [], timestamp: new Date() },
      ];
      mockContext = createContext({ agents: [agent], state });

      const result = await node.execute(mockContext);

      expect(agent.refine).toHaveBeenCalledWith(
        { content: '', metadata: {} },
        [],
        expect.objectContaining({ problem: state.problem }),
        state
      );
      expect(mockStateManager.addContribution).toHaveBeenCalledTimes(1);
      const contrib = (mockStateManager.addContribution as jest.Mock).mock.calls[0][1] as Contribution;
      expect(contrib.agentId).toBe('agent-1');
      expect(contrib.type).toBe(CONTRIBUTION_TYPES.REFINEMENT);
      expect(contrib.content).toBe('Refined content');
      expect(contrib.metadata.latencyMs).toBe(100);
      expect(contrib.metadata.model).toBe('gpt-4');
      expect(result.event.type).toBe(DEBATE_EVENTS.REFINEMENTS_COMPLETE);
    });

    it('should use proposal and critiques when latest round has them', async () => {
      const proposal: Contribution = {
        agentId: 'agent-1',
        agentRole: AGENT_ROLES.ARCHITECT,
        type: CONTRIBUTION_TYPES.PROPOSAL,
        content: 'My proposal',
        metadata: {},
      };
      const critique: Contribution = {
        agentId: 'agent-2',
        agentRole: AGENT_ROLES.SECURITY,
        type: CONTRIBUTION_TYPES.CRITIQUE,
        content: 'Security concern',
        targetAgentId: 'agent-1',
        metadata: {},
      };
      const latestRound: DebateRound = {
        roundNumber: 1,
        contributions: [proposal, critique],
        timestamp: new Date(),
      };
      state.rounds = [latestRound];
      const agent = createMockAgent('agent-1', 'Architect', {
        content: 'Refined after feedback',
        metadata: {},
      });
      mockContext = createContext({ agents: [agent], state });

      await node.execute(mockContext);

      expect(agent.refine).toHaveBeenCalledWith(
        { content: 'My proposal', metadata: {} },
        [{ content: 'Security concern', metadata: {} }],
        expect.any(Object),
        state
      );
      const contrib = (mockStateManager.addContribution as jest.Mock).mock.calls[0][1] as Contribution;
      expect(contrib.content).toBe('Refined after feedback');
      expect(contrib.metadata.latencyMs).toBeDefined();
    });

    it('should compute latencyMs when refined.metadata does not provide it', async () => {
      state.rounds = [{ roundNumber: 1, contributions: [], timestamp: new Date() }];
      const agent = createMockAgent('agent-1', 'Architect', {
        content: 'Refined',
        metadata: {}, // no latencyMs
      });
      mockContext = createContext({ agents: [agent], state });

      await node.execute(mockContext);

      const contrib = (mockStateManager.addContribution as jest.Mock).mock.calls[0][1] as Contribution;
      expect(contrib.metadata.latencyMs).toBeDefined();
      expect(typeof contrib.metadata.latencyMs).toBe('number');
    });

    it('should use preparedContexts when provided for an agent', async () => {
      const preparedCtx = { problem: 'Prepared problem', includeFullHistory: false };
      const preparedContexts = new Map<string, typeof preparedCtx>();
      preparedContexts.set('agent-1', preparedCtx);
      state.rounds = [{ roundNumber: 1, contributions: [], timestamp: new Date() }];
      const agent = createMockAgent('agent-1', 'Architect', {
        content: 'Refined',
        metadata: {},
      });
      mockContext = createContext({
        agents: [agent],
        state,
        preparedContexts,
      });

      await node.execute(mockContext);

      expect(agent.refine).toHaveBeenCalledWith(
        { content: '', metadata: {} },
        [],
        preparedCtx,
        state
      );
    });

    it('should build context with state.context when present', async () => {
      state.context = 'extra context';
      state.rounds = [{ roundNumber: 1, contributions: [], timestamp: new Date() }];
      const agent = createMockAgent('agent-1', 'Architect', {
        content: 'Refined',
        metadata: {},
      });
      mockContext = createContext({ agents: [agent], state });

      await node.execute(mockContext);

      expect(agent.refine).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Array),
        expect.objectContaining({ problem: state.problem, context: 'extra context' }),
        state
      );
    });

    it('should build context with contextDirectory when provided', async () => {
      state.rounds = [{ roundNumber: 1, contributions: [], timestamp: new Date() }];
      const agent = createMockAgent('agent-1', 'Architect', {
        content: 'Refined',
        metadata: {},
      });
      mockContext = createContext({
        agents: [agent],
        state,
        contextDirectory: '/path/to/ctx',
      });

      await node.execute(mockContext);

      expect(agent.refine).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Array),
        expect.objectContaining({ contextDirectory: '/path/to/ctx' }),
        state
      );
    });

    it('should build context with history when includeFullHistory is true', async () => {
      const round: DebateRound = {
        roundNumber: 1,
        contributions: [],
        timestamp: new Date(),
      };
      state.rounds = [round];
      mockContext = createContext({
        state,
        config: {
          ...mockContext.config,
          includeFullHistory: true,
        } as DebateConfig,
      });
      const agent = createMockAgent('agent-1', 'Architect', {
        content: 'Refined',
        metadata: {},
      });
      mockContext = createContext({
        ...mockContext,
        agents: [agent],
        config: { ...mockContext.config, includeFullHistory: true } as DebateConfig,
      });

      await node.execute(mockContext);

      expect(agent.refine).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Array),
        expect.objectContaining({ history: state.rounds, includeFullHistory: true }),
        state
      );
    });

    it('should build context with clarifications when state has clarifications', async () => {
      state.clarifications = [
        { agentId: 'agent-1', agentName: 'Architect', role: AGENT_ROLES.ARCHITECT, items: [] },
      ];
      state.rounds = [{ roundNumber: 1, contributions: [], timestamp: new Date() }];
      const agent = createMockAgent('agent-1', 'Architect', {
        content: 'Refined',
        metadata: {},
      });
      mockContext = createContext({ agents: [agent], state });

      await node.execute(mockContext);

      expect(agent.refine).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Array),
        expect.objectContaining({ clarifications: state.clarifications }),
        state
      );
    });

    it('should build context with tracingContext when provided', async () => {
      const tracingContext = {} as TracingContext;
      state.rounds = [{ roundNumber: 1, contributions: [], timestamp: new Date() }];
      const agent = createMockAgent('agent-1', 'Architect', {
        content: 'Refined',
        metadata: {},
      });
      mockContext = createContext({
        agents: [agent],
        state,
        tracingContext,
      });

      await node.execute(mockContext);

      expect(agent.refine).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Array),
        expect.objectContaining({ tracingContext }),
        state
      );
    });

    it('should throw when getDebate returns null after refinement', async () => {
      mockStateManager.getDebate.mockResolvedValue(null);
      state.rounds = [{ roundNumber: 1, contributions: [], timestamp: new Date() }];
      const agent = createMockAgent('agent-1', 'Architect', {
        content: 'Refined',
        metadata: {},
      });
      mockContext = createContext({ agents: [agent], state });

      await expect(node.execute(mockContext)).rejects.toThrow(
        `Debate ${state.id} not found after refinement phase`
      );
    });

    it('should call all hooks when provided', async () => {
      const onPhaseStart = jest.fn();
      const onAgentStart = jest.fn();
      const onContributionCreated = jest.fn();
      const onAgentComplete = jest.fn();
      const onPhaseComplete = jest.fn();
      node = new RefinementNode({
        onPhaseStart,
        onAgentStart,
        onContributionCreated,
        onAgentComplete,
        onPhaseComplete,
      });
      state.rounds = [{ roundNumber: 1, contributions: [], timestamp: new Date() }];
      const agent = createMockAgent('agent-1', 'Architect', {
        content: 'Refined',
        metadata: {},
      });
      mockContext = createContext({ agents: [agent], state });

      await node.execute(mockContext);

      expect(onPhaseStart).toHaveBeenCalledWith(1, CONTRIBUTION_TYPES.REFINEMENT, 1);
      expect(onAgentStart).toHaveBeenCalledWith('Architect', 'refining');
      expect(onContributionCreated).toHaveBeenCalledWith(
        expect.objectContaining({ type: CONTRIBUTION_TYPES.REFINEMENT, content: 'Refined' }),
        1
      );
      expect(onAgentComplete).toHaveBeenCalledWith('Architect', 'refining');
      expect(onPhaseComplete).toHaveBeenCalledWith(1, CONTRIBUTION_TYPES.REFINEMENT);
    });

    it('should run refinement for multiple agents in parallel', async () => {
      const agent1 = createMockAgent('agent-1', 'Architect', {
        content: 'Refined 1',
        metadata: {},
      });
      const agent2 = createMockAgent('agent-2', 'Security', {
        content: 'Refined 2',
        metadata: {},
      });
      const proposal1: Contribution = {
        agentId: 'agent-1',
        agentRole: AGENT_ROLES.ARCHITECT,
        type: CONTRIBUTION_TYPES.PROPOSAL,
        content: 'Proposal 1',
        metadata: {},
      };
      const proposal2: Contribution = {
        agentId: 'agent-2',
        agentRole: AGENT_ROLES.SECURITY,
        type: CONTRIBUTION_TYPES.PROPOSAL,
        content: 'Proposal 2',
        metadata: {},
      };
      state.rounds = [
        {
          roundNumber: 1,
          contributions: [proposal1, proposal2],
          timestamp: new Date(),
        },
      ];
      mockContext = createContext({ agents: [agent1, agent2], state });

      await node.execute(mockContext);

      expect(agent1.refine).toHaveBeenCalledWith(
        { content: 'Proposal 1', metadata: {} },
        [],
        expect.any(Object),
        state
      );
      expect(agent2.refine).toHaveBeenCalledWith(
        { content: 'Proposal 2', metadata: {} },
        [],
        expect.any(Object),
        state
      );
      expect(mockStateManager.addContribution).toHaveBeenCalledTimes(2);
    });

    it('should not include targetAgentId on refinement contribution', async () => {
      state.rounds = [{ roundNumber: 1, contributions: [], timestamp: new Date() }];
      const agent = createMockAgent('agent-1', 'Architect', {
        content: 'Refined',
        metadata: {},
      });
      mockContext = createContext({ agents: [agent], state });

      await node.execute(mockContext);

      const contrib = (mockStateManager.addContribution as jest.Mock).mock.calls[0][1] as Contribution;
      expect(contrib.targetAgentId).toBeUndefined();
    });

    it('should use getLatestRound undefined when state has no rounds', async () => {
      state.rounds = [];
      const agent = createMockAgent('agent-1', 'Architect', {
        content: 'Refined',
        metadata: {},
      });
      mockContext = createContext({ agents: [agent], state });

      await node.execute(mockContext);

      expect(agent.refine).toHaveBeenCalledWith(
        { content: '', metadata: {} },
        [],
        expect.any(Object),
        state
      );
    });
  });
});
