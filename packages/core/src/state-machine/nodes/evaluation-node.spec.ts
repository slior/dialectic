import type { JudgeAgent } from '../../core/judge';
import type { StateManager } from '../../core/state-manager';
import { DEFAULT_TERMINATION_THRESHOLD } from '../../types/config.types';
import {
  DebateState,
  DebateConfig,
  DEBATE_STATUS,
  TERMINATION_TYPES,
} from '../../types/debate.types';
import type { TracingContext } from '../../types/tracing.types';
import { DEBATE_EVENTS } from '../events';
import { NodeContext } from '../node';
import { NODE_TYPES } from '../types';

import { EvaluationNode } from './evaluation-node';

describe('EvaluationNode', () => {
  let node: EvaluationNode;
  let state: DebateState;
  let mockJudge: jest.Mocked<Pick<JudgeAgent, 'evaluateConfidence'>>;
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
        terminationCondition: { type: TERMINATION_TYPES.FIXED },
        synthesisMethod: 'judge',
        includeFullHistory: false,
        timeoutPerRound: 300000,
      } as DebateConfig,
      agents: [],
      judge: mockJudge as unknown as JudgeAgent,
      stateManager: mockStateManager,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    state = createState();
    mockJudge = {
      evaluateConfidence: jest.fn().mockResolvedValue(50),
    };
    mockStateManager = {
      getDebate: jest.fn().mockResolvedValue(state),
    } as unknown as jest.Mocked<StateManager>;
    mockContext = createContext();
    node = new EvaluationNode();
  });

  describe('nodeType', () => {
    it('should have nodeType EVALUATION', () => {
      expect(node.nodeType).toBe(NODE_TYPES.EVALUATION);
    });
  });

  describe('execute', () => {
    describe('fixed termination', () => {
      it('should return MAX_ROUNDS_REACHED when currentRound >= config.rounds', async () => {
        state = createState({ currentRound: 3 });
        mockContext = createContext({
          state,
          config: { ...mockContext.config, rounds: 3 } as DebateConfig,
        });

        const result = await node.execute(mockContext);

        expect(result.event.type).toBe(DEBATE_EVENTS.MAX_ROUNDS_REACHED);
        expect(result.event.timestamp).toBeInstanceOf(Date);
        expect(mockJudge.evaluateConfidence).not.toHaveBeenCalled();
      });

      it('should return MAX_ROUNDS_REACHED when currentRound exceeds config.rounds', async () => {
        state = createState({ currentRound: 5 });
        mockContext = createContext({
          state,
          config: { ...mockContext.config, rounds: 3 } as DebateConfig,
        });

        const result = await node.execute(mockContext);

        expect(result.event.type).toBe(DEBATE_EVENTS.MAX_ROUNDS_REACHED);
      });

      it('should return CONTINUE when currentRound < config.rounds', async () => {
        state = createState({ currentRound: 0 });
        mockContext = createContext({
          state,
          config: { ...mockContext.config, rounds: 3 } as DebateConfig,
        });

        const result = await node.execute(mockContext);

        expect(result.event.type).toBe(DEBATE_EVENTS.CONTINUE);
        expect(result.event.timestamp).toBeInstanceOf(Date);
        expect(mockJudge.evaluateConfidence).not.toHaveBeenCalled();
      });

      it('should return CONTINUE when currentRound is one less than config.rounds', async () => {
        state = createState({ currentRound: 2 });
        mockContext = createContext({
          state,
          config: { ...mockContext.config, rounds: 3 } as DebateConfig,
        });

        const result = await node.execute(mockContext);

        expect(result.event.type).toBe(DEBATE_EVENTS.CONTINUE);
      });
    });

    describe('convergence/quality termination', () => {
      it('should return CONSENSUS_REACHED when confidenceScore >= default threshold', async () => {
        state = createState({ currentRound: 1 });
        mockJudge.evaluateConfidence.mockResolvedValue(DEFAULT_TERMINATION_THRESHOLD);
        mockContext = createContext({
          state,
          config: {
            ...mockContext.config,
            terminationCondition: { type: TERMINATION_TYPES.CONVERGENCE },
          } as DebateConfig,
        });

        const result = await node.execute(mockContext);

        expect(mockJudge.evaluateConfidence).toHaveBeenCalledTimes(1);
        expect(mockJudge.evaluateConfidence).toHaveBeenCalledWith(state, undefined);
        expect(result.event.type).toBe(DEBATE_EVENTS.CONSENSUS_REACHED);
        expect(result.event.payload).toEqual({
          confidenceScore: DEFAULT_TERMINATION_THRESHOLD,
        });
        expect(result.event.timestamp).toBeInstanceOf(Date);
      });

      it('should return CONSENSUS_REACHED when confidenceScore > default threshold', async () => {
        state = createState({ currentRound: 1 });
        mockJudge.evaluateConfidence.mockResolvedValue(95);
        mockContext = createContext({
          state,
          config: {
            ...mockContext.config,
            terminationCondition: { type: TERMINATION_TYPES.CONVERGENCE },
          } as DebateConfig,
        });

        const result = await node.execute(mockContext);

        expect(result.event.type).toBe(DEBATE_EVENTS.CONSENSUS_REACHED);
        expect(result.event.payload).toEqual({ confidenceScore: 95 });
      });

      it('should return CONTINUE when confidenceScore < default threshold', async () => {
        state = createState({ currentRound: 1 });
        mockJudge.evaluateConfidence.mockResolvedValue(70);
        mockContext = createContext({
          state,
          config: {
            ...mockContext.config,
            terminationCondition: { type: TERMINATION_TYPES.CONVERGENCE },
          } as DebateConfig,
        });

        const result = await node.execute(mockContext);

        expect(mockJudge.evaluateConfidence).toHaveBeenCalledWith(state, undefined);
        expect(result.event.type).toBe(DEBATE_EVENTS.CONTINUE);
        expect(result.event.payload).toBeUndefined();
      });

      it('should use custom threshold when provided and return CONSENSUS_REACHED when score >= threshold', async () => {
        state = createState({ currentRound: 1 });
        mockJudge.evaluateConfidence.mockResolvedValue(80);
        mockContext = createContext({
          state,
          config: {
            ...mockContext.config,
            terminationCondition: {
              type: TERMINATION_TYPES.QUALITY,
              threshold: 75,
            },
          } as DebateConfig,
        });

        const result = await node.execute(mockContext);

        expect(result.event.type).toBe(DEBATE_EVENTS.CONSENSUS_REACHED);
        expect(result.event.payload).toEqual({ confidenceScore: 80 });
      });

      it('should use custom threshold when provided and return CONTINUE when score < threshold', async () => {
        state = createState({ currentRound: 1 });
        mockJudge.evaluateConfidence.mockResolvedValue(60);
        mockContext = createContext({
          state,
          config: {
            ...mockContext.config,
            terminationCondition: {
              type: TERMINATION_TYPES.QUALITY,
              threshold: 85,
            },
          } as DebateConfig,
        });

        const result = await node.execute(mockContext);

        expect(result.event.type).toBe(DEBATE_EVENTS.CONTINUE);
      });

      it('should pass tracingContext to judge.evaluateConfidence when provided', async () => {
        const tracingContext = {
          langfuse: {} as TracingContext['langfuse'],
          trace: {} as TracingContext['trace'],
          currentSpans: new Map(),
        } as TracingContext;
        state = createState({ currentRound: 1 });
        mockJudge.evaluateConfidence.mockResolvedValue(50);
        mockContext = createContext({
          state,
          tracingContext,
          config: {
            ...mockContext.config,
            terminationCondition: { type: TERMINATION_TYPES.CONVERGENCE },
          } as DebateConfig,
        });

        await node.execute(mockContext);

        expect(mockJudge.evaluateConfidence).toHaveBeenCalledWith(
          state,
          tracingContext
        );
      });
    });

    describe('result contract', () => {
      it('should return result that applies to context without changes when no updatedContext', async () => {
        state = createState({ currentRound: 3 });
        mockContext = createContext({
          state,
          config: { ...mockContext.config, rounds: 3 } as DebateConfig,
        });

        const result = await node.execute(mockContext);
        const applied = result.applyToContext(mockContext);

        expect(applied).toBe(mockContext);
      });
    });
  });
});
