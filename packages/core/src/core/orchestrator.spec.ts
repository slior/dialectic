import { DebateOrchestrator, DebateConfig, DebateRound, DebateState, Solution, Agent, StateManager, AgentConfig, Proposal, Critique, AGENT_ROLES, LLM_PROVIDERS, DebateContext, DebateSummary, ContextPreparationResult, TERMINATION_TYPES, SYNTHESIS_METHODS, SUMMARIZATION_METHODS, CONTRIBUTION_TYPES, ToolCall, ToolResult } from '@dialectic/core';
import fs from 'fs';
import path from 'path';
import os from 'os';

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

function createMockAgentWithToolMetadata(id: string, role: any, toolCalls?: ToolCall[], toolResults?: ToolResult[], iterations?: number): Agent {
  return {
    config: { id, role, model: 'gpt-4', name: `${role} agent` },
    propose: async () => ({
      content: `${role} proposal`,
      metadata: {
        toolCalls,
        toolResults,
        toolCallIterations: iterations,
      },
    }),
    critique: async () => ({
      content: `${role} critique`,
      metadata: {
        toolCalls,
        toolResults,
        toolCallIterations: iterations,
      },
    }),
    refine: async () => ({
      content: `${role} refined`,
      metadata: {
        toolCalls,
        toolResults,
        toolCallIterations: iterations,
      },
    }),
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

function createMockStateManagerWithToolSupport() {
  const state: DebateState = {
    id: 'deb-test',
    problem: 'Test problem',
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
    addSummary: async (_id: string, _summary: any) => {
      const round = state.rounds[state.currentRound - 1];
      if (!round) throw new Error('No active round');
      if (!round.summaries) round.summaries = {};
      state.updatedAt = new Date();
    },
    addJudgeSummary: async (_id: string, _summary: any) => {
      state.updatedAt = new Date();
    },
    completeDebate: async (_id: string, _solution: any) => {
      state.status = 'completed';
      state.updatedAt = new Date();
    },
    getDebate: async (_id: string) => state,
  } as any;
}

// Mock Agent that supports summarization
class MockAgent extends Agent {
  private summaryToReturn?: DebateSummary;

  constructor(config: AgentConfig, summaryToReturn?: DebateSummary) {
    super(config, {} as any);
    if (summaryToReturn) {
      this.summaryToReturn = summaryToReturn;
    }
  }

  setPreparedSummary(summary: DebateSummary) {
    this.summaryToReturn = summary;
  }

  async propose(_problem: string, _context: DebateContext): Promise<Proposal> {
    return { content: 'Mock proposal', metadata: { latencyMs: 100 } };
  }

  async critique(_proposal: Proposal, _context: DebateContext): Promise<Critique> {
    return { content: 'Mock critique', metadata: { latencyMs: 100 } };
  }

  async refine(_originalProposal: Proposal, _critiques: Critique[], _context: DebateContext): Promise<Proposal> {
    return { content: 'Mock refinement', metadata: { latencyMs: 100 } };
  }

  shouldSummarize(_context: DebateContext): boolean {
    return this.summaryToReturn !== undefined;
  }

  async prepareContext(
    context: DebateContext,
    _roundNumber: number
  ): Promise<ContextPreparationResult> {
    if (this.summaryToReturn) {
      return {
        context,
        summary: this.summaryToReturn
      };
    }
    return { context };
  }

  async askClarifyingQuestions(_problem: string, _context: DebateContext): Promise<{ questions: { id?: string; text: string }[] }> {
    return { questions: [] };
  }
}

// Mock Judge
class MockJudge extends Agent {
  constructor() {
    const config: AgentConfig = {
      id: 'judge',
      name: 'Judge',
      role: AGENT_ROLES.GENERALIST,
      model: 'gpt-4',
      provider: LLM_PROVIDERS.OPENAI,
      temperature: 0.3
    };
    super(config, {} as any);
  }

  async propose(_problem: string, _context: DebateContext): Promise<Proposal> {
    return { content: 'Judge proposal', metadata: {} };
  }

  async critique(_proposal: Proposal, _context: DebateContext): Promise<Critique> {
    return { content: 'Judge critique', metadata: {} };
  }

  async refine(_originalProposal: Proposal, _critiques: Critique[], _context: DebateContext): Promise<Proposal> {
    return { content: 'Judge refinement', metadata: {} };
  }

  shouldSummarize(_context: DebateContext): boolean {
    return false;
  }

  async prepareContext(context: DebateContext, _roundNumber: number): Promise<{ context: DebateContext }> {
    return { context };
  }

  async synthesize(_context: DebateContext): Promise<any> {
    return {
      description: 'Final solution',
      implementation: 'Implementation',
      tradeoffs: [],
      recommendations: [],
      confidence: 90,
      synthesizedBy: 'judge'
    };
  }

  async askClarifyingQuestions(_problem: string, _context: DebateContext): Promise<{ questions: { id?: string; text: string }[] }> {
    return { questions: [] };
  }
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
    const warnSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

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

describe('DebateOrchestrator - summarizationPhase()', () => {
  let tmpDir: string;
  
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debate-orch-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  const config: DebateConfig = {
    rounds: 1,
    terminationCondition: { type: TERMINATION_TYPES.FIXED },
    synthesisMethod: SYNTHESIS_METHODS.JUDGE,
    includeFullHistory: true,
    timeoutPerRound: 300000,
  };

  it('should call prepareContext for each agent', async () => {
    const agent1Config: AgentConfig = {
      id: 'agent-1',
      name: 'Agent 1',
      role: AGENT_ROLES.ARCHITECT,
      model: 'gpt-4',
      provider: LLM_PROVIDERS.OPENAI,
      temperature: 0.5
    };

    const agent2Config: AgentConfig = {
      id: 'agent-2',
      name: 'Agent 2',
      role: AGENT_ROLES.PERFORMANCE,
      model: 'gpt-4',
      provider: LLM_PROVIDERS.OPENAI,
      temperature: 0.5
    };

    const agent1 = new MockAgent(agent1Config);
    const agent2 = new MockAgent(agent2Config);
    const judge = new MockJudge();
    const stateManager = new StateManager(tmpDir);

    const prepareContextSpy1 = jest.spyOn(agent1, 'prepareContext');
    const prepareContextSpy2 = jest.spyOn(agent2, 'prepareContext');

    const orchestrator = new DebateOrchestrator([agent1, agent2], judge as any, stateManager, config);
    
    const state = await stateManager.createDebate('Test problem');
    
    // Access private method via type assertion for testing
    const result = await (orchestrator as any).summarizationPhase(state, 1);

    expect(prepareContextSpy1).toHaveBeenCalledTimes(1);
    expect(prepareContextSpy2).toHaveBeenCalledTimes(1);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(2);
  });

  it('should invoke summarization hooks correctly', async () => {
    const agentConfig: AgentConfig = {
      id: 'agent-1',
      name: 'Agent 1',
      role: AGENT_ROLES.ARCHITECT,
      model: 'gpt-4',
      provider: LLM_PROVIDERS.OPENAI,
      temperature: 0.5
    };

    const summary: DebateSummary = {
      agentId: 'agent-1',
      agentRole: AGENT_ROLES.ARCHITECT,
      summary: 'Test summary',
      metadata: {
        beforeChars: 1000,
        afterChars: 500,
        method: SUMMARIZATION_METHODS.LENGTH_BASED,
        timestamp: new Date(),
        latencyMs: 200,
        tokensUsed: 50
      }
    };

    const agent = new MockAgent(agentConfig, summary);
    const judge = new MockJudge();
    const stateManager = new StateManager(tmpDir);

    const onSummarizationStart = jest.fn();
    const onSummarizationComplete = jest.fn();

    const hooks = {
      onSummarizationStart,
      onSummarizationComplete
    };

    const orchestrator = new DebateOrchestrator([agent], judge as any, stateManager, config, hooks);
    
    const state = await stateManager.createDebate('Test problem');
    await stateManager.beginRound(state.id);
    
    await (orchestrator as any).summarizationPhase(state, 1);

    expect(onSummarizationStart).toHaveBeenCalledWith('Agent 1');
    expect(onSummarizationComplete).toHaveBeenCalledWith('Agent 1', 1000, 500);
  });

  it('should store summaries via state manager', async () => {
    const agentConfig: AgentConfig = {
      id: 'agent-1',
      name: 'Agent 1',
      role: AGENT_ROLES.ARCHITECT,
      model: 'gpt-4',
      provider: LLM_PROVIDERS.OPENAI,
      temperature: 0.5
    };

    const summary: DebateSummary = {
      agentId: 'agent-1',
      agentRole: AGENT_ROLES.ARCHITECT,
      summary: 'Test summary',
      metadata: {
        beforeChars: 1000,
        afterChars: 500,
        method: SUMMARIZATION_METHODS.LENGTH_BASED,
        timestamp: new Date()
      }
    };

    const agent = new MockAgent(agentConfig, summary);
    const judge = new MockJudge();
    const stateManager = new StateManager(tmpDir);

    const addSummarySpy = jest.spyOn(stateManager, 'addSummary');

    const orchestrator = new DebateOrchestrator([agent], judge as any, stateManager, config);
    
    const state = await stateManager.createDebate('Test problem');
    await stateManager.beginRound(state.id);
    
    await (orchestrator as any).summarizationPhase(state, 1);

    expect(addSummarySpy).toHaveBeenCalledWith(state.id, summary);
  });

  it('should return prepared contexts map', async () => {
    const agent1Config: AgentConfig = {
      id: 'agent-1',
      name: 'Agent 1',
      role: AGENT_ROLES.ARCHITECT,
      model: 'gpt-4',
      provider: LLM_PROVIDERS.OPENAI,
      temperature: 0.5
    };

    const agent2Config: AgentConfig = {
      id: 'agent-2',
      name: 'Agent 2',
      role: AGENT_ROLES.PERFORMANCE,
      model: 'gpt-4',
      provider: LLM_PROVIDERS.OPENAI,
      temperature: 0.5
    };

    const agent1 = new MockAgent(agent1Config);
    const agent2 = new MockAgent(agent2Config);
    const judge = new MockJudge();
    const stateManager = new StateManager(tmpDir);

    const orchestrator = new DebateOrchestrator([agent1, agent2], judge as any, stateManager, config);
    
    const state = await stateManager.createDebate('Test problem');
    
    const result = await (orchestrator as any).summarizationPhase(state, 1);

    expect(result.get('agent-1')).toBeDefined();
    expect(result.get('agent-2')).toBeDefined();
    expect(result.get('agent-1').problem).toBe('Test problem');
  });
});

describe('DebateOrchestrator - runDebate integration with summarization', () => {
  let tmpDir: string;
  
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debate-orch-int-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('should call summarization phase before proposal phase', async () => {
    const agentConfig: AgentConfig = {
      id: 'agent-1',
      name: 'Agent 1',
      role: AGENT_ROLES.ARCHITECT,
      model: 'gpt-4',
      provider: LLM_PROVIDERS.OPENAI,
      temperature: 0.5
    };

    const agent = new MockAgent(agentConfig);
    const judge = new MockJudge();
    const stateManager = new StateManager(tmpDir);

    const config: DebateConfig = {
      rounds: 1,
      terminationCondition: { type: TERMINATION_TYPES.FIXED },
      synthesisMethod: SYNTHESIS_METHODS.JUDGE,
      includeFullHistory: true,
      timeoutPerRound: 300000,
    };

    const prepareContextSpy = jest.spyOn(agent, 'prepareContext');

    const orchestrator = new DebateOrchestrator([agent], judge as any, stateManager, config);
    
    await orchestrator.runDebate('Test problem');

    // Should be called once per round
    expect(prepareContextSpy).toHaveBeenCalled();
  });

  it('should persist summaries in debate state', async () => {
    const agentId = 'agent-1';
    const agentConfig: AgentConfig = {
      id: agentId,
      name: 'Agent 1',
      role: AGENT_ROLES.ARCHITECT,
      model: 'gpt-4',
      provider: LLM_PROVIDERS.OPENAI,
      temperature: 0.5
    };

    const summary: DebateSummary = {
      agentId,
      agentRole: AGENT_ROLES.ARCHITECT,
      summary: 'Persisted summary',
      metadata: {
        beforeChars: 2000,
        afterChars: 1000,
        method: SUMMARIZATION_METHODS.LENGTH_BASED,
        timestamp: new Date()
      }
    };

    const agent = new MockAgent(agentConfig, summary);
    const judge = new MockJudge();
    const stateManager = new StateManager(tmpDir);

    const config: DebateConfig = {
      rounds: 1,
      terminationCondition: { type: TERMINATION_TYPES.FIXED },
      synthesisMethod: SYNTHESIS_METHODS.JUDGE,
      includeFullHistory: true,
      timeoutPerRound: 300000,
    };

    const orchestrator = new DebateOrchestrator([agent], judge as any, stateManager, config);
    
    const result = await orchestrator.runDebate('Test problem');

    const debate = await stateManager.getDebate(result.debateId);
    expect(debate).toBeDefined();
    const round = debate!.rounds[0];
    expect(round).toBeDefined();
    expect(round!.summaries).toBeDefined();
    expect(Object.keys(round!.summaries!).length).toBe(1);
    const summaries = round!.summaries;
    if (summaries) {
      expect(summaries[agentId]).toBeDefined();
      expect(summaries[agentId]!.summary).toBe('Persisted summary');
    }
  });
});

describe('Orchestrator Tool Metadata', () => {
  let orchestrator: DebateOrchestrator;
  let stateManager: any;

  beforeEach(() => {
    stateManager = createMockStateManagerWithToolSupport();
  });

  describe('Tool Calls Extraction', () => {
    it('should extract tool calls from agent response', async () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_1',
          name: 'test_tool',
          arguments: '{}',
        },
      ];

      const agents = [createMockAgentWithToolMetadata('agent1', 'architect', toolCalls)];
      const cfg: DebateConfig = {
        rounds: 1,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
      };

      orchestrator = new DebateOrchestrator(agents, mockJudge, stateManager, cfg);
      const result = await orchestrator.runDebate('Test problem');

      const debate = await stateManager.getDebate(result.debateId);
      const contribution = debate.rounds[0]?.contributions[0];

      expect(contribution).toBeDefined();
      expect(contribution.metadata.toolCalls).toBeDefined();
      expect(contribution.metadata.toolCalls).toEqual(toolCalls);
    });
  });

  describe('Tool Calls Storage', () => {
    it('should store tool calls in contribution metadata', async () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_1',
          name: 'context_search',
          arguments: '{"term":"test"}',
        },
      ];

      const agents = [createMockAgentWithToolMetadata('agent1', 'architect', toolCalls)];
      const cfg: DebateConfig = {
        rounds: 1,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
      };

      orchestrator = new DebateOrchestrator(agents, mockJudge, stateManager, cfg);
      await orchestrator.runDebate('Test problem');

      const debate = await stateManager.getDebate('deb-test');
      const contribution = debate.rounds[0]?.contributions.find(
        (c: any) => c.type === CONTRIBUTION_TYPES.PROPOSAL
      );

      expect(contribution.metadata.toolCalls).toBeDefined();
      expect(contribution.metadata.toolCalls[0].name).toBe('context_search');
    });
  });

  describe('Tool Results Storage', () => {
    it('should store tool results in contribution metadata', async () => {
      const toolResults: ToolResult[] = [
        {
          tool_call_id: 'call_1',
          role: 'tool',
          content: '{"status":"success","result":{}}',
        },
      ];

      const agents = [createMockAgentWithToolMetadata('agent1', 'architect', undefined, toolResults)];
      const cfg: DebateConfig = {
        rounds: 1,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
      };

      orchestrator = new DebateOrchestrator(agents, mockJudge, stateManager, cfg);
      await orchestrator.runDebate('Test problem');

      const debate = await stateManager.getDebate('deb-test');
      const contribution = debate.rounds[0]?.contributions.find(
        (c: any) => c.type === CONTRIBUTION_TYPES.PROPOSAL
      );

      expect(contribution.metadata.toolResults).toBeDefined();
      expect(contribution.metadata.toolResults[0].tool_call_id).toBe('call_1');
    });
  });

  describe('Tool Call Iterations Storage', () => {
    it('should store tool call iterations in contribution metadata', async () => {
      const agents = [createMockAgentWithToolMetadata('agent1', 'architect', undefined, undefined, 3)];
      const cfg: DebateConfig = {
        rounds: 1,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
      };

      orchestrator = new DebateOrchestrator(agents, mockJudge, stateManager, cfg);
      await orchestrator.runDebate('Test problem');

      const debate = await stateManager.getDebate('deb-test');
      const contribution = debate.rounds[0]?.contributions.find(
        (c: any) => c.type === CONTRIBUTION_TYPES.PROPOSAL
      );

      expect(contribution.metadata.toolCallIterations).toBe(3);
    });
  });

  describe('Tool Metadata Persistence', () => {
    it('should persist tool metadata in debate state', async () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_1',
          name: 'test_tool',
          arguments: '{}',
        },
      ];
      const toolResults: ToolResult[] = [
        {
          tool_call_id: 'call_1',
          role: 'tool',
          content: '{"status":"success"}',
        },
      ];

      const agents = [createMockAgentWithToolMetadata('agent1', 'architect', toolCalls, toolResults, 1)];
      const cfg: DebateConfig = {
        rounds: 1,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
      };

      orchestrator = new DebateOrchestrator(agents, mockJudge, stateManager, cfg);
      const result = await orchestrator.runDebate('Test problem');

      const debate = await stateManager.getDebate(result.debateId);
      const contribution = debate.rounds[0]?.contributions[0];

      expect(contribution.metadata.toolCalls).toBeDefined();
      expect(contribution.metadata.toolResults).toBeDefined();
      expect(contribution.metadata.toolCallIterations).toBe(1);
    });

    it('should persist tool metadata across all phases', async () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_1',
          name: 'test_tool',
          arguments: '{}',
        },
      ];

      // Use multiple agents so critiques and refinements are generated
      const agents = [
        createMockAgentWithToolMetadata('agent1', 'architect', toolCalls),
        createMockAgentWithToolMetadata('agent2', 'performance', toolCalls),
      ];
      const cfg: DebateConfig = {
        rounds: 1,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
      };

      orchestrator = new DebateOrchestrator(agents, mockJudge, stateManager, cfg);
      await orchestrator.runDebate('Test problem');

      const debate = await stateManager.getDebate('deb-test');
      const proposal = debate.rounds[0]?.contributions.find((c: any) => c.type === CONTRIBUTION_TYPES.PROPOSAL);
      const critique = debate.rounds[0]?.contributions.find((c: any) => c.type === CONTRIBUTION_TYPES.CRITIQUE);
      const refinement = debate.rounds[0]?.contributions.find((c: any) => c.type === CONTRIBUTION_TYPES.REFINEMENT);

      // All phases should have tool metadata if agent used tools
      expect(proposal?.metadata.toolCalls).toBeDefined();
      expect(critique?.metadata.toolCalls).toBeDefined();
      expect(refinement?.metadata.toolCalls).toBeDefined();
    });
  });
});

