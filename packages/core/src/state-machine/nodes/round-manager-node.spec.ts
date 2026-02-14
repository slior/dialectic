import type { OrchestratorHooks } from '../../core/orchestrator';
import type { StateManager } from '../../core/state-manager';
import {
  DebateState,
  DebateConfig,
  DEBATE_STATUS,
} from '../../types/debate.types';
import { DEBATE_EVENTS } from '../events';
import { NodeContext } from '../node';
import { NODE_TYPES } from '../types';

import { RoundManagerNode } from './round-manager-node';

describe('RoundManagerNode', () => {
  let node: RoundManagerNode;
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
      beginRound: jest.fn().mockResolvedValue(undefined),
      getDebate: jest.fn().mockResolvedValue(state),
    } as unknown as jest.Mocked<StateManager>;
    mockContext = createContext();
    node = new RoundManagerNode();
  });

  describe('nodeType', () => {
    it('should have nodeType ROUND_MANAGER', () => {
      expect(node.nodeType).toBe(NODE_TYPES.ROUND_MANAGER);
    });
  });

  describe('constructor', () => {
    it('should work without hooks', () => {
      const n = new RoundManagerNode();
      expect(n.nodeType).toBe(NODE_TYPES.ROUND_MANAGER);
    });

    it('should accept optional hooks', () => {
      const hooks: OrchestratorHooks = {};
      const n = new RoundManagerNode(hooks);
      expect(n.nodeType).toBe(NODE_TYPES.ROUND_MANAGER);
    });
  });

  describe('execute', () => {
    it('should return MAX_ROUNDS_REACHED when currentRound >= totalRounds', async () => {
      state = createState({ currentRound: 3 });
      mockContext = createContext({ state, config: { ...mockContext.config, rounds: 3 } as DebateConfig });

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.MAX_ROUNDS_REACHED);
      expect(result.event.timestamp).toBeInstanceOf(Date);
      expect(mockStateManager.beginRound).not.toHaveBeenCalled();
      expect(mockStateManager.getDebate).not.toHaveBeenCalled();
    });

    it('should return MAX_ROUNDS_REACHED when currentRound equals totalRounds of 1', async () => {
      state = createState({ currentRound: 1 });
      mockContext = createContext({
        state,
        config: { ...mockContext.config, rounds: 1 } as DebateConfig,
      });

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.MAX_ROUNDS_REACHED);
    });

    it('should call onRoundStart with nextRound and totalRounds when hooks provided', async () => {
      const onRoundStart = jest.fn();
      node = new RoundManagerNode({ onRoundStart });
      state = createState({ currentRound: 0 });
      mockContext = createContext({ state });

      await node.execute(mockContext);

      expect(onRoundStart).toHaveBeenCalledTimes(1);
      expect(onRoundStart).toHaveBeenCalledWith(1, 3);
    });

    it('should not throw when hooks are undefined', async () => {
      node = new RoundManagerNode();
      state = createState({ currentRound: 0 });
      mockContext = createContext({ state });

      await expect(node.execute(mockContext)).resolves.toBeDefined();
    });

    it('should not throw when hooks exist but onRoundStart is undefined', async () => {
      node = new RoundManagerNode({});
      state = createState({ currentRound: 0 });
      mockContext = createContext({ state });

      await expect(node.execute(mockContext)).resolves.toBeDefined();
    });

    it('should call stateManager.beginRound with state.id', async () => {
      state = createState({ id: 'my-debate-id', currentRound: 0 });
      mockContext = createContext({ state });

      await node.execute(mockContext);

      expect(mockStateManager.beginRound).toHaveBeenCalledTimes(1);
      expect(mockStateManager.beginRound).toHaveBeenCalledWith('my-debate-id');
    });

    it('should call stateManager.getDebate with state.id after beginRound', async () => {
      state = createState({ id: 'debate-1', currentRound: 0 });
      mockContext = createContext({ state });

      await node.execute(mockContext);

      expect(mockStateManager.getDebate).toHaveBeenCalledTimes(1);
      expect(mockStateManager.getDebate).toHaveBeenCalledWith('debate-1');
    });

    it('should return BEGIN_ROUND with updated state from getDebate', async () => {
      const updatedState = createState({
        id: 'debate-1',
        currentRound: 1,
      });
      mockStateManager.getDebate.mockResolvedValue(updatedState);
      state = createState({ currentRound: 0 });
      mockContext = createContext({ state });

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.BEGIN_ROUND);
      expect(result.event.timestamp).toBeInstanceOf(Date);
      expect(result.updatedContext).toEqual({ state: updatedState });
    });

    it('should throw when getDebate returns null', async () => {
      mockStateManager.getDebate.mockResolvedValue(null);
      state = createState({ id: 'missing-debate', currentRound: 0 });
      mockContext = createContext({ state });

      await expect(node.execute(mockContext)).rejects.toThrow(
        'Debate missing-debate not found after beginRound'
      );
    });

    it('should throw when getDebate returns undefined', async () => {
      mockStateManager.getDebate.mockResolvedValue(undefined as unknown as DebateState);
      state = createState({ id: 'missing-debate', currentRound: 0 });
      mockContext = createContext({ state });

      await expect(node.execute(mockContext)).rejects.toThrow(
        'Debate missing-debate not found after beginRound'
      );
    });

    it('should use totalRounds of 1 when config.rounds is 0', async () => {
      state = createState({ currentRound: 0 });
      mockContext = createContext({
        state,
        config: { ...mockContext.config, rounds: 0 } as DebateConfig,
      });

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.BEGIN_ROUND);
      expect(mockStateManager.beginRound).toHaveBeenCalled();
    });

    it('should use totalRounds of 1 when config.rounds is negative', async () => {
      state = createState({ currentRound: 0 });
      mockContext = createContext({
        state,
        config: { ...mockContext.config, rounds: -5 } as DebateConfig,
      });

      const result = await node.execute(mockContext);

      expect(result.event.type).toBe(DEBATE_EVENTS.BEGIN_ROUND);
    });

    it('should compute nextRound as currentRound + 1 and pass to onRoundStart', async () => {
      const onRoundStart = jest.fn();
      node = new RoundManagerNode({ onRoundStart });
      state = createState({ currentRound: 2 });
      mockContext = createContext({ state });

      await node.execute(mockContext);

      expect(onRoundStart).toHaveBeenCalledWith(3, 3);
    });
  });
});
