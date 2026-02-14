import {
  TERMINATION_TYPES,
  SYNTHESIS_METHODS,
  DEBATE_STATUS,
  EXECUTION_STATUS,
  SUSPEND_REASON,
  CONTRIBUTION_TYPES,
  SUMMARIZATION_METHODS,
  ORCHESTRATOR_TYPES,
  DebateState,
  isExecutionResult,
  type DebateResult,
  type ExecutionResult,
  type DebateRound,
  type Solution,
} from './debate.types';

describe('debate.types', () => {
  describe('constants', () => {
    it('TERMINATION_TYPES has expected values', () => {
      expect(TERMINATION_TYPES.FIXED).toBe('fixed');
      expect(TERMINATION_TYPES.CONVERGENCE).toBe('convergence');
      expect(TERMINATION_TYPES.QUALITY).toBe('quality');
    });

    it('SYNTHESIS_METHODS has expected values', () => {
      expect(SYNTHESIS_METHODS.JUDGE).toBe('judge');
      expect(SYNTHESIS_METHODS.VOTING).toBe('voting');
      expect(SYNTHESIS_METHODS.MERGE).toBe('merge');
    });

    it('DEBATE_STATUS has expected values', () => {
      expect(DEBATE_STATUS.PENDING).toBe('pending');
      expect(DEBATE_STATUS.RUNNING).toBe('running');
      expect(DEBATE_STATUS.COMPLETED).toBe('completed');
      expect(DEBATE_STATUS.FAILED).toBe('failed');
    });

    it('EXECUTION_STATUS has expected values', () => {
      expect(EXECUTION_STATUS.COMPLETED).toBe('completed');
      expect(EXECUTION_STATUS.SUSPENDED).toBe('suspended');
    });

    it('SUSPEND_REASON has expected values', () => {
      expect(SUSPEND_REASON.WAITING_FOR_INPUT).toBe('WAITING_FOR_INPUT');
    });

    it('CONTRIBUTION_TYPES has expected values', () => {
      expect(CONTRIBUTION_TYPES.PROPOSAL).toBe('proposal');
      expect(CONTRIBUTION_TYPES.CRITIQUE).toBe('critique');
      expect(CONTRIBUTION_TYPES.REFINEMENT).toBe('refinement');
    });

    it('SUMMARIZATION_METHODS has expected values', () => {
      expect(SUMMARIZATION_METHODS.LENGTH_BASED).toBe('length-based');
    });

    it('ORCHESTRATOR_TYPES has expected values', () => {
      expect(ORCHESTRATOR_TYPES.CLASSIC).toBe('classic');
      expect(ORCHESTRATOR_TYPES.STATE_MACHINE).toBe('state-machine');
    });
  });

  describe('DebateState', () => {
    describe('hasRounds', () => {
      it('returns false when rounds is undefined', () => {
        const state = new DebateState();
        state.rounds = undefined!;
        expect(state.hasRounds()).toBe(false);
      });

      it('returns false when rounds is empty array', () => {
        const state = new DebateState();
        state.rounds = [];
        expect(state.hasRounds()).toBe(false);
      });

      it('returns true when rounds has at least one element', () => {
        const state = new DebateState();
        state.rounds = [
          {
            roundNumber: 1,
            contributions: [],
            timestamp: new Date(),
          },
        ];
        expect(state.hasRounds()).toBe(true);
      });
    });

    describe('hasClarifications', () => {
      it('returns false when clarifications is undefined', () => {
        const state = new DebateState();
        expect(state.hasClarifications()).toBe(false);
      });

      it('returns false when clarifications is empty array', () => {
        const state = new DebateState();
        state.clarifications = [];
        expect(state.hasClarifications()).toBe(false);
      });

      it('returns true when clarifications has at least one element', () => {
        const state = new DebateState();
        state.clarifications = [
          {
            agentId: 'a1',
            agentName: 'Agent',
            role: 'architect',
            items: [{ id: 'q1', question: 'Q?', answer: 'A' }],
          },
        ];
        expect(state.hasClarifications()).toBe(true);
      });
    });

    describe('getLatestRound', () => {
      it('returns undefined when there are no rounds', () => {
        const state = new DebateState();
        state.rounds = [];
        expect(state.getLatestRound()).toBeUndefined();
      });

      it('returns undefined when rounds is undefined', () => {
        const state = new DebateState();
        state.rounds = undefined!;
        expect(state.getLatestRound()).toBeUndefined();
      });

      it('returns the last round when rounds exist', () => {
        const state = new DebateState();
        const first: DebateRound = {
          roundNumber: 1,
          contributions: [],
          timestamp: new Date('2020-01-01'),
        };
        const last: DebateRound = {
          roundNumber: 2,
          contributions: [],
          timestamp: new Date('2020-01-02'),
        };
        state.rounds = [first, last];
        expect(state.getLatestRound()).toBe(last);
        expect(state.getLatestRound()?.roundNumber).toBe(2);
      });
    });

    describe('fromJSON', () => {
      it('creates state and revives createdAt/updatedAt from strings', () => {
        const data: Record<string, unknown> = {
          id: 'debate-1',
          problem: 'P',
          status: 'running',
          currentRound: 0,
          rounds: [],
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T11:00:00.000Z',
        };
        const state = DebateState.fromJSON(data);
        expect(state.id).toBe('debate-1');
        expect(state.createdAt).toEqual(new Date('2024-01-15T10:00:00.000Z'));
        expect(state.updatedAt).toEqual(new Date('2024-01-15T11:00:00.000Z'));
      });

      it('keeps createdAt/updatedAt when already Date instances', () => {
        const created = new Date('2024-01-01');
        const updated = new Date('2024-01-02');
        const data: Record<string, unknown> = {
          id: 'debate-2',
          problem: 'P',
          status: 'pending',
          currentRound: 0,
          rounds: [],
          createdAt: created,
          updatedAt: updated,
        };
        const state = DebateState.fromJSON(data);
        expect(state.createdAt).toBe(created);
        expect(state.updatedAt).toBe(updated);
      });

      it('revives createdAt from string and updatedAt from Date', () => {
        const updated = new Date('2024-01-02');
        const data: Record<string, unknown> = {
          id: 'd',
          problem: 'P',
          status: 'pending',
          currentRound: 0,
          rounds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: updated,
        };
        const state = DebateState.fromJSON(data);
        expect(state.createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'));
        expect(state.updatedAt).toBe(updated);
      });

      it('revives updatedAt from string and createdAt from Date', () => {
        const created = new Date('2024-01-01');
        const data: Record<string, unknown> = {
          id: 'd',
          problem: 'P',
          status: 'pending',
          currentRound: 0,
          rounds: [],
          createdAt: created,
          updatedAt: '2024-01-02T00:00:00.000Z',
        };
        const state = DebateState.fromJSON(data);
        expect(state.createdAt).toBe(created);
        expect(state.updatedAt).toEqual(new Date('2024-01-02T00:00:00.000Z'));
      });
    });
  });

  describe('isExecutionResult', () => {
    it('returns true when value has status property (ExecutionResult)', () => {
      const value: ExecutionResult = {
        status: 'suspended',
        suspendReason: 'WAITING_FOR_INPUT',
        suspendPayload: {
          debateId: 'd1',
          questions: [],
          iteration: 1,
        },
      };
      expect(isExecutionResult(value)).toBe(true);
    });

    it('returns true for completed ExecutionResult', () => {
      const solution: Solution = {
        description: 'd',
        tradeoffs: [],
        recommendations: [],
        confidence: 80,
        synthesizedBy: 'judge',
      };
      const value: ExecutionResult = {
        status: 'completed',
        result: {
          debateId: 'd1',
          solution,
          rounds: [],
          metadata: { totalRounds: 1, durationMs: 100 },
        },
      };
      expect(isExecutionResult(value)).toBe(true);
    });

    it('returns false when value is DebateResult (no status)', () => {
      const solution: Solution = {
        description: 'd',
        tradeoffs: [],
        recommendations: [],
        confidence: 80,
        synthesizedBy: 'judge',
      };
      const value: DebateResult = {
        debateId: 'd1',
        solution,
        rounds: [],
        metadata: { totalRounds: 1, durationMs: 100 },
      };
      expect(isExecutionResult(value)).toBe(false);
    });
  });
});
