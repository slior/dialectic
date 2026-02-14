import { DebateState, DEBATE_STATUS, DebateConfig } from '../../types/debate.types';
import { DEBATE_EVENTS } from '../events';
import { NodeContext } from '../node';
import { NODE_TYPES } from '../types';

import { InitializationNode } from './initialization-node';

function createMockContext(): NodeContext {
  const state = new DebateState();
  state.id = 'test-debate';
  state.problem = 'Test problem';
  state.status = DEBATE_STATUS.RUNNING;
  state.currentRound = 0;
  state.rounds = [];
  state.createdAt = new Date();
  state.updatedAt = new Date();

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
    stateManager: {} as NodeContext['stateManager'],
  };
}

describe('InitializationNode', () => {
  let node: InitializationNode;

  beforeEach(() => {
    node = new InitializationNode();
  });

  describe('nodeType', () => {
    it('should have nodeType INITIALIZATION', () => {
      expect(node.nodeType).toBe(NODE_TYPES.INITIALIZATION);
    });
  });

  describe('execute', () => {
    it('should return a result with START event', async () => {
      const context = createMockContext();

      const result = await node.execute(context);

      expect(result.event.type).toBe(DEBATE_EVENTS.START);
      expect(result.event.timestamp).toBeInstanceOf(Date);
    });

    it('should not include payload on the event', async () => {
      const context = createMockContext();

      const result = await node.execute(context);

      expect(result.event.payload).toBeUndefined();
    });

    it('should return result that leaves context unchanged when applyToContext is called', async () => {
      const context = createMockContext();

      const result = await node.execute(context);
      const applied = result.applyToContext(context);

      expect(applied).toBe(context);
    });

    it('should not use or depend on context state', async () => {
      const context = createMockContext();
      context.state.status = DEBATE_STATUS.COMPLETED;

      const result = await node.execute(context);

      expect(result.event.type).toBe(DEBATE_EVENTS.START);
    });
  });
});
