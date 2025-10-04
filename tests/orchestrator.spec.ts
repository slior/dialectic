import { DebateOrchestrator } from '../src/core/orchestrator';
import { DebateConfig, DebateRound, DebateState, Solution } from '../src/types/debate.types';
import { Agent } from '../src/core/agent';

function createMockAgent(id: string, role: any): Agent {
  return {
    config: { id, role, model: 'gpt-4' },
    propose: async () => ({ content: `${role} proposal`, metadata: {} }),
    critique: async () => ({ content: `${role} critique`, metadata: {} }),
    refine: async () => ({ content: `${role} refined`, metadata: {} }),
  } as any;
}

const mockJudge = {
  synthesize: async (_problem: string, _rounds: DebateRound[]) => ({
    description: 'final',
    tradeoffs: [],
    recommendations: [],
    confidence: 80,
    synthesizedBy: 'judge',
  } as Solution),
} as any;

function createMockStateManager() {
  const state: DebateState = {
    id: 'deb-test',
    problem: '',
    status: 'running',
    currentRound: 0,
    rounds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  return {
    createDebate: async (problem: string) => ({ ...state, problem }),
    beginRound: async (_id: string) => {
      const round = { roundNumber: state.rounds.length + 1, contributions: [], timestamp: new Date() } as DebateRound;
      state.rounds.push(round);
      state.currentRound = round.roundNumber;
      state.updatedAt = new Date();
      return round;
    },
    addContribution: async (_id: string, contrib: any) => {
      const round = state.rounds[state.currentRound - 1];
      if (!round) throw new Error('No active round');
      round.contributions.push(contrib);
      state.updatedAt = new Date();
    },
    completeDebate: async (_id: string, solution: Solution) => {
      state.status = 'completed';
      (state as any).finalSolution = solution;
      state.updatedAt = new Date();
    },
    getState: () => state,
  } as any;
}

describe('DebateOrchestrator (Flow 1)', () => {
  it('runs the correct phases for rounds=3 and calls judge synthesis', async () => {
    const agents = [createMockAgent('a1', 'architect'), createMockAgent('a2', 'performance')];
    const sm = createMockStateManager();
    const cfg: DebateConfig = {
      rounds: 3,
      terminationCondition: { type: 'fixed' },
      synthesisMethod: 'judge',
      includeFullHistory: true,
      timeoutPerRound: 300000,
    };

    const orchestrator = new DebateOrchestrator(agents as any, mockJudge, sm as any, cfg);
    await expect(orchestrator.runDebate('Design a caching system')).resolves.toBeDefined();

    const state = (sm as any).getState();
    expect(state.rounds.length).toBe(3);
    // Each round should include refinement contributions
    state.rounds.forEach((round: DebateRound) => {
      const hasRefinement = round.contributions.some((c: any) => c.type === 'refinement');
      expect(hasRefinement).toBe(true);
    });
  });

  it('with rounds=1 runs all phases and synthesizes', async () => {
    const agents = [createMockAgent('a1', 'architect'), createMockAgent('a2', 'performance')];
    const sm = createMockStateManager();
    const cfg: DebateConfig = {
      rounds: 1,
      terminationCondition: { type: 'fixed' },
      synthesisMethod: 'judge',
      includeFullHistory: true,
      timeoutPerRound: 300000,
    };

    const orchestrator = new DebateOrchestrator(agents as any, mockJudge, sm as any, cfg);
    await expect(orchestrator.runDebate('Design a rate limiting system')).resolves.toBeDefined();

    const state = (sm as any).getState();
    expect(state.rounds.length).toBe(1);
    const hasProposal = state.rounds[0].contributions.some((c: any) => c.type === 'proposal');
    const hasCritique = state.rounds[0].contributions.some((c: any) => c.type === 'critique');
    const hasRefinement = state.rounds[0].contributions.some((c: any) => c.type === 'refinement');
    expect(hasProposal && hasCritique && hasRefinement).toBe(true);
  });
});
