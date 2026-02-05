import { CritiqueNode } from './critique-node';
import {
  DebateState,
  DebateConfig,
  DEBATE_STATUS,
  CONTRIBUTION_TYPES,
  type Contribution,
  type DebateRound,
} from '../../types/debate.types';
import { AGENT_ROLES } from '../../types/agent.types';
import { NodeContext } from '../node';
import { DEBATE_EVENTS } from '../events';
import { NODE_TYPES } from '../types';
import type { Agent } from '../../core/agent';
import type { StateManager } from '../../core/state-manager';
import type { OrchestratorHooks } from '../../core/orchestrator';
import type { TracingContext } from '../../types/tracing.types';

describe('CritiqueNode', () => {
  let node: CritiqueNode;
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
    critiqueResult: { content: string; metadata: Contribution['metadata'] }
  ): jest.Mocked<Agent> {
    return {
      config: { id, name, role, model },
      critique: jest.fn().mockResolvedValue(critiqueResult),
    } as unknown as jest.Mocked<Agent>;
  }

  function createProposal(agentId: string, content: string): Contribution {
    return {
      agentId,
      agentRole: AGENT_ROLES.ARCHITECT,
      type: CONTRIBUTION_TYPES.PROPOSAL,
      content,
      metadata: {},
    };
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
    node = new CritiqueNode();
  });

  describe('nodeType', () => {
    it('should have nodeType CRITIQUE', () => {
      expect(node.nodeType).toBe(NODE_TYPES.CRITIQUE);
    });
  });

  describe('constructor', () => {
    it('should work without hooks', () => {
      const n = new CritiqueNode();
      expect(n.nodeType).toBe(NODE_TYPES.CRITIQUE);
    });

    it('should accept optional hooks', () => {
      const hooks: OrchestratorHooks = {};
      const n = new CritiqueNode(hooks);
      expect(n.nodeType).toBe(NODE_TYPES.CRITIQUE);
    });
  });

  describe('execute', () => {
    it('should emit CRITIQUES_COMPLETE with updated state when last round has no proposals', async () => {
      state.rounds = [
        { roundNumber: 1, contributions: [], timestamp: new Date() },
      ];
      mockContext = createContext({ state, agents: [] });

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.CRITIQUES_COMPLETE);
      expect(result.event.timestamp).toBeInstanceOf(Date);
      expect(result.updatedContext).toEqual({ state });
      expect(mockStateManager.addContribution).not.toHaveBeenCalled();
      expect(mockStateManager.getDebate).toHaveBeenCalledWith(state.id);
    });

    it('should emit CRITIQUES_COMPLETE with no critique tasks when no last round', async () => {
      state.rounds = [];
      const agent = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'm1', {
        content: 'Critique',
        metadata: {},
      });
      mockContext = createContext({ state, agents: [agent] });

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.CRITIQUES_COMPLETE);
      expect(mockStateManager.addContribution).not.toHaveBeenCalled();
      expect(agent.critique).not.toHaveBeenCalled();
    });

    it('should run critiques for each agent against others proposals and add contributions', async () => {
      const agent1 = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'm1', {
        content: 'Critique from 1',
        metadata: { tokensUsed: 10 },
      });
      const agent2 = createMockAgent('agent-2', 'Agent 2', AGENT_ROLES.SECURITY, 'm2', {
        content: 'Critique from 2',
        metadata: { latencyMs: 50 },
      });
      const proposals: Contribution[] = [
        createProposal('agent-1', 'Proposal A'),
        createProposal('agent-2', 'Proposal B'),
      ];
      state.rounds = [
        { roundNumber: 1, contributions: proposals, timestamp: new Date() },
      ];
      mockContext = createContext({
        state,
        agents: [agent1, agent2],
      });

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.CRITIQUES_COMPLETE);
      expect(result.updatedContext).toEqual({ state });
      // Each agent critiques the other: 2 tasks
      expect(agent1.critique).toHaveBeenCalledTimes(1);
      expect(agent2.critique).toHaveBeenCalledTimes(1);
      expect(mockStateManager.addContribution).toHaveBeenCalledTimes(2);
      const calls = (mockStateManager.addContribution as jest.Mock).mock.calls;
      const contrib1 = calls[0][1] as Contribution;
      const contrib2 = calls[1][1] as Contribution;
      expect(contrib1.agentId).toBe('agent-1');
      expect(contrib1.type).toBe(CONTRIBUTION_TYPES.CRITIQUE);
      expect(contrib1.content).toBe('Critique from 1');
      expect(contrib1.targetAgentId).toBe('agent-2');
      expect(contrib1.metadata.model).toBe('m1');
      expect(contrib2.agentId).toBe('agent-2');
      expect(contrib2.targetAgentId).toBe('agent-1');
      expect(contrib2.metadata.latencyMs).toBe(50);
    });

    it('should compute latencyMs when critique metadata has no latencyMs', async () => {
      const agent1 = createMockAgent('agent-1', 'A1', AGENT_ROLES.ARCHITECT, 'm1', {
        content: 'C1',
        metadata: { tokensUsed: 5 },
      });
      const agent2 = createMockAgent('agent-2', 'A2', AGENT_ROLES.ARCHITECT, 'm2', {
        content: 'P2',
        metadata: {},
      });
      state.rounds = [
        {
          roundNumber: 1,
          contributions: [
            createProposal('agent-1', 'P1'),
            createProposal('agent-2', 'P2'),
          ],
          timestamp: new Date(),
        },
      ];
      mockContext = createContext({ state, agents: [agent1, agent2] });

      await node.execute(mockContext);

      const contribFrom1 = (mockStateManager.addContribution as jest.Mock).mock.calls.find(
        (c: [string, Contribution]) => c[1].agentId === 'agent-1'
      )?.[1] as Contribution;
      expect(contribFrom1.metadata.latencyMs).toBeDefined();
      expect(typeof contribFrom1.metadata.latencyMs).toBe('number');
      expect(contribFrom1.metadata.model).toBe('m1');
    });

    it('should use preparedContext when preparedContexts has agent id', async () => {
      const agent1 = createMockAgent('agent-1', 'A1', AGENT_ROLES.ARCHITECT, 'm1', {
        content: 'C1',
        metadata: {},
      });
      const agent2 = createMockAgent('agent-2', 'A2', AGENT_ROLES.ARCHITECT, 'm2', {
        content: 'C2',
        metadata: {},
      });
      const preparedCtx = { problem: 'Prepared problem', includeFullHistory: true };
      state.rounds = [
        {
          roundNumber: 1,
          contributions: [
            createProposal('agent-1', 'P1'),
            createProposal('agent-2', 'P2'),
          ],
          timestamp: new Date(),
        },
      ];
      mockContext = createContext({
        state,
        agents: [agent1, agent2],
        preparedContexts: new Map([
          ['agent-1', preparedCtx],
          ['agent-2', { problem: 'Other', includeFullHistory: false }],
        ]),
      });

      await node.execute(mockContext);

      expect(agent1.critique).toHaveBeenCalledWith(
        expect.any(Object),
        preparedCtx,
        state
      );
      expect(agent2.critique).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ problem: 'Other' }),
        state
      );
    });

    it('should use buildContext when preparedContexts does not have agent id', async () => {
      const agent1 = createMockAgent('agent-1', 'A1', AGENT_ROLES.ARCHITECT, 'm1', {
        content: 'C1',
        metadata: {},
      });
      const agent2 = createMockAgent('agent-2', 'A2', AGENT_ROLES.ARCHITECT, 'm2', {
        content: 'C2',
        metadata: {},
      });
      state.rounds = [
        {
          roundNumber: 1,
          contributions: [
            createProposal('agent-1', 'P1'),
            createProposal('agent-2', 'P2'),
          ],
          timestamp: new Date(),
        },
      ];
      mockContext = createContext({
        state,
        agents: [agent1, agent2],
        preparedContexts: new Map([['other-id', { problem: 'Other' }]]),
      });

      await node.execute(mockContext);

      expect(agent1.critique).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          problem: state.problem,
          includeFullHistory: false,
        }),
        state
      );
    });

    it('should include contextDirectory and tracingContext in context when provided', async () => {
      const agent1 = createMockAgent('agent-1', 'A1', AGENT_ROLES.ARCHITECT, 'm1', {
        content: 'C1',
        metadata: {},
      });
      const agent2 = createMockAgent('agent-2', 'A2', AGENT_ROLES.ARCHITECT, 'm2', {
        content: 'C2',
        metadata: {},
      });
      const contextDir = '/path/to/context';
      const tracingCtx = {} as TracingContext;
      state.rounds = [
        {
          roundNumber: 1,
          contributions: [
            createProposal('agent-1', 'P1'),
            createProposal('agent-2', 'P2'),
          ],
          timestamp: new Date(),
        },
      ];
      mockContext = createContext({
        state,
        agents: [agent1, agent2],
        contextDirectory: contextDir,
        tracingContext: tracingCtx,
      });

      await node.execute(mockContext);

      expect(agent1.critique).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          contextDirectory: contextDir,
          tracingContext: tracingCtx,
        }),
        state
      );
    });

    it('should include state context in buildContext when state.context is set', async () => {
      state.context = 'extra context';
      const agent1 = createMockAgent('agent-1', 'A1', AGENT_ROLES.ARCHITECT, 'm1', {
        content: 'C1',
        metadata: {},
      });
      const agent2 = createMockAgent('agent-2', 'A2', AGENT_ROLES.ARCHITECT, 'm2', {
        content: 'C2',
        metadata: {},
      });
      state.rounds = [
        {
          roundNumber: 1,
          contributions: [
            createProposal('agent-1', 'P1'),
            createProposal('agent-2', 'P2'),
          ],
          timestamp: new Date(),
        },
      ];
      mockContext = createContext({
        state,
        agents: [agent1, agent2],
      });

      await node.execute(mockContext);

      expect(agent1.critique).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ context: 'extra context' }),
        state
      );
    });

    it('should include history and clarifications when config and state have them', async () => {
      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          contributions: [
            createProposal('agent-1', 'P1'),
            createProposal('agent-2', 'P2'),
          ],
          timestamp: new Date(),
        },
      ];
      state.rounds = rounds;
      state.context = 'ctx';
      state.clarifications = [
        { agentId: 'a1', agentName: 'A1', role: AGENT_ROLES.ARCHITECT, items: [] },
      ];
      const agent1 = createMockAgent('agent-1', 'A1', AGENT_ROLES.ARCHITECT, 'm1', {
        content: 'C1',
        metadata: {},
      });
      const agent2 = createMockAgent('agent-2', 'A2', AGENT_ROLES.ARCHITECT, 'm2', {
        content: 'C2',
        metadata: {},
      });
      mockContext = createContext({
        state,
        agents: [agent1, agent2],
        config: { ...mockContext.config, includeFullHistory: true } as DebateConfig,
      });

      await node.execute(mockContext);

      expect(agent1.critique).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          history: rounds,
          includeFullHistory: true,
          clarifications: state.clarifications,
        }),
        state
      );
    });

    it('should use empty map when preparedContexts is undefined', async () => {
      const agent1 = createMockAgent('agent-1', 'A1', AGENT_ROLES.ARCHITECT, 'm1', {
        content: 'C1',
        metadata: {},
      });
      const agent2 = createMockAgent('agent-2', 'A2', AGENT_ROLES.ARCHITECT, 'm2', {
        content: 'C2',
        metadata: {},
      });
      state.rounds = [
        {
          roundNumber: 1,
          contributions: [
            createProposal('agent-1', 'P1'),
            createProposal('agent-2', 'P2'),
          ],
          timestamp: new Date(),
        },
      ];
      mockContext = createContext({ state, agents: [agent1, agent2] });
      delete (mockContext as Partial<NodeContext>).preparedContexts;

      await node.execute(mockContext);

      expect(agent1.critique).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ problem: state.problem }),
        state
      );
    });

    it('should call onPhaseStart with round number, type, and total critique count', async () => {
      const agent1 = createMockAgent('agent-1', 'A1', AGENT_ROLES.ARCHITECT, 'm1', {
        content: 'C1',
        metadata: {},
      });
      const agent2 = createMockAgent('agent-2', 'A2', AGENT_ROLES.ARCHITECT, 'm2', {
        content: 'C2',
        metadata: {},
      });
      state.currentRound = 2;
      state.rounds = [
        {
          roundNumber: 1,
          contributions: [
            createProposal('agent-1', 'P1'),
            createProposal('agent-2', 'P2'),
          ],
          timestamp: new Date(),
        },
      ];
      const onPhaseStart = jest.fn();
      node = new CritiqueNode({ onPhaseStart });
      mockContext = createContext({ state, agents: [agent1, agent2] });

      await node.execute(mockContext);

      expect(onPhaseStart).toHaveBeenCalledWith(2, CONTRIBUTION_TYPES.CRITIQUE, 2);
    });

    it('should call all hooks when provided', async () => {
      const onPhaseStart = jest.fn();
      const onAgentStart = jest.fn();
      const onContributionCreated = jest.fn();
      const onAgentComplete = jest.fn();
      const onPhaseComplete = jest.fn();
      node = new CritiqueNode({
        onPhaseStart,
        onAgentStart,
        onContributionCreated,
        onAgentComplete,
        onPhaseComplete,
      });
      const agent1 = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'm1', {
        content: 'Critique 1',
        metadata: {},
      });
      const agent2 = createMockAgent('agent-2', 'Agent 2', AGENT_ROLES.ARCHITECT, 'm2', {
        content: 'Critique 2',
        metadata: {},
      });
      state.rounds = [
        {
          roundNumber: 1,
          contributions: [
            createProposal('agent-1', 'P1'),
            createProposal('agent-2', 'P2'),
          ],
          timestamp: new Date(),
        },
      ];
      mockContext = createContext({ state, agents: [agent1, agent2] });

      await node.execute(mockContext);

      expect(onPhaseStart).toHaveBeenCalledWith(1, CONTRIBUTION_TYPES.CRITIQUE, 2);
      expect(onAgentStart).toHaveBeenCalledWith('Agent 1', 'critiquing Agent 2');
      expect(onAgentStart).toHaveBeenCalledWith('Agent 2', 'critiquing Agent 1');
      expect(onContributionCreated).toHaveBeenCalledTimes(2);
      expect(onContributionCreated).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'agent-1', content: 'Critique 1' }),
        1
      );
      expect(onAgentComplete).toHaveBeenCalledWith('Agent 1', 'critiquing Agent 2');
      expect(onAgentComplete).toHaveBeenCalledWith('Agent 2', 'critiquing Agent 1');
      expect(onPhaseComplete).toHaveBeenCalledWith(1, CONTRIBUTION_TYPES.CRITIQUE);
    });

    it('should use activity "critiquing" when critiqued agent is not in agents list', async () => {
      const agent1 = createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, 'm1', {
        content: 'C1',
        metadata: {},
      });
      const onAgentStart = jest.fn();
      node = new CritiqueNode({ onAgentStart });
      state.rounds = [
        {
          roundNumber: 1,
          contributions: [
            createProposal('agent-1', 'P1'),
            createProposal('unknown-agent', 'P from unknown'),
          ],
          timestamp: new Date(),
        },
      ];
      mockContext = createContext({ state, agents: [agent1] });

      await node.execute(mockContext);

      expect(onAgentStart).toHaveBeenCalledWith('Agent 1', 'critiquing');
    });

    it('should throw when getDebate returns null after critique phase', async () => {
      const agent1 = createMockAgent('agent-1', 'A1', AGENT_ROLES.ARCHITECT, 'm1', {
        content: 'C1',
        metadata: {},
      });
      const agent2 = createMockAgent('agent-2', 'A2', AGENT_ROLES.ARCHITECT, 'm2', {
        content: 'C2',
        metadata: {},
      });
      state.rounds = [
        {
          roundNumber: 1,
          contributions: [
            createProposal('agent-1', 'P1'),
            createProposal('agent-2', 'P2'),
          ],
          timestamp: new Date(),
        },
      ];
      mockStateManager.getDebate!.mockResolvedValue(null);
      mockContext = createContext({ state, agents: [agent1, agent2] });

      await expect(node.execute(mockContext)).rejects.toThrow(
        'Debate debate-1 not found after critique phase'
      );
    });

    it('should throw when getDebate returns undefined', async () => {
      const agent1 = createMockAgent('agent-1', 'A1', AGENT_ROLES.ARCHITECT, 'm1', {
        content: 'C1',
        metadata: {},
      });
      const agent2 = createMockAgent('agent-2', 'A2', AGENT_ROLES.ARCHITECT, 'm2', {
        content: 'C2',
        metadata: {},
      });
      state.rounds = [
        {
          roundNumber: 1,
          contributions: [
            createProposal('agent-1', 'P1'),
            createProposal('agent-2', 'P2'),
          ],
          timestamp: new Date(),
        },
      ];
      mockStateManager.getDebate!.mockResolvedValue(undefined as unknown as DebateState);
      mockContext = createContext({ state, agents: [agent1, agent2] });

      await expect(node.execute(mockContext)).rejects.toThrow(
        'Debate debate-1 not found after critique phase'
      );
    });

    it('should add only fulfilled contributions when one task rejects', async () => {
      const agent1 = createMockAgent('agent-1', 'A1', AGENT_ROLES.ARCHITECT, 'm1', {
        content: 'C1',
        metadata: {},
      });
      const agent2 = createMockAgent('agent-2', 'A2', AGENT_ROLES.ARCHITECT, 'm2', {
        content: 'C2',
        metadata: {},
      });
      (agent2.critique as jest.Mock).mockRejectedValueOnce(new Error('LLM failed'));
      state.rounds = [
        {
          roundNumber: 1,
          contributions: [
            createProposal('agent-1', 'P1'),
            createProposal('agent-2', 'P2'),
          ],
          timestamp: new Date(),
        },
      ];
      mockContext = createContext({ state, agents: [agent1, agent2] });

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.CRITIQUES_COMPLETE);
      expect(mockStateManager.addContribution).toHaveBeenCalledTimes(1);
      expect(mockStateManager.addContribution).toHaveBeenCalledWith(
        state.id,
        expect.objectContaining({ agentId: 'agent-1', content: 'C1' })
      );
    });

    it('should not throw when hooks are undefined', async () => {
      node = new CritiqueNode();
      const agent1 = createMockAgent('agent-1', 'A1', AGENT_ROLES.ARCHITECT, 'm1', {
        content: 'C1',
        metadata: {},
      });
      const agent2 = createMockAgent('agent-2', 'A2', AGENT_ROLES.ARCHITECT, 'm2', {
        content: 'C2',
        metadata: {},
      });
      state.rounds = [
        {
          roundNumber: 1,
          contributions: [
            createProposal('agent-1', 'P1'),
            createProposal('agent-2', 'P2'),
          ],
          timestamp: new Date(),
        },
      ];
      mockContext = createContext({ state, agents: [agent1, agent2] });

      await expect(node.execute(mockContext)).resolves.toBeDefined();
    });

    it('should pass proposal content and metadata to agent.critique', async () => {
      const proposal = createProposal('agent-1', 'My proposal text');
      proposal.metadata = { tokensUsed: 42, latencyMs: 100 };
      const agent2 = createMockAgent('agent-2', 'A2', AGENT_ROLES.ARCHITECT, 'm2', {
        content: 'My critique',
        metadata: {},
      });
      state.rounds = [
        {
          roundNumber: 1,
          contributions: [proposal, createProposal('agent-2', 'P2')],
          timestamp: new Date(),
        },
      ];
      mockContext = createContext({ state, agents: [agent2] });

      await node.execute(mockContext);

      expect(agent2.critique).toHaveBeenCalledWith(
        { content: 'My proposal text', metadata: { tokensUsed: 42, latencyMs: 100 } },
        expect.any(Object),
        state
      );
    });
  });
});
