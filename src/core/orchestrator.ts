import { Agent } from './agent';
import { JudgeAgent } from './judge';
import { StateManager } from './state-manager';
import { DebateConfig, DebateContext, DebateResult, DebateState, DebateRound, Contribution, Solution } from '../types/debate.types';
import { AgentRole } from '../types/agent.types';

// File-level constants for clarity and self-documentation
const MIN_ROUNDS_FOR_CRITIQUE = 2;
const MIN_ROUNDS_FOR_REFINEMENT = 3;
const CONTRIBUTION_TYPES = {
  PROPOSAL: 'proposal',
  CRITIQUE: 'critique',
} as const;

/**
 * DebateOrchestrator coordinates multi-round debates between agents and a judge.
 *
 * Phases:
 * - Proposal (always)
 * - Critique (when config.rounds >= MIN_ROUNDS_FOR_CRITIQUE)
 * - Refinement (when config.rounds >= MIN_ROUNDS_FOR_REFINEMENT)
 *
 * The orchestrator records contributions and metadata via the StateManager.
 *
 * @param agents - Participating agents.
 * @param judge - The judge responsible for synthesis.
 * @param stateManager - Persistence layer for debate state.
 * @param config - Debate configuration and thresholds.
 */
export class DebateOrchestrator {
  constructor(
    private agents: Agent[],
    private judge: JudgeAgent,
    private stateManager: StateManager,
    private config: DebateConfig
  ) {}

  /**
   * Runs the full debate workflow (proposal → critique → refinement → synthesis).
   * Critique phase runs when rounds >= MIN_ROUNDS_FOR_CRITIQUE.
   * Refinement phase runs when rounds >= MIN_ROUNDS_FOR_REFINEMENT.
   *
   * @param problem - The problem statement to debate.
   * @param context - Optional additional context for agents and judge.
   * @returns The DebateResult including final solution and metadata.
   */
  async runDebate(problem: string, context?: string): Promise<DebateResult> {
    const state = await this.stateManager.createDebate(problem, context);

    // Round 1: proposals
    await this.proposalPhase(state);

    if (this.config.rounds >= MIN_ROUNDS_FOR_CRITIQUE) {
      await this.critiquePhase(state);
    }

    if (this.config.rounds >= MIN_ROUNDS_FOR_REFINEMENT) {
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

  /**
   * Builds DebateContext for agent and judge calls.
   * Includes full history when config.includeFullHistory is true.
   *
   * @param state - The current debate state.
   * @returns Context object passed to agents and judge.
   */
  private buildContext(state: DebateState): DebateContext {
    const base: any = { problem: state.problem };
    if (state.context !== undefined) base.context = state.context;
    if (this.config.includeFullHistory) {
      base.history = state.rounds;
    }
    return base as DebateContext;
  }

  /**
   * Builds a normalized Contribution object from an agent response.
   * Ensures consistent metadata (latencyMs fallback and model assignment).
   *
   * @param agent - Source agent.
   * @param type - Contribution type.
   * @param content - Contribution content.
   * @param existingMetadata - Metadata from the agent response.
   * @param startedAtMs - Timestamp captured before calling the agent (used for latency fallback).
   * @param targetAgentId - Optional target agent id (used for critiques).
   * @returns Contribution ready to persist.
   * @final
   */
  private buildContribution(
    agent: Agent,
    type: Contribution['type'],
    content: string,
    existingMetadata: Contribution['metadata'],
    startedAtMs: number,
    targetAgentId?: string
  ): Contribution {
    const agentId = agent.config.id;
    const agentRole: AgentRole = agent.config.role;

    // If the agent response omitted latencyMs, compute a wall-clock fallback to maintain
    // consistent timing metrics across providers and implementations.
    const metadata = {
      ...existingMetadata,
      latencyMs: existingMetadata.latencyMs ?? (Date.now() - startedAtMs),
      // Always record the configured model to preserve source-of-truth for the run
      model: agent.config.model,
    };

    const contribution: Contribution = {
      agentId,
      agentRole,
      type,
      content,
      metadata,
    };

    if (targetAgentId) {
      contribution.targetAgentId = targetAgentId;
    }

    return contribution;
  }

  /**
   * Generates initial proposals from all agents for the given debate state.
   * Uses a helper to unify contribution metadata handling.
   * @param state - Current debate state.
   */
  private async proposalPhase(state: DebateState) {
    const ctx = this.buildContext(state);
    await Promise.all(
      this.agents.map(async (agent) => {
        const started = Date.now();
        const proposal = await agent.propose(state.problem, ctx);
        const contribution = this.buildContribution(
          agent,
          CONTRIBUTION_TYPES.PROPOSAL,
          proposal.content,
          proposal.metadata,
          started
        );
        await this.stateManager.addContribution(state.id, contribution);
      })
    );
  }

  /**
   * Each agent critiques other agents' proposals from the previous round.
   * @param state - Current debate state.
   */
  private async critiquePhase(state: DebateState) {
    const ctx = this.buildContext(state);
    // Get proposals from last round
    const lastRound: DebateRound | undefined = state.rounds[state.rounds.length - 1];
    const proposals = (lastRound?.contributions || []).filter((c) => c.type === CONTRIBUTION_TYPES.PROPOSAL);

    for (const agent of this.agents) {
      const others = proposals.filter((p) => p.agentId !== agent.config.id);
      for (const prop of others) {
        const started = Date.now();
        const critique = await agent.critique({ content: prop.content, metadata: prop.metadata }, ctx);
        const contribution = this.buildContribution(
          agent,
          CONTRIBUTION_TYPES.CRITIQUE,
          critique.content,
          critique.metadata,
          started,
          prop.agentId
        );
        await this.stateManager.addContribution(state.id, contribution);
      }
    }
  }

  /**
   * Each agent refines their own prior proposal using critiques from others.
   * @param state - Current debate state.
   */
  private async refinementPhase(state: DebateState) {
    const ctx = this.buildContext(state);
    const prevRound: DebateRound | undefined = state.rounds[state.rounds.length - 1];

    await Promise.all(
      this.agents.map(async (agent) => {
        const agentId = agent.config.id;
        const original = prevRound?.contributions.find((c) => c.type === CONTRIBUTION_TYPES.PROPOSAL && c.agentId === agentId);
        const critiques = (prevRound?.contributions || []).filter((c) => c.type === CONTRIBUTION_TYPES.CRITIQUE && c.targetAgentId === agentId);
        const started = Date.now();
        const refined = await agent.refine({ content: original?.content || '', metadata: original?.metadata || {} }, critiques as any, ctx);
        const contribution = this.buildContribution(
          agent,
          CONTRIBUTION_TYPES.PROPOSAL,
          refined.content,
          refined.metadata,
          started
        );
        await this.stateManager.addContribution(state.id, contribution);
      })
    );
  }

  /**
   * Invokes the judge to synthesize a final solution from all rounds.
   * @param state - Current debate state.
   * @returns The synthesized Solution.
   */
  private async synthesisPhase(state: DebateState): Promise<Solution> {
    const ctx = this.buildContext(state);
    const solution = await this.judge.synthesize(state.problem, state.rounds, ctx);
    return solution;
  }
}
