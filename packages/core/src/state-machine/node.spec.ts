import { NodeResultImpl, type NodeContext } from './node';
import { DEBATE_EVENTS, type DebateEvent } from './events';
import { DebateState, DEBATE_STATUS, type DebateConfig } from '../types/debate.types';

function createMockContext(overrides: Partial<NodeContext> = {}): NodeContext {
  const state = new DebateState();
  state.id = 'test-debate';
  state.problem = 'Test problem';
  state.status = DEBATE_STATUS.RUNNING;
  state.currentRound = 1;
  state.rounds = [];
  state.createdAt = new Date();
  state.updatedAt = new Date();

  const baseContext: NodeContext = {
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
    contextDirectory: '/tmp/context',
  };

  return { ...baseContext, ...overrides };
}

describe('NodeResultImpl', () => {
  describe('createResult', () => {
    it('should create a NodeResult with the given event and no updated context', () => {
      const event: DebateEvent = {
        type: DEBATE_EVENTS.START,
        timestamp: new Date(),
      };

      const result = NodeResultImpl.createResult(event);

      expect(result.event).toBe(event);
      expect(result.applyToContext).toBeInstanceOf(Function);
      expect((result as NodeResultImpl).updatedContext).toBeUndefined();
    });

    it('should create a NodeResult with the given event and updated context', () => {
      const event: DebateEvent = {
        type: DEBATE_EVENTS.BEGIN_ROUND,
        timestamp: new Date(),
      };
      const updatedContext: Partial<NodeContext> = {
        contextDirectory: '/updated/context',
      };

      const result = NodeResultImpl.createResult(event, updatedContext) as NodeResultImpl;

      expect(result.event).toBe(event);
      expect(result.updatedContext).toEqual(updatedContext);
    });
  });

  describe('applyToContext', () => {
    it('should return the original context when there is no updated context', () => {
      const event: DebateEvent = {
        type: DEBATE_EVENTS.START,
        timestamp: new Date(),
      };
      const result = NodeResultImpl.createResult(event) as NodeResultImpl;
      const context = createMockContext();

      const applied = result.applyToContext(context);

      expect(applied).toBe(context);
    });

    it('should merge the updated context into the existing context when provided', () => {
      const event: DebateEvent = {
        type: DEBATE_EVENTS.BEGIN_ROUND,
        timestamp: new Date(),
      };
      const originalContext = createMockContext({
        contextDirectory: '/original/context',
      });
      const updatedContext: Partial<NodeContext> = {
        contextDirectory: '/new/context',
      };
      const result = NodeResultImpl.createResult(event, updatedContext) as NodeResultImpl;

      const applied = result.applyToContext(originalContext);

      expect(applied).not.toBe(originalContext);
      expect(applied.contextDirectory).toBe('/new/context');
      // unchanged fields should be preserved
      expect(applied.state).toBe(originalContext.state);
      expect(applied.config).toBe(originalContext.config);
      expect(applied.agents).toBe(originalContext.agents);
      expect(applied.judge).toBe(originalContext.judge);
      expect(applied.stateManager).toBe(originalContext.stateManager);
    });

    it('should treat an explicitly undefined updatedContext as no updates', () => {
      const event: DebateEvent = {
        type: DEBATE_EVENTS.START,
        timestamp: new Date(),
      };
      // This relies on constructor behavior where updatedContext is only set when not undefined
      const result = NodeResultImpl.createResult(event, undefined) as NodeResultImpl;
      const context = createMockContext();

      const applied = result.applyToContext(context);

      expect(applied).toBe(context);
      expect(result.updatedContext).toBeUndefined();
    });
  });
});

