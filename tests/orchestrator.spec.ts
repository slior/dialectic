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
    addContribution: async (_id: string, contrib: any) => {
      let round = state.rounds[state.currentRound - 1];
      if (!round) {
        round = { roundNumber: state.currentRound + 1, phase: contrib.type, contributions: [], timestamp: new Date() };
        state.rounds.push(round);
        state.currentRound = round.roundNumber;
      }
      round.contributions.push(contrib);
      state.updatedAt = new Date();
    },
    completeDebate: async (_id: string, solution: Solution) => {
      state.status = 'completed';
      (state as any).finalSolution = solution;
      state.updatedAt = new Date();
    },
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
  });

  it('with rounds=1 only runs proposals and synthesizes', async () => {
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
  });
});
