import { Agent } from './agent';
import { JudgeAgent } from './judge';
import { StateManager } from './state-manager';
import { DebateConfig, DebateContext, DebateResult, DebateState, DebateRound, Contribution, Solution, CONTRIBUTION_TYPES, ContributionType } from '../types/debate.types';
import { AgentRole, Critique } from '../types/agent.types';

// Constants for agent activity descriptions used in progress tracking
const ACTIVITY_PROPOSING = 'proposing';
const ACTIVITY_CRITIQUING = 'critiquing';
const ACTIVITY_REFINING = 'refining';


/**
 * Optional hooks for receiving debate progress notifications.
 * Useful for CLI logging and progress UI updates during debate execution.
 */
/**
 * OrchestratorHooks provides optional callbacks for receiving real-time notifications
 * about debate progress. These hooks are intended for use by UI components, logging,
 * or other observers that wish to track the debate's execution at a fine-grained level.
 *
 * All hooks are optional; implement only those needed for your use case.
 */
interface OrchestratorHooks {
  /**
   * Called when a phase (proposal, critique, or refinement) completes within a round.
   * @param roundNumber - The current round number (1-indexed).
   * @param phase - The type of phase that was completed.
   */
  onPhaseComplete?: (roundNumber: number, phase: ContributionType) => void;

  /**
   * Called at the start of each debate round.
   * @param roundNumber - The round number that is starting (1-indexed).
   * @param totalRounds - The total number of rounds in the debate.
   */
  onRoundStart?: (roundNumber: number, totalRounds: number) => void;

  /**
   * Called at the start of a phase within a round.
   * @param roundNumber - The current round number (1-indexed).
   * @param phase - The type of phase that is starting.
   * @param expectedTaskCount - The number of agent tasks expected in this phase.
   */
  onPhaseStart?: (roundNumber: number, phase: ContributionType, expectedTaskCount: number) => void;

  /**
   * Called when an agent begins an activity (e.g., proposing, critiquing, refining).
   * @param agentName - The name of the agent starting the activity.
   * @param activity - A description of the activity (e.g., "proposing").
   */
  onAgentStart?: (agentName: string, activity: string) => void;

  /**
   * Called when an agent completes an activity.
   * @param agentName - The name of the agent completing the activity.
   * @param activity - A description of the activity (e.g., "proposing").
   */
  onAgentComplete?: (agentName: string, activity: string) => void;

  /**
   * Called at the start of the synthesis phase (when the judge begins synthesizing a solution).
   */
  onSynthesisStart?: () => void;

  /**
   * Called when the synthesis phase is complete (when the judge has finished synthesizing a solution).
   */
  onSynthesisComplete?: () => void;
}

/**
 * DebateOrchestrator coordinates multi-round debates between agents and a judge.
 *
 * Rounds and phases:
 * - Executes N complete rounds as specified in DebateConfig.rounds
 * - Each round runs all phases in order: proposal → critique → refinement
 * - Proposals are fresh each round; agents may incorporate full history when includeFullHistory is true
 *
 * The orchestrator records contributions and metadata via the StateManager.
 *
 * Hooks:
 * - Optionally accepts an onPhaseComplete callback to signal CLI after each phase
 *
 * @param agents - Participating agents.
 * @param judge - The judge responsible for synthesis.
 * @param stateManager - Persistence layer for debate state.
 * @param config - Debate configuration and thresholds.
 * @param hooks - Optional hooks for phase completion notifications.
 */
export class DebateOrchestrator {
  constructor(
    private agents: Agent[],
    private judge: JudgeAgent,
    private stateManager: StateManager,
    private config: DebateConfig,
    private hooks?: OrchestratorHooks
  ) {}

  /**
   * Runs the full debate workflow (proposal → critique → refinement → synthesis).
   * Executes the specified number of rounds; each round performs all phases.
   * Proposals are fresh each round; agents may incorporate history when enabled via config.
   *
   * After each phase completes, the optional onPhaseComplete hook is invoked.
   *
   * @param problem - The problem statement to debate.
   * @param context - Optional additional context for agents and judge.
   * @returns The DebateResult including final solution and metadata.
   */
  async runDebate(problem: string, context?: string): Promise<DebateResult> {
    const state = await this.stateManager.createDebate(problem, context);

    // Execute N complete rounds: proposal -> critique -> refinement
    const total = Math.max(1, this.config.rounds);
    for (let r = 1; r <= total; r++) {
      this.hooks?.onRoundStart?.(r, total);
      await this.stateManager.beginRound(state.id);
      await this.proposalPhase(state, r);
      this.hooks?.onPhaseComplete?.(r, CONTRIBUTION_TYPES.PROPOSAL);

      await this.critiquePhase(state, r);
      this.hooks?.onPhaseComplete?.(r, CONTRIBUTION_TYPES.CRITIQUE);

      await this.refinementPhase(state, r);
      this.hooks?.onPhaseComplete?.(r, CONTRIBUTION_TYPES.REFINEMENT);
    }

    this.hooks?.onSynthesisStart?.();
    const solution = await this.synthesisPhase(state);
    this.hooks?.onSynthesisComplete?.();
    await this.stateManager.completeDebate(state.id, solution);

    return {
      debateId: state.id,
      solution,
      rounds: state.rounds,
      metadata: {
        totalRounds: state.rounds.length,
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
  private buildContribution( agent: Agent, type: Contribution['type'], content: string,
                             existingMetadata: Contribution['metadata'], startedAtMs: number, targetAgentId?: string ): Contribution
  {
    const agentId = agent.config.id;
    const agentRole: AgentRole = agent.config.role;

    // If the agent response omitted latencyMs, compute a wall-clock fallback to maintain
    // consistent timing metrics across providers and implementations.
    const metadata = {
      ...existingMetadata,
      latencyMs: existingMetadata.latencyMs ?? (Date.now() - startedAtMs), 
      model: agent.config.model, // Always record the configured model to preserve source-of-truth for the run
    };

    const contribution: Contribution = { agentId, agentRole, type, content, metadata, };

    if (targetAgentId) { // If the contribution is a critique, record the target agent id
      contribution.targetAgentId = targetAgentId;
    }

    return contribution;
  }

  /**
   * Generates initial proposals from all agents for the given debate state.
   * Uses a helper to unify contribution metadata handling.
   * @param state - Current debate state.
   * @param roundNumber - Current round number for progress tracking.
   */
  private async proposalPhase(state: DebateState, roundNumber: number) {
    const ctx = this.buildContext(state);
    this.hooks?.onPhaseStart?.(roundNumber, CONTRIBUTION_TYPES.PROPOSAL, this.agents.length);
    
    await Promise.all( //invoke all agents in parallel
      this.agents.map(async (agent) => {
        this.hooks?.onAgentStart?.(agent.config.name, ACTIVITY_PROPOSING);
        const started = Date.now();
        const proposal = await agent.propose(state.problem, ctx);
        const contribution = this.buildContribution( agent, CONTRIBUTION_TYPES.PROPOSAL, proposal.content, proposal.metadata, started );
        await this.stateManager.addContribution(state.id, contribution);
        this.hooks?.onAgentComplete?.(agent.config.name, ACTIVITY_PROPOSING);
      })
    );
  }

  /**
   * Each agent critiques other agents' proposals from the previous round.
   * @param state - Current debate state.
   * @param roundNumber - Current round number for progress tracking.
   */
  private async critiquePhase(state: DebateState, roundNumber: number) {
    const ctx = this.buildContext(state);
    // Get proposals from last round
    const lastRound: DebateRound | undefined = state.rounds[state.rounds.length - 1];
    const proposals = (lastRound?.contributions || []).filter((c) => c.type === CONTRIBUTION_TYPES.PROPOSAL);

    // Calculate total critique tasks
    const totalCritiques = this.agents.reduce((sum, agent) => {
      const others = proposals.filter((p) => p.agentId !== agent.config.id);
      return sum + others.length;
    }, 0);
    
    this.hooks?.onPhaseStart?.(roundNumber, CONTRIBUTION_TYPES.CRITIQUE, totalCritiques);

    for (const agent of this.agents) {
      const others = proposals.filter((p) => p.agentId !== agent.config.id);
      for (const prop of others) {
        const activity = `${ACTIVITY_CRITIQUING} ${prop.agentRole}`;
        this.hooks?.onAgentStart?.(agent.config.name, activity);
        const started = Date.now();
        const critique = await agent.critique({ content: prop.content, metadata: prop.metadata }, ctx);
        const contribution = this.buildContribution( agent, CONTRIBUTION_TYPES.CRITIQUE, critique.content, critique.metadata, started, prop.agentId );
        await this.stateManager.addContribution(state.id, contribution);
        this.hooks?.onAgentComplete?.(agent.config.name, activity);
      }
    }
  }

  /**
   * Each agent refines their own prior proposal using critiques from others.
   * @param state - Current debate state.
   * @param roundNumber - Current round number for progress tracking.
   */
  private async refinementPhase(state: DebateState, roundNumber: number) {
    const ctx = this.buildContext(state);
    const prevRound: DebateRound | undefined = state.rounds[state.rounds.length - 1];

    this.hooks?.onPhaseStart?.(roundNumber, CONTRIBUTION_TYPES.REFINEMENT, this.agents.length);

    await Promise.all(
      this.agents.map(async (agent) => {
        this.hooks?.onAgentStart?.(agent.config.name, ACTIVITY_REFINING);
        const agentId = agent.config.id;
        const original = prevRound?.contributions.find((c) => c.type === CONTRIBUTION_TYPES.PROPOSAL && c.agentId === agentId);
        const critiqueContributions = (prevRound?.contributions || []).filter((c) => c.type === CONTRIBUTION_TYPES.CRITIQUE && c.targetAgentId === agentId);
        
        // Map Contribution[] to Critique[] by extracting only content and metadata
        const critiques: Critique[] = critiqueContributions.map((c) => ({
          content: c.content,
          metadata: c.metadata
        }));
        
        const started = Date.now();
        const refined = await agent.refine({ content: original?.content || '', metadata: original?.metadata || {} }, critiques, ctx);
        const contribution = this.buildContribution( agent, CONTRIBUTION_TYPES.REFINEMENT, refined.content, refined.metadata, started );
        await this.stateManager.addContribution(state.id, contribution);
        this.hooks?.onAgentComplete?.(agent.config.name, ACTIVITY_REFINING);
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
