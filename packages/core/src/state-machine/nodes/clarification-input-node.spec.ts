import { ClarificationInputNode } from './clarification-input-node';
import { DebateState, AgentClarifications, DEBATE_STATUS, DebateConfig } from '../../types/debate.types';
import { NodeContext } from '../node';
import { DEBATE_EVENTS } from '../events';

describe('ClarificationInputNode', () => {
  let node: ClarificationInputNode;
  let mockContext: NodeContext;
  let state: DebateState;

  beforeEach(() => {
    node = new ClarificationInputNode();
    state = new DebateState();
    state.id = 'test-debate';
    state.problem = 'Test problem';
    state.status = DEBATE_STATUS.RUNNING;
    state.currentRound = 0;
    state.rounds = [];
    state.createdAt = new Date();
    state.updatedAt = new Date();
    
    mockContext = {
      state,
      config: {
        rounds: 3,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: false,
        timeoutPerRound: 300000,
      } as DebateConfig,
      agents: [],
      judge: {} as any,
      stateManager: {
        getDebate: async () => state,
        setClarifications: async () => {},
      } as any,
    };
  });

  describe('execute', () => {
    it('should emit WAITING_FOR_INPUT when questions have no answers', async () => {
      const clarifications: AgentClarifications[] = [{
        agentId: 'agent1',
        agentName: 'Test Agent',
        role: 'architect',
        items: [{ id: 'q1', question: 'What scale?', answer: '' }],
      }];
      state.clarifications = clarifications;

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.WAITING_FOR_INPUT);
      expect(result.event.payload).toEqual({
        questions: clarifications,
        iteration: 1,
      });
    });

    it('should emit WAITING_FOR_INPUT when some answers are NA', async () => {
      state.clarifications = [{
        agentId: 'agent1',
        agentName: 'Test Agent',
        role: 'architect',
        items: [{ id: 'q1', question: 'What scale?', answer: 'NA' }],
      }];

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.WAITING_FOR_INPUT);
    });

    it('should emit ANSWERS_SUBMITTED when all questions are answered', async () => {
      state.clarifications = [{
        agentId: 'agent1',
        agentName: 'Test Agent',
        role: 'architect',
        items: [{ id: 'q1', question: 'What scale?', answer: 'Large scale' }],
      }];

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.ANSWERS_SUBMITTED);
    });

    it('should emit ANSWERS_SUBMITTED when no clarifications exist', async () => {
      delete state.clarifications;

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.ANSWERS_SUBMITTED);
    });

    it('should include iteration count in payload', async () => {
      state.clarifications = [{
        agentId: 'agent1',
        agentName: 'Test Agent',
        role: 'architect',
        items: [{ id: 'q1', question: 'What scale?', answer: '' }],
      }];
      state.clarificationIterations = 2;

      const result = await node.execute(mockContext);

      expect(result.event.payload?.iteration).toBe(2);
    });
  });
});
