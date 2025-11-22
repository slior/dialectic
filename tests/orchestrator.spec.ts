import { DebateOrchestrator } from '../src/core/orchestrator';
import { DebateConfig, DebateRound, DebateState, Solution } from '../src/types/debate.types';
import { Agent } from '../src/core/agent';

function createMockAgent(id: string, role: any, withToolCalls = false): Agent {
  const baseMetadata = {};
  const toolMetadata = withToolCalls ? {
    toolCalls: [{ id: 'call_1', name: 'test_tool', arguments: '{}' }],
    toolResults: [{ tool_call_id: 'call_1', role: 'tool', content: '{"status":"success"}' }],
    toolCallIterations: 1,
  } : {};
  
  return {
    config: { id, role, model: 'gpt-4', name: `${role} agent` },
    propose: async () => ({ content: `${role} proposal`, metadata: { ...baseMetadata, ...toolMetadata } }),
    critique: async () => ({ content: `${role} critique`, metadata: { ...baseMetadata, ...toolMetadata } }),
    refine: async () => ({ content: `${role} refined`, metadata: { ...baseMetadata, ...toolMetadata } }),
    shouldSummarize: () => false,
    prepareContext: async (context: any) => ({ context }),
    askClarifyingQuestions: async () => ({ questions: [] }),
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
  prepareContext: async (_rounds: DebateRound[]) => ({ context: { problem: '', history: [] } }),
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

  it('round 2 proposals are sourced from round 1 refinements with zeroed metadata', async () => {
    const agents = [createMockAgent('a1', 'architect'), createMockAgent('a2', 'performance')];
    const sm = createMockStateManager();
    const cfg: DebateConfig = {
      rounds: 2,
      terminationCondition: { type: 'fixed' },
      synthesisMethod: 'judge',
      includeFullHistory: true,
      timeoutPerRound: 300000,
    };

    const orchestrator = new DebateOrchestrator(agents as any, mockJudge, sm as any, cfg);
    await orchestrator.runDebate('Design X');

    const state = (sm as any).getState();
    expect(state.rounds.length).toBe(2);

    const r1 = state.rounds[0];
    const r2 = state.rounds[1];

    const r1RefByAgent: Record<string, string> = {};
    r1.contributions.filter((c: any) => c.type === 'refinement').forEach((c: any) => {
      r1RefByAgent[c.agentId] = c.content;
    });

    const r2Props = r2.contributions.filter((c: any) => c.type === 'proposal');
    expect(r2Props.length).toBe(agents.length);

    // Proposals in round 2 must equal refinements from round 1 per agent, with tokens/latency zero
    for (const p of r2Props) {
      expect(p.content).toBe(r1RefByAgent[p.agentId]);
      expect(p.metadata?.tokensUsed ?? 0).toBe(0);
      expect(p.metadata?.latencyMs ?? 0).toBe(0);
      expect(typeof p.metadata?.model).toBe('string');
    }
  });

  it('falls back to LLM proposal and warns when prior refinement is missing', async () => {
    const agents = [createMockAgent('a1', 'architect'), createMockAgent('a2', 'performance')];

    // Custom SM that drops refinement for agent a2 in round 1
    const state: any = {
      id: 'deb-test', problem: '', status: 'running', currentRound: 0, rounds: [], createdAt: new Date(), updatedAt: new Date(),
    };
    const sm = {
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
        // Drop refinement for a2 in round 1 only
        if (round.roundNumber === 1 && contrib.type === 'refinement' && contrib.agentId === 'a2') {
          return;
        }
        round.contributions.push(contrib);
        state.updatedAt = new Date();
      },
      completeDebate: async (_id: string, solution: Solution) => { state.status = 'completed'; (state as any).finalSolution = solution; state.updatedAt = new Date(); },
      getState: () => state,
    } as any;

    // Spy on stderr warnings
    const stderr = await import('../src/utils/console');
    const warnSpy = jest.spyOn(stderr, 'writeStderr').mockImplementation(() => {});

    const cfg: DebateConfig = {
      rounds: 2,
      terminationCondition: { type: 'fixed' },
      synthesisMethod: 'judge',
      includeFullHistory: true,
      timeoutPerRound: 300000,
    };

    const orchestrator = new DebateOrchestrator(agents as any, mockJudge, sm as any, cfg);
    await orchestrator.runDebate('Design Y');

    const r1 = state.rounds[0];
    const r2 = state.rounds[1];

    // a1 should be carried over; a2 should fall back to LLM proposal content
    const r1RefA1 = r1.contributions.find((c: any) => c.type === 'refinement' && c.agentId === 'a1')?.content;
    const r2PropA1 = r2.contributions.find((c: any) => c.type === 'proposal' && c.agentId === 'a1')?.content;
    expect(r2PropA1).toBe(r1RefA1);

    const r2PropA2 = r2.contributions.find((c: any) => c.type === 'proposal' && c.agentId === 'a2')?.content;
    expect(r2PropA2).toBe('performance proposal');

    expect(warnSpy).toHaveBeenCalled();
    const calls = warnSpy.mock.calls.flat().join(' ');
    expect(calls).toMatch(/Missing previous refinement/);

    warnSpy.mockRestore();
  });

  it('includes tool calls in contribution metadata when agent uses tools', async () => {
    const agents = [createMockAgent('a1', 'architect', true)];
    const sm = createMockStateManager();
    const cfg: DebateConfig = {
      rounds: 1,
      terminationCondition: { type: 'fixed' },
      synthesisMethod: 'judge',
      includeFullHistory: true,
      timeoutPerRound: 300000,
    };

    const orchestrator = new DebateOrchestrator(agents as any, mockJudge, sm as any, cfg);
    await orchestrator.runDebate('Test problem');

    const state = (sm as any).getState();
    const proposal = state.rounds[0]?.contributions.find((c: any) => c.type === 'proposal');
    
    expect(proposal).toBeDefined();
    expect(proposal.metadata.toolCalls).toBeDefined();
    expect(proposal.metadata.toolCalls.length).toBe(1);
    expect(proposal.metadata.toolResults).toBeDefined();
    expect(proposal.metadata.toolCallIterations).toBe(1);
  });

  it('persists tool results in contribution metadata', async () => {
    const agents = [createMockAgent('a1', 'architect', true)];
    const sm = createMockStateManager();
    const cfg: DebateConfig = {
      rounds: 1,
      terminationCondition: { type: 'fixed' },
      synthesisMethod: 'judge',
      includeFullHistory: true,
      timeoutPerRound: 300000,
    };

    const orchestrator = new DebateOrchestrator(agents as any, mockJudge, sm as any, cfg);
    await orchestrator.runDebate('Test problem');

    const state = (sm as any).getState();
    const proposal = state.rounds[0]?.contributions.find((c: any) => c.type === 'proposal');
    
    expect(proposal.metadata.toolResults).toBeDefined();
    expect(proposal.metadata.toolResults.length).toBe(1);
    expect(proposal.metadata.toolResults[0].tool_call_id).toBe('call_1');
    expect(proposal.metadata.toolResults[0].role).toBe('tool');
  });
});
