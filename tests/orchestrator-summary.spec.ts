import { DebateOrchestrator } from '../src/core/orchestrator';
import { Agent } from '../src/core/agent';
import { StateManager } from '../src/core/state-manager';
import { AgentConfig, Proposal, Critique, AGENT_ROLES, LLM_PROVIDERS } from '../src/types/agent.types';
import { DebateContext, DebateConfig, DebateSummary, ContextPreparationResult, TERMINATION_TYPES, SYNTHESIS_METHODS, SUMMARIZATION_METHODS } from '../src/types/debate.types';
import fs from 'fs';
import path from 'path';
import os from 'os';

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

  // New abstract method requirement: return no clarifications by default
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

  // New abstract method requirement: judge does not ask questions
  async askClarifyingQuestions(_problem: string, _context: DebateContext): Promise<{ questions: { id?: string; text: string }[] }> {
    return { questions: [] };
  }
}

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

