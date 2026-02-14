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

import { ProposalNode } from './proposal-node';

jest.mock('../../utils/context-enhancer', () => ({
  enhanceProblemWithContext: jest.fn((problem: string) => problem),
}));

jest.mock('../../utils/console', () => ({
  logWarning: jest.fn(),
}));

const { enhanceProblemWithContext } = jest.requireMock('../../utils/context-enhancer');
const { logWarning } = jest.requireMock('../../utils/console');

describe('ProposalNode', () => {
  let node: ProposalNode;
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
    role: string = AGENT_ROLES.ARCHITECT,
    model: string = 'test-model',
    proposeResult: { content: string; metadata: Contribution['metadata'] }
  ): jest.Mocked<Agent> {
    return {
      config: { id, name, role, model },
      propose: jest.fn().mockResolvedValue(proposeResult),
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
    (enhanceProblemWithContext as jest.Mock).mockImplementation((p: string) => p);
    state = createState();
    mockStateManager = {
      addContribution: jest.fn().mockResolvedValue(undefined),
      getDebate: jest.fn().mockResolvedValue(state),
    } as unknown as jest.Mocked<StateManager>;
    mockContext = createContext();
    node = new ProposalNode();
  });

  describe('nodeType', () => {
    it('should have nodeType PROPOSAL', () => {
      expect(node.nodeType).toBe(NODE_TYPES.PROPOSAL);
    });
  });

  describe('constructor', () => {
    it('should work without hooks', () => {
      const n = new ProposalNode();
      expect(n.nodeType).toBe(NODE_TYPES.PROPOSAL);
    });

    it('should accept optional hooks', () => {
      const hooks: OrchestratorHooks = {};
      const n = new ProposalNode(hooks);
      expect(n.nodeType).toBe(NODE_TYPES.PROPOSAL);
    });
  });

  describe('execute', () => {
    it('should emit PROPOSALS_COMPLETE with updated state when round 1 and one agent', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'gpt-4', {
        content: 'My proposal',
        metadata: { tokensUsed: 10, latencyMs: 100 },
      });
      mockContext = createContext({ agents: [agent] });

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.PROPOSALS_COMPLETE);
      expect(result.event.timestamp).toBeInstanceOf(Date);
      expect(result.updatedContext).toEqual({ state });
      expect(agent.propose).toHaveBeenCalledTimes(1);
      expect(mockStateManager.addContribution).toHaveBeenCalledTimes(1);
      expect(mockStateManager.addContribution).toHaveBeenCalledWith(
        state.id,
        expect.objectContaining({
          agentId: 'agent-1',
          type: CONTRIBUTION_TYPES.PROPOSAL,
          content: 'My proposal',
          metadata: expect.objectContaining({ model: 'gpt-4', latencyMs: 100 }),
        })
      );
      expect(mockStateManager.getDebate).toHaveBeenCalledWith(state.id);
    });

    it('should use buildContext when preparedContexts does not have agent id', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'gpt-4', {
        content: 'Proposal',
        metadata: {},
      });
      mockContext = createContext({
        agents: [agent],
        preparedContexts: new Map([['other-agent', { problem: 'Other' }]]),
      });

      await node.execute(mockContext);

      expect(agent.propose).toHaveBeenCalledWith(
        state.problem,
        expect.objectContaining({
          problem: state.problem,
          includeFullHistory: false,
        }),
        state
      );
      expect(enhanceProblemWithContext).toHaveBeenCalledWith(state.problem, state.context, undefined);
    });

    it('should use preparedContext when preparedContexts has agent id', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'gpt-4', {
        content: 'Proposal',
        metadata: {},
      });
      const preparedCtx = { problem: 'Prepared problem', includeFullHistory: true };
      mockContext = createContext({
        agents: [agent],
        preparedContexts: new Map([['agent-1', preparedCtx]]),
      });

      await node.execute(mockContext);

      expect(agent.propose).toHaveBeenCalledWith(
        state.problem,
        preparedCtx,
        state
      );
    });

    it('should compute latencyMs when proposal metadata has no latencyMs', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'model', {
        content: 'Proposal',
        metadata: { tokensUsed: 5 },
      });
      mockContext = createContext({ agents: [agent] });

      await node.execute(mockContext);

      const contrib = (mockStateManager.addContribution as jest.Mock).mock.calls[0][1];
      expect(contrib.metadata).toHaveProperty('latencyMs');
      expect(typeof contrib.metadata.latencyMs).toBe('number');
      expect(contrib.metadata.model).toBe('model');
    });

    it('should include contextDirectory and tracingContext in context when provided', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'gpt-4', {
        content: 'P',
        metadata: {},
      });
      const contextDir = '/path/to/context';
      const tracingCtx = {} as TracingContext;
      state = createState({ context: 'extra context' });
      mockContext = createContext({
        state,
        agents: [agent],
        contextDirectory: contextDir,
        tracingContext: tracingCtx,
      });

      await node.execute(mockContext);

      expect(enhanceProblemWithContext).toHaveBeenCalledWith(state.problem, 'extra context', contextDir);
      expect(agent.propose).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          contextDirectory: contextDir,
          tracingContext: tracingCtx,
          context: 'extra context',
        }),
        state
      );
    });

    it('should include history and clarifications when state has them', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'gpt-4', {
        content: 'P',
        metadata: {},
      });
      const rounds: DebateRound[] = [
        { roundNumber: 1, contributions: [], timestamp: new Date() },
      ];
      state = createState({
        rounds,
        context: 'ctx',
        clarifications: [{ agentId: 'a1', agentName: 'A1', role: AGENT_ROLES.ARCHITECT, items: [] }],
      });
      mockContext = createContext({
        state,
        agents: [agent],
        config: { ...mockContext.config, includeFullHistory: true } as DebateConfig,
      });

      await node.execute(mockContext);

      expect(agent.propose).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          history: rounds,
          includeFullHistory: true,
          clarifications: state.clarifications,
        }),
        state
      );
    });

    it('should use prevRefinement content when round > 1 and refinement exists', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'gpt-4', {
        content: 'LLM proposal',
        metadata: {},
      });
      const round1WithRefinement: DebateRound = {
        roundNumber: 1,
        contributions: [
          {
            agentId: 'agent-1',
            agentRole: AGENT_ROLES.ARCHITECT,
            type: CONTRIBUTION_TYPES.REFINEMENT,
            content: 'Carried refinement content',
            metadata: { tokensUsed: 1 },
          },
        ],
        timestamp: new Date(),
      };
      state = createState({
        currentRound: 2,
        rounds: [
          round1WithRefinement,
          { roundNumber: 2, contributions: [], timestamp: new Date() },
        ],
      });
      mockContext = createContext({ state, agents: [agent] });

      const result = await node.execute(mockContext);

      expect(agent.propose).not.toHaveBeenCalled();
      expect(mockStateManager.addContribution).toHaveBeenCalledWith(
        state.id,
        expect.objectContaining({
          agentId: 'agent-1',
          type: CONTRIBUTION_TYPES.PROPOSAL,
          content: 'Carried refinement content',
          metadata: expect.objectContaining({ latencyMs: 0, tokensUsed: 0 }),
        })
      );
      expect(result.event.type).toBe(DEBATE_EVENTS.PROPOSALS_COMPLETE);
    });

    it('should fall back to LLM and log warning when round > 1 and no refinement for agent', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'gpt-4', {
        content: 'Fallback proposal',
        metadata: {},
      });
      const prevRound: DebateRound = {
        roundNumber: 1,
        contributions: [
          {
            agentId: 'other-agent',
            agentRole: AGENT_ROLES.ARCHITECT,
            type: CONTRIBUTION_TYPES.REFINEMENT,
            content: 'Other refinement',
            metadata: {},
          },
        ],
        timestamp: new Date(),
      };
      state = createState({
        currentRound: 2,
        rounds: [
          { roundNumber: 1, contributions: [], timestamp: new Date() },
          prevRound,
        ],
      });
      mockContext = createContext({ state, agents: [agent] });

      const result = await node.execute(mockContext);

      expect(logWarning).toHaveBeenCalledWith(
        '[Round 2] Missing previous refinement for Agent 1; falling back to LLM proposal.'
      );
      expect(agent.propose).toHaveBeenCalled();
      expect(mockStateManager.addContribution).toHaveBeenCalledWith(
        state.id,
        expect.objectContaining({ content: 'Fallback proposal' })
      );
      expect(result.event.type).toBe(DEBATE_EVENTS.PROPOSALS_COMPLETE);
    });

    it('should throw when getDebate returns null after proposals', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'gpt-4', {
        content: 'P',
        metadata: {},
      });
      mockStateManager.getDebate!.mockResolvedValue(null);
      mockContext = createContext({ agents: [agent] });

      await expect(node.execute(mockContext)).rejects.toThrow(
        'Debate debate-1 not found after proposal phase'
      );
    });

    it('should throw when getDebate returns undefined', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'gpt-4', {
        content: 'P',
        metadata: {},
      });
      mockStateManager.getDebate!.mockResolvedValue(undefined as unknown as DebateState);
      mockContext = createContext({ agents: [agent] });

      await expect(node.execute(mockContext)).rejects.toThrow(
        'Debate debate-1 not found after proposal phase'
      );
    });

    it('should call all hooks when provided', async () => {
      const onPhaseStart = jest.fn();
      const onAgentStart = jest.fn();
      const onContributionCreated = jest.fn();
      const onAgentComplete = jest.fn();
      const onPhaseComplete = jest.fn();
      node = new ProposalNode({
        onPhaseStart,
        onAgentStart,
        onContributionCreated,
        onAgentComplete,
        onPhaseComplete,
      });
      const agent = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'gpt-4', {
        content: 'P',
        metadata: {},
      });
      mockContext = createContext({ agents: [agent] });

      await node.execute(mockContext);

      expect(onPhaseStart).toHaveBeenCalledWith(1, CONTRIBUTION_TYPES.PROPOSAL, 1);
      expect(onAgentStart).toHaveBeenCalledWith('Agent 1', 'proposing');
      expect(onContributionCreated).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'agent-1', content: 'P' }),
        1
      );
      expect(onAgentComplete).toHaveBeenCalledWith('Agent 1', 'proposing');
      expect(onPhaseComplete).toHaveBeenCalledWith(1, CONTRIBUTION_TYPES.PROPOSAL);
    });

    it('should not throw when hooks are undefined', async () => {
      node = new ProposalNode();
      const agent = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'gpt-4', {
        content: 'P',
        metadata: {},
      });
      mockContext = createContext({ agents: [agent] });

      await expect(node.execute(mockContext)).resolves.toBeDefined();
    });

    it('should run all agents in parallel and add each contribution', async () => {
      const agent1 = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'm1', {
        content: 'Proposal 1',
        metadata: {},
      });
      const agent2 = createMockAgent('agent-2', 'Agent 2', AGENT_ROLES.ARCHITECT, 'm2', {
        content: 'Proposal 2',
        metadata: {},
      });
      mockContext = createContext({ agents: [agent1, agent2] });

      await node.execute(mockContext);

      expect(mockStateManager.addContribution).toHaveBeenCalledTimes(2);
      expect(agent1.propose).toHaveBeenCalled();
      expect(agent2.propose).toHaveBeenCalled();
    });

    it('should use empty map when preparedContexts is undefined', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'gpt-4', {
        content: 'P',
        metadata: {},
      });
      mockContext = createContext({ agents: [agent] });
      delete (mockContext as Partial<NodeContext>).preparedContexts;

      await node.execute(mockContext);

      expect(agent.propose).toHaveBeenCalledWith(
        state.problem,
        expect.objectContaining({ problem: state.problem }),
        state
      );
    });

    it('should handle round 2 with no previous round (prevRoundIndex < 0)', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'gpt-4', {
        content: 'Fallback',
        metadata: {},
      });
      state = createState({
        currentRound: 2,
        rounds: [{ roundNumber: 1, contributions: [], timestamp: new Date() }],
      });
      mockContext = createContext({ state, agents: [agent] });

      await node.execute(mockContext);

      expect(logWarning).toHaveBeenCalled();
      expect(agent.propose).toHaveBeenCalled();
    });
  });
});
