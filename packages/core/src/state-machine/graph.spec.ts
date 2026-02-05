import { DEBATE_EVENTS, createEvent } from './events';
import { NODE_TYPES } from './types';
import { TransitionGraph, TransitionRule } from './graph';
import { NodeContext } from './node';
import { DebateState, DebateConfig, DEBATE_STATUS } from '../types/debate.types';
import { JudgeAgent } from '../core/judge';
import { StateManager } from '../core/state-manager';

describe('TransitionGraph', () => {
  let graph: TransitionGraph;
  let mockContext: NodeContext;

  beforeEach(() => {
    graph = new TransitionGraph();
    const state = new DebateState();
    state.id = 'test-debate';
    state.problem = 'Test problem';
    state.status = DEBATE_STATUS.RUNNING;
    state.currentRound = 1;
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
      judge: {} as JudgeAgent,
      stateManager: {} as StateManager,
    };
  });

  describe('getNextNode', () => {
    it('should transition from INITIALIZATION to CLARIFICATION on START', () => {
      const event = createEvent(DEBATE_EVENTS.START);
      const next = graph.getNextNode(NODE_TYPES.INITIALIZATION, event, mockContext);
      expect(next).toBe(NODE_TYPES.CLARIFICATION);
    });

    it('should transition from CLARIFICATION to CLARIFICATION_INPUT on QUESTIONS_PENDING', () => {
      const event = createEvent(DEBATE_EVENTS.QUESTIONS_PENDING);
      const next = graph.getNextNode(NODE_TYPES.CLARIFICATION, event, mockContext);
      expect(next).toBe(NODE_TYPES.CLARIFICATION_INPUT);
    });

    it('should transition from CLARIFICATION_INPUT to CLARIFICATION on ANSWERS_SUBMITTED', () => {
      const event = createEvent(DEBATE_EVENTS.ANSWERS_SUBMITTED);
      const next = graph.getNextNode(NODE_TYPES.CLARIFICATION_INPUT, event, mockContext);
      expect(next).toBe(NODE_TYPES.CLARIFICATION);
    });

    it('should return null (suspend) from CLARIFICATION_INPUT on WAITING_FOR_INPUT', () => {
      const event = createEvent(DEBATE_EVENTS.WAITING_FOR_INPUT);
      const next = graph.getNextNode(NODE_TYPES.CLARIFICATION_INPUT, event, mockContext);
      expect(next).toBeNull();
    });

    it('should transition from CLARIFICATION to ROUND_MANAGER on ALL_CLEAR', () => {
      const event = createEvent(DEBATE_EVENTS.ALL_CLEAR);
      const next = graph.getNextNode(NODE_TYPES.CLARIFICATION, event, mockContext);
      expect(next).toBe(NODE_TYPES.ROUND_MANAGER);
    });

    it('should transition from ROUND_MANAGER to SUMMARIZATION on BEGIN_ROUND', () => {
      const event = createEvent(DEBATE_EVENTS.BEGIN_ROUND);
      const next = graph.getNextNode(NODE_TYPES.ROUND_MANAGER, event, mockContext);
      expect(next).toBe(NODE_TYPES.SUMMARIZATION);
    });

    it('should transition from SUMMARIZATION to PROPOSAL on CONTEXTS_READY', () => {
      const event = createEvent(DEBATE_EVENTS.CONTEXTS_READY);
      const next = graph.getNextNode(NODE_TYPES.SUMMARIZATION, event, mockContext);
      expect(next).toBe(NODE_TYPES.PROPOSAL);
    });

    it('should transition from PROPOSAL to CRITIQUE on PROPOSALS_COMPLETE', () => {
      const event = createEvent(DEBATE_EVENTS.PROPOSALS_COMPLETE);
      const next = graph.getNextNode(NODE_TYPES.PROPOSAL, event, mockContext);
      expect(next).toBe(NODE_TYPES.CRITIQUE);
    });

    it('should transition from CRITIQUE to REFINEMENT on CRITIQUES_COMPLETE', () => {
      const event = createEvent(DEBATE_EVENTS.CRITIQUES_COMPLETE);
      const next = graph.getNextNode(NODE_TYPES.CRITIQUE, event, mockContext);
      expect(next).toBe(NODE_TYPES.REFINEMENT);
    });

    it('should transition from REFINEMENT to EVALUATION on REFINEMENTS_COMPLETE', () => {
      const event = createEvent(DEBATE_EVENTS.REFINEMENTS_COMPLETE);
      const next = graph.getNextNode(NODE_TYPES.REFINEMENT, event, mockContext);
      expect(next).toBe(NODE_TYPES.EVALUATION);
    });

    it('should transition from EVALUATION to ROUND_MANAGER on CONTINUE', () => {
      const event = createEvent(DEBATE_EVENTS.CONTINUE);
      const next = graph.getNextNode(NODE_TYPES.EVALUATION, event, mockContext);
      expect(next).toBe(NODE_TYPES.ROUND_MANAGER);
    });

    it('should transition from EVALUATION to SYNTHESIS on CONSENSUS_REACHED', () => {
      const event = createEvent(DEBATE_EVENTS.CONSENSUS_REACHED);
      const next = graph.getNextNode(NODE_TYPES.EVALUATION, event, mockContext);
      expect(next).toBe(NODE_TYPES.SYNTHESIS);
    });

    it('should transition from ROUND_MANAGER to SYNTHESIS on MAX_ROUNDS_REACHED', () => {
      const event = createEvent(DEBATE_EVENTS.MAX_ROUNDS_REACHED);
      const next = graph.getNextNode(NODE_TYPES.ROUND_MANAGER, event, mockContext);
      expect(next).toBe(NODE_TYPES.SYNTHESIS);
    });

    it('should return null (terminal) from SYNTHESIS on COMPLETE', () => {
      const event = createEvent(DEBATE_EVENTS.COMPLETE);
      const next = graph.getNextNode(NODE_TYPES.SYNTHESIS, event, mockContext);
      expect(next).toBeNull();
    });

    it('should return null for invalid transitions', () => {
      const event = createEvent(DEBATE_EVENTS.START);
      const next = graph.getNextNode(NODE_TYPES.PROPOSAL, event, mockContext);
      expect(next).toBeNull();
    });
  });

  describe('custom rules', () => {
    it('should use custom transition rules when provided', () => {
      const customRules: TransitionRule[] = [
        { from: NODE_TYPES.INITIALIZATION, event: 'START', to: NODE_TYPES.SYNTHESIS },
      ];
      const customGraph = new TransitionGraph(customRules);
      const event = createEvent(DEBATE_EVENTS.START);
      const next = customGraph.getNextNode(NODE_TYPES.INITIALIZATION, event, mockContext);
      expect(next).toBe(NODE_TYPES.SYNTHESIS);
    });

    it('should respect conditional transitions', () => {
      const conditionalRules: TransitionRule[] = [
        {
          from: NODE_TYPES.EVALUATION,
          event: 'CONTINUE',
          to: NODE_TYPES.ROUND_MANAGER,
          condition: (ctx) => ctx.state.currentRound < ctx.config.rounds,
        },
        {
          from: NODE_TYPES.EVALUATION,
          event: 'CONTINUE',
          to: NODE_TYPES.SYNTHESIS,
          condition: (ctx) => ctx.state.currentRound >= ctx.config.rounds,
        },
      ];
      const conditionalGraph = new TransitionGraph(conditionalRules);

      // Test condition true
      const event = createEvent(DEBATE_EVENTS.CONTINUE);
      const next1 = conditionalGraph.getNextNode(NODE_TYPES.EVALUATION, event, mockContext);
      expect(next1).toBe(NODE_TYPES.ROUND_MANAGER);

      // Test condition false
      const maxRoundState = new DebateState();
      Object.assign(maxRoundState, mockContext.state);
      maxRoundState.currentRound = 3;
      const maxRoundContext = {
        ...mockContext,
        state: maxRoundState,
        config: { ...mockContext.config, rounds: 3 },
      };
      const next2 = conditionalGraph.getNextNode(NODE_TYPES.EVALUATION, event, maxRoundContext);
      expect(next2).toBe(NODE_TYPES.SYNTHESIS);
    });
  });
});
