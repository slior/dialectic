import { ClarificationNode } from './clarification-node';
import {
  DebateState,
  DebateConfig,
  DEBATE_STATUS,
  type AgentClarifications,
} from '../../types/debate.types';
import { AGENT_ROLES } from '../../types/agent.types';
import { NodeContext } from '../node';
import { DEBATE_EVENTS } from '../events';
import { NODE_TYPES } from '../types';
import type { Agent } from '../../core/agent';
import type { StateManager } from '../../core/state-manager';
import { collectClarifications } from '../../core/clarifications';
import { logWarning } from '../../utils/console';

jest.mock('../../core/clarifications', () => ({
  collectClarifications: jest.fn(),
}));

jest.mock('../../utils/console', () => ({
  logWarning: jest.fn(),
}));

const mockCollectClarifications = collectClarifications as jest.MockedFunction<
  typeof collectClarifications
>;

describe('ClarificationNode', () => {
  let node: ClarificationNode;
  let state: DebateState;
  let mockStateManager: jest.Mocked<StateManager>;
  let mockContext: NodeContext;

  function createState(overrides: Partial<DebateState> = {}): DebateState {
    const s = new DebateState();
    s.id = 'debate-1';
    s.problem = 'Test problem';
    s.status = DEBATE_STATUS.RUNNING;
    s.currentRound = 0;
    s.rounds = [];
    s.createdAt = new Date();
    s.updatedAt = new Date();
    return Object.assign(s, overrides);
  }

  function createMockAgent(id: string, name: string): jest.Mocked<Agent> {
    return {
      config: { id, name, role: AGENT_ROLES.ARCHITECT, model: 'test-model' },
      getID: jest.fn().mockReturnValue(id),
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
        interactiveClarifications: true,
      } as DebateConfig,
      agents: [],
      judge: {} as NodeContext['judge'],
      stateManager: mockStateManager,
      ...overrides,
    };
  }

  function createAgentClarifications(
    agentId: string,
    items: Array<{ id: string; question: string; answer: string }>
  ): AgentClarifications {
    return {
      agentId,
      agentName: `Agent ${agentId}`,
      role: AGENT_ROLES.ARCHITECT,
      items: items.map(({ id, question, answer }) => ({ id, question, answer })),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    state = createState();
    mockStateManager = {
      setClarifications: jest.fn().mockResolvedValue(undefined),
      getDebate: jest.fn().mockResolvedValue(state),
    } as unknown as jest.Mocked<StateManager>;
    mockContext = createContext();
    node = new ClarificationNode();
  });

  describe('nodeType', () => {
    it('should have nodeType CLARIFICATION', () => {
      expect(node.nodeType).toBe(NODE_TYPES.CLARIFICATION);
    });
  });

  describe('execute', () => {
    it('should return ALL_CLEAR when interactiveClarifications is false', async () => {
      mockContext = createContext({
        config: { ...mockContext.config, interactiveClarifications: false } as DebateConfig,
      });

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.ALL_CLEAR);
      expect(mockCollectClarifications).not.toHaveBeenCalled();
    });

    it('should return ALL_CLEAR when iterations >= maxIterations (config value)', async () => {
      state = createState({ clarificationIterations: 3 });
      mockContext = createContext({
        state,
        config: {
          ...mockContext.config,
          clarificationsMaxIterations: 3,
        } as DebateConfig,
      });

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.ALL_CLEAR);
      expect(mockCollectClarifications).not.toHaveBeenCalled();
    });

    it('should return ALL_CLEAR when iterations >= default maxIterations', async () => {
      state = createState({ clarificationIterations: 5 });
      const { clarificationsMaxIterations: _omit, ...restConfig } = mockContext.config;
      mockContext = createContext({
        state,
        config: restConfig as DebateConfig,
      });
      mockCollectClarifications.mockResolvedValue([]);

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.ALL_CLEAR);
    });

    it('should return ALL_CLEAR when all agents done and state has clarifications', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1');
      state = createState({
        clarifications: [
          createAgentClarifications('agent-1', [
            { id: 'q1', question: 'Q1?', answer: 'A1' },
          ]),
        ],
      });
      mockContext = createContext({ state, agents: [agent] });
      mockCollectClarifications.mockResolvedValue([]);

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.ALL_CLEAR);
    });

    it('should return ALL_CLEAR when collectQuestions returns null', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1');
      mockContext = createContext({ agents: [agent] });
      mockCollectClarifications.mockResolvedValue(null as unknown as AgentClarifications[]);

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.ALL_CLEAR);
    });

    it('should return ALL_CLEAR when collectQuestions returns empty array', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1');
      mockContext = createContext({ agents: [agent] });
      mockCollectClarifications.mockResolvedValue([]);

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.ALL_CLEAR);
    });

    it('should return ALL_CLEAR when all questions have no items', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1');
      mockContext = createContext({ agents: [agent] });
      mockCollectClarifications.mockResolvedValue([
        createAgentClarifications('agent-1', []),
      ]);

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.ALL_CLEAR);
    });

    it('should return QUESTIONS_PENDING and update state when questions collected', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1');
      mockContext = createContext({ agents: [agent] });
      const questions = [
        createAgentClarifications('agent-1', [
          { id: 'q1', question: 'Q1?', answer: '' },
        ]),
      ];
      mockCollectClarifications.mockResolvedValue(questions);
      const updatedState = createState({ id: state.id });
      mockStateManager.getDebate.mockResolvedValue(updatedState);

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.QUESTIONS_PENDING);
      expect(result.updatedContext?.state).toBe(updatedState);
      expect(updatedState.clarificationIterations).toBe(1);
      expect(mockStateManager.setClarifications).toHaveBeenCalledWith(state.id, questions);
    });

    it('should throw when getDebate returns null after setClarifications', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1');
      mockContext = createContext({ agents: [agent] });
      mockCollectClarifications.mockResolvedValue([
        createAgentClarifications('agent-1', [
          { id: 'q1', question: 'Q1?', answer: '' },
        ]),
      ]);
      mockStateManager.getDebate.mockResolvedValue(null);

      await expect(node.execute(mockContext)).rejects.toThrow(
        `Debate ${state.id} not found`
      );
    });

    it('should use pendingAgents when some agents have unanswered clarifications', async () => {
      const agent1 = createMockAgent('agent-1', 'Agent 1');
      const agent2 = createMockAgent('agent-2', 'Agent 2');
      state = createState({
        clarifications: [
          createAgentClarifications('agent-1', [
            { id: 'q1', question: 'Q1?', answer: '' },
          ]),
          createAgentClarifications('agent-2', [
            { id: 'q2', question: 'Q2?', answer: 'A2' },
          ]),
        ],
      });
      mockContext = createContext({ state, agents: [agent1, agent2] });
      const questions = [
        createAgentClarifications('agent-1', [
          { id: 'q1', question: 'Q1?', answer: '' },
        ]),
      ];
      mockCollectClarifications.mockResolvedValue(questions);
      const updatedState = createState({ id: state.id });
      mockStateManager.getDebate.mockResolvedValue(updatedState);

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.QUESTIONS_PENDING);
      expect(mockCollectClarifications).toHaveBeenCalledWith(
        state.problem,
        [agent1],
        expect.any(Number),
        expect.any(Function)
      );
    });

    it('should use clarificationsMaxPerAgent from config when set', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1');
      mockContext = createContext({
        agents: [agent],
        config: {
          ...mockContext.config,
          clarificationsMaxPerAgent: 10,
        } as DebateConfig,
      });
      mockCollectClarifications.mockResolvedValue([
        createAgentClarifications('agent-1', [
          { id: 'q1', question: 'Q1?', answer: '' },
        ]),
      ]);
      mockStateManager.getDebate.mockResolvedValue(state);

      await node.execute(mockContext);

      expect(mockCollectClarifications).toHaveBeenCalledWith(
        state.problem,
        [agent],
        10,
        expect.any(Function)
      );
    });

    it('should merge existing clarifications with new questions and preserve answers', async () => {
      const agent1 = createMockAgent('agent-1', 'Agent 1');
      const agent2 = createMockAgent('agent-2', 'Agent 2');
      state = createState({
        clarifications: [
          createAgentClarifications('agent-1', [
            { id: 'q1', question: 'Q1?', answer: 'A1' },
            { id: 'q2', question: 'Q2?', answer: '' },
          ]),
        ],
      });
      mockContext = createContext({ state, agents: [agent1, agent2] });
      const newQuestions = [
        createAgentClarifications('agent-1', [
          { id: 'q2', question: 'Q2?', answer: '' },
          { id: 'q3', question: 'Q3?', answer: '' },
        ]),
      ];
      mockCollectClarifications.mockResolvedValue(newQuestions);
      mockStateManager.getDebate.mockResolvedValue(state);

      await node.execute(mockContext);

      const setCalls = mockStateManager.setClarifications.mock.calls;
      expect(setCalls.length).toBe(1);
      const merged = setCalls[0]![1] as AgentClarifications[];
      const agent1Merged = merged.find((c) => c.agentId === 'agent-1');
      expect(agent1Merged).toBeDefined();
      const q1 = agent1Merged!.items.find((i) => i.id === 'q1');
      expect(q1?.answer).toBe('A1');
      expect(agent1Merged!.items.some((i) => i.id === 'q3')).toBe(true);
    });

    it('should include existing agent not in new questions when they have unanswered items', async () => {
      const agent1 = createMockAgent('agent-1', 'Agent 1');
      const agent2 = createMockAgent('agent-2', 'Agent 2');
      state = createState({
        clarifications: [
          createAgentClarifications('agent-1', [
            { id: 'q1', question: 'Q1?', answer: '' },
          ]),
          createAgentClarifications('agent-2', [
            { id: 'q2', question: 'Q2?', answer: 'A2' },
          ]),
        ],
      });
      mockContext = createContext({ state, agents: [agent1, agent2] });
      const newQuestions = [
        createAgentClarifications('agent-2', [
          { id: 'q2', question: 'Q2?', answer: 'A2' },
        ]),
      ];
      mockCollectClarifications.mockResolvedValue(newQuestions);
      mockStateManager.getDebate.mockResolvedValue(state);

      await node.execute(mockContext);

      const setCalls = mockStateManager.setClarifications.mock.calls;
      expect(setCalls.length).toBe(1);
      const merged = setCalls[0]![1] as AgentClarifications[];
      const agentIds = merged.map((c) => c.agentId);
      expect(agentIds).toContain('agent-1');
      expect(agentIds).toContain('agent-2');
    });

    it('should not include existing agent not in new questions when all their items are answered', async () => {
      const agent1 = createMockAgent('agent-1', 'Agent 1');
      const agent2 = createMockAgent('agent-2', 'Agent 2');
      state = createState({
        clarifications: [
          createAgentClarifications('agent-1', [
            { id: 'q1', question: 'Q1?', answer: 'A1' },
          ]),
          createAgentClarifications('agent-2', [
            { id: 'q2', question: 'Q2?', answer: '' },
          ]),
        ],
      });
      mockContext = createContext({ state, agents: [agent1, agent2] });
      const newQuestions = [
        createAgentClarifications('agent-2', [
          { id: 'q2', question: 'Q2?', answer: '' },
        ]),
      ];
      mockCollectClarifications.mockResolvedValue(newQuestions);
      mockStateManager.getDebate.mockResolvedValue(state);

      await node.execute(mockContext);

      const setCalls = mockStateManager.setClarifications.mock.calls;
      expect(setCalls.length).toBe(1);
      const merged = setCalls[0]![1] as AgentClarifications[];
      const agent1Entry = merged.find((c) => c.agentId === 'agent-1');
      expect(agent1Entry).toBeUndefined();
    });

    it('should add new agent questions when agent not in existing', async () => {
      const agent1 = createMockAgent('agent-1', 'Agent 1');
      const agent2 = createMockAgent('agent-2', 'Agent 2');
      state = createState({
        clarifications: [
          createAgentClarifications('agent-1', [
            { id: 'q1', question: 'Q1?', answer: '' },
          ]),
        ],
      });
      mockContext = createContext({ state, agents: [agent1, agent2] });
      const newQuestions = [
        createAgentClarifications('agent-1', [
          { id: 'q1', question: 'Q1?', answer: '' },
        ]),
        createAgentClarifications('agent-2', [
          { id: 'q2', question: 'Q2?', answer: '' },
        ]),
      ];
      mockCollectClarifications.mockResolvedValue(newQuestions);
      mockStateManager.getDebate.mockResolvedValue(state);

      await node.execute(mockContext);

      const merged = mockStateManager.setClarifications.mock.calls[0]![1] as AgentClarifications[];
      const agent2Entry = merged.find((c) => c.agentId === 'agent-2');
      expect(agent2Entry).toBeDefined();
      expect(agent2Entry!.items).toHaveLength(1);
      expect(agent2Entry!.items[0]!.id).toBe('q2');
    });

    it('should preserve NA answers in merge and not overwrite with new item', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1');
      state = createState({
        clarifications: [
          createAgentClarifications('agent-1', [
            { id: 'q1', question: 'Q1?', answer: 'NA' },
            { id: 'q2', question: 'Q2?', answer: '' },
          ]),
        ],
      });
      mockContext = createContext({ state, agents: [agent] });
      const newQuestions = [
        createAgentClarifications('agent-1', [
          { id: 'q1', question: 'Q1?', answer: '' },
          { id: 'q3', question: 'Q3?', answer: '' },
        ]),
      ];
      mockCollectClarifications.mockResolvedValue(newQuestions);
      mockStateManager.getDebate.mockResolvedValue(state);

      await node.execute(mockContext);

      const setCalls = mockStateManager.setClarifications.mock.calls;
      expect(setCalls.length).toBe(1);
      const merged = setCalls[0]![1] as AgentClarifications[];
      const agent1Merged = merged.find((c) => c.agentId === 'agent-1')!;
      expect(agent1Merged.items.some((i) => i.id === 'q1' && i.answer === 'NA')).toBe(true);
      expect(agent1Merged.items.some((i) => i.id === 'q3')).toBe(true);
    });

    it('should not duplicate item when new question has same id as existing answered', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1');
      state = createState({
        clarifications: [
          createAgentClarifications('agent-1', [
            { id: 'q1', question: 'Q1?', answer: 'A1' },
            { id: 'q2', question: 'Q2?', answer: '' },
          ]),
        ],
      });
      mockContext = createContext({ state, agents: [agent] });
      const newQuestions = [
        createAgentClarifications('agent-1', [
          { id: 'q1', question: 'Q1?', answer: '' },
          { id: 'q2', question: 'Q2?', answer: '' },
        ]),
      ];
      mockCollectClarifications.mockResolvedValue(newQuestions);
      mockStateManager.getDebate.mockResolvedValue(state);

      await node.execute(mockContext);

      const setCalls = mockStateManager.setClarifications.mock.calls;
      expect(setCalls.length).toBe(1);
      const merged = setCalls[0]![1] as AgentClarifications[];
      const agent1Merged = merged.find((c) => c.agentId === 'agent-1')!;
      const q1Count = agent1Merged.items.filter((i) => i.id === 'q1').length;
      expect(q1Count).toBe(1);
      expect(agent1Merged.items.find((i) => i.id === 'q1')?.answer).toBe('A1');
    });

    it('should call logWarning via collectClarifications callback', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1');
      mockContext = createContext({ agents: [agent] });
      mockCollectClarifications.mockImplementation(async (_problem, _agents, _max, warn) => {
        warn('test warning');
        return [
          createAgentClarifications('agent-1', [
            { id: 'q1', question: 'Q1?', answer: '' },
          ]),
        ];
      });
      mockStateManager.getDebate.mockResolvedValue(state);

      await node.execute(mockContext);

      expect(logWarning).toHaveBeenCalledWith('test warning');
    });

    it('should pass all agents to collectQuestions when no clarifications yet', async () => {
      const agent1 = createMockAgent('agent-1', 'Agent 1');
      const agent2 = createMockAgent('agent-2', 'Agent 2');
      mockContext = createContext({ agents: [agent1, agent2] });
      mockCollectClarifications.mockResolvedValue([
        createAgentClarifications('agent-1', [
          { id: 'q1', question: 'Q1?', answer: '' },
        ]),
      ]);
      mockStateManager.getDebate.mockResolvedValue(state);

      await node.execute(mockContext);

      expect(mockCollectClarifications).toHaveBeenCalledWith(
        state.problem,
        [agent1, agent2],
        expect.any(Number),
        expect.any(Function)
      );
    });

    it('should treat agent with no clarifications entry as having no pending questions', async () => {
      const agent1 = createMockAgent('agent-1', 'Agent 1');
      const agent2 = createMockAgent('agent-2', 'Agent 2');
      state = createState({
        clarifications: [
          createAgentClarifications('agent-2', [
            { id: 'q1', question: 'Q1?', answer: '' },
          ]),
        ],
      });
      mockContext = createContext({ state, agents: [agent1, agent2] });
      mockCollectClarifications.mockResolvedValue([
        createAgentClarifications('agent-2', [
          { id: 'q1', question: 'Q1?', answer: '' },
        ]),
      ]);
      mockStateManager.getDebate.mockResolvedValue(state);

      await node.execute(mockContext);

      expect(mockCollectClarifications).toHaveBeenCalledWith(
        state.problem,
        [agent2],
        expect.any(Number),
        expect.any(Function)
      );
    });

    it('should treat agent with empty items as having no pending questions', async () => {
      const agent1 = createMockAgent('agent-1', 'Agent 1');
      const agent2 = createMockAgent('agent-2', 'Agent 2');
      state = createState({
        clarifications: [
          createAgentClarifications('agent-1', []),
          createAgentClarifications('agent-2', [
            { id: 'q1', question: 'Q1?', answer: '' },
          ]),
        ],
      });
      mockContext = createContext({ state, agents: [agent1, agent2] });
      mockCollectClarifications.mockResolvedValue([
        createAgentClarifications('agent-2', [
          { id: 'q1', question: 'Q1?', answer: '' },
        ]),
      ]);
      mockStateManager.getDebate.mockResolvedValue(state);

      await node.execute(mockContext);

      expect(mockCollectClarifications).toHaveBeenCalledWith(
        state.problem,
        [agent2],
        expect.any(Number),
        expect.any(Function)
      );
    });

    it('should treat item with whitespace-only answer as unanswered', async () => {
      const agent = createMockAgent('agent-1', 'Agent 1');
      state = createState({
        clarifications: [
          createAgentClarifications('agent-1', [
            { id: 'q1', question: 'Q1?', answer: '   ' },
          ]),
        ],
      });
      mockContext = createContext({ state, agents: [agent] });
      mockCollectClarifications.mockResolvedValue([
        createAgentClarifications('agent-1', [
          { id: 'q1', question: 'Q1?', answer: '   ' },
        ]),
      ]);
      mockStateManager.getDebate.mockResolvedValue(state);

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.QUESTIONS_PENDING);
    });
  });
});
