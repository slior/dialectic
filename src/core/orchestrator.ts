import { Agent } from './agent';
import { JudgeAgent } from './judge';
import { StateManager } from './state-manager';
import { DebateConfig, DebateContext, DebateResult, DebateState, DebateRound, Contribution, Solution } from '../types/debate.types';

export class DebateOrchestrator {
  constructor(
    private agents: Agent[],
    private judge: JudgeAgent,
    private stateManager: StateManager,
    private config: DebateConfig
  ) {}

  async runDebate(problem: string, context?: string): Promise<DebateResult> {
    const state = await this.stateManager.createDebate(problem, context);

    // Round 1: proposals
    await this.proposalPhase(state);

    if (this.config.rounds >= 2) {
      await this.critiquePhase(state);
    }

    if (this.config.rounds >= 3) {
      await this.refinementPhase(state);
    }

    const solution = await this.synthesisPhase(state);
    await this.stateManager.completeDebate(state.id, solution);

    return {
      debateId: state.id,
      solution,
      rounds: state.rounds,
      metadata: {
        totalRounds: state.currentRound,
        durationMs: Date.now() - state.createdAt.getTime(),
      },
    };
  }

  private buildContext(state: DebateState): DebateContext {
    const base: any = { problem: state.problem };
    if (state.context !== undefined) base.context = state.context;
    if (this.config.includeFullHistory) {
      base.history = state.rounds;
    }
    return base as DebateContext;
  }

  private async proposalPhase(state: DebateState) {
    const ctx = this.buildContext(state);
    await Promise.all(
      this.agents.map(async (agent) => {
        const started = Date.now();
        const proposal = await agent.propose(state.problem, ctx);
        const contribution: Contribution = {
          agentId: (agent as any).config?.id ?? 'agent',
          agentRole: (agent as any).config?.role ?? 'generalist',
          type: 'proposal',
          content: proposal.content,
          metadata: { ...proposal.metadata, latencyMs: proposal.metadata.latencyMs ?? Date.now() - started, model: (agent as any).config?.model },
        };
        await this.stateManager.addContribution(state.id, contribution);
      })
    );
  }

  private async critiquePhase(state: DebateState) {
    const ctx = this.buildContext(state);
    // Get proposals from last round
    const lastRound: DebateRound | undefined = state.rounds[state.rounds.length - 1];
    const proposals = (lastRound?.contributions || []).filter((c) => c.type === 'proposal');

    for (const agent of this.agents) {
      const others = proposals.filter((p) => p.agentId !== (agent as any).config?.id);
      for (const prop of others) {
        const started = Date.now();
        const critique = await agent.critique({ content: prop.content, metadata: prop.metadata }, ctx);
        const contribution: Contribution = {
          agentId: (agent as any).config?.id ?? 'agent',
          agentRole: (agent as any).config?.role ?? 'generalist',
          type: 'critique',
          content: critique.content,
          targetAgentId: prop.agentId,
          metadata: { ...critique.metadata, latencyMs: critique.metadata.latencyMs ?? Date.now() - started, model: (agent as any).config?.model },
        };
        await this.stateManager.addContribution(state.id, contribution);
      }
    }
  }

  private async refinementPhase(state: DebateState) {
    const ctx = this.buildContext(state);
    const prevRound: DebateRound | undefined = state.rounds[state.rounds.length - 1];

    await Promise.all(
      this.agents.map(async (agent) => {
        const agentId = (agent as any).config?.id;
        const original = prevRound?.contributions.find((c) => c.type === 'proposal' && c.agentId === agentId);
        const critiques = (prevRound?.contributions || []).filter((c) => c.type === 'critique' && c.targetAgentId === agentId);
        const started = Date.now();
        const refined = await agent.refine({ content: original?.content || '', metadata: original?.metadata || {} }, critiques as any, ctx);
        const contribution: Contribution = {
          agentId: agentId ?? 'agent',
          agentRole: (agent as any).config?.role ?? 'generalist',
          type: 'proposal',
          content: refined.content,
          metadata: { ...refined.metadata, latencyMs: refined.metadata.latencyMs ?? Date.now() - started, model: (agent as any).config?.model },
        };
        await this.stateManager.addContribution(state.id, contribution);
      })
    );
  }

  private async synthesisPhase(state: DebateState): Promise<Solution> {
    const ctx = this.buildContext(state);
    const solution = await this.judge.synthesize(state.problem, state.rounds, ctx);
    return solution;
  }
}
