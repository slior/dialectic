import { Agent } from './agent';
import { JudgeAgent } from './judge';
import { StateManager } from './state-manager';
import { DebateConfig, DebateContext, DebateResult, DebateState, DebateRound, Contribution, Solution, CONTRIBUTION_TYPES, ContributionType, AgentClarifications } from '../types/debate.types';
import { writeStderr } from '../utils/console';
import { AgentRole, Critique } from '../types/agent.types';
import { enhanceProblemWithContext } from '../utils/context-enhancer';

// Constants for agent activity descriptions used in progress tracking
const ACTIVITY_PROPOSING = 'proposing';
const ACTIVITY_CRITIQUING = 'critiquing';
const ACTIVITY_REFINING = 'refining';

/**
 * Type guard to check if a Promise.allSettled result is fulfilled.
 * @param result - The result from Promise.allSettled.
 * @returns True if the result is fulfilled, false if rejected.
 */
function isFulfilled<T>(result: PromiseSettledResult<T>): result is PromiseFulfilledResult<T> {
  return result.status === 'fulfilled';
}

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

  /**
   * Called when an agent begins summarizing their context.
   * @param agentName - The name of the agent starting summarization.
   */
  onSummarizationStart?: (agentName: string) => void;

  /**
   * Called when an agent completes context summarization.
   * @param agentName - The name of the agent completing summarization.
   * @param beforeChars - Character count before summarization.
   * @param afterChars - Character count after summarization.
   */
  onSummarizationComplete?: (agentName: string, beforeChars: number, afterChars: number) => void;
  /**
   * Called at the end of summarization for an agent even if no summary was produced,
   * allowing the UI to clear any pending activity.
   */
  onSummarizationEnd?: (agentName: string) => void;
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
  async runDebate(problem: string, context?: string, clarifications?: AgentClarifications[]): Promise<DebateResult> {
    const state = await this.stateManager.createDebate(problem, context);
    if (clarifications && clarifications.length > 0) {
      await this.stateManager.setClarifications(state.id, clarifications);
    }

    // Execute N complete rounds: summarization -> proposal -> critique -> refinement
    const total = Math.max(1, this.config.rounds);
    for (let r = 1; r <= total; r++) {
      this.hooks?.onRoundStart?.(r, total);
      await this.stateManager.beginRound(state.id);
      
      // Summarization phase: prepare contexts for all agents
      const preparedContexts = await this.summarizationPhase(state, r);
      
      await this.proposalPhase(state, r, preparedContexts);
      this.hooks?.onPhaseComplete?.(r, CONTRIBUTION_TYPES.PROPOSAL);

      await this.critiquePhase(state, r, preparedContexts);
      this.hooks?.onPhaseComplete?.(r, CONTRIBUTION_TYPES.CRITIQUE);

      await this.refinementPhase(state, r, preparedContexts);
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
    base.includeFullHistory = this.config.includeFullHistory;
    if (state.clarifications) {
      base.clarifications = state.clarifications;
    }
    return base as DebateContext;
  }

  /**
   * Summarization phase: Each agent prepares and potentially summarizes their context.
   * 
   * This phase runs before the proposal phase of each round. Agents evaluate whether
   * summarization is needed based on their configuration and history size, then generate
   * summaries if necessary.
   * 
   * @param state - Current debate state.
   * @param roundNumber - Current round number for tracking.
   * @returns A map of agent ID to prepared context for use in debate phases.
   */
  private async summarizationPhase(
    state: DebateState,
    roundNumber: number
  ): Promise<Map<string, DebateContext>> {
    const baseContext = this.buildContext(state);
    const preparedContexts = new Map<string, DebateContext>();

    for (const agent of this.agents) {
      this.hooks?.onSummarizationStart?.(agent.config.name);
      
      const result = await agent.prepareContext(baseContext, roundNumber);
      
      if (result.summary) {
        // Summary was created - store it and invoke completion hook
        await this.stateManager.addSummary(state.id, result.summary);
        this.hooks?.onSummarizationComplete?.( agent.config.name, result.summary.metadata.beforeChars, result.summary.metadata.afterChars );
      } else {
        // Ensure UI activity is cleared even when no summary is produced
        this.hooks?.onSummarizationEnd?.(agent.config.name);
      }
      
      // Store the prepared context for this agent
      preparedContexts.set(agent.config.id, result.context);
    }

    return preparedContexts;
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
   * Invokes an agent's LLM to produce a proposal contribution for the current round.
   *
   * This method resolves the prepared context for the agent (if provided; otherwise falls back to a full buildContext),
   * calls the agent's `propose` method to obtain the proposal, and wraps the result as a normalized Contribution object,
   * including proper metadata such as tokens used, latency, and model identifier.
   * 
   * @param agent - The agent instance generating the proposal.
   * @param state - The current debate state, including problem and full debate context.
   * @param preparedContexts - A map of agent IDs to their prepared context objects (possibly summarized).
   * @param startedAtMs - The wall-clock timestamp (in ms) when the agent's proposal process started, 
   *                      used as a fallback for latency computation.
   * @returns A Promise resolving to the constructed proposal Contribution, ready to be added to debate state.
   */
  private async buildProposalContributionFromLLM( agent: Agent, state: DebateState, preparedContexts: Map<string, DebateContext>, startedAtMs: number ): Promise<Contribution>
  {
    const ctx = preparedContexts.get(agent.config.id) || this.buildContext(state);
    const enhancedProblem = enhanceProblemWithContext(state.problem, state.context);
    const proposal = await agent.propose(enhancedProblem, ctx);
    return this.buildContribution( agent, CONTRIBUTION_TYPES.PROPOSAL, proposal.content, proposal.metadata, startedAtMs );
  }

  /**
   * Generates initial proposals from all agents for the given debate state.
   * Uses a helper to unify contribution metadata handling.
   * @param state - Current debate state.
   * @param roundNumber - Current round number for progress tracking.
   * @param preparedContexts - Map of agent ID to prepared (potentially summarized) context.
   */
  private async proposalPhase(state: DebateState, roundNumber: number, preparedContexts: Map<string, DebateContext>) {
    this.hooks?.onPhaseStart?.(roundNumber, CONTRIBUTION_TYPES.PROPOSAL, this.agents.length);

    // Determine previous round once (if applicable). beginRound() appended the current round,
    // so the prior round resides at length - 2 (persisted state order).
    const prevRoundIndex = state.rounds.length - 2;
    const prevRound: DebateRound | undefined = prevRoundIndex >= 0 ? state.rounds[prevRoundIndex] : undefined;

    await Promise.all(
      this.agents.map(async (agent) => {
        this.hooks?.onAgentStart?.(agent.config.name, ACTIVITY_PROPOSING);
        const started = Date.now();
        let contribution: Contribution | undefined;
        if (roundNumber === 1) {
          contribution = await this.buildProposalContributionFromLLM(agent, state, preparedContexts, started);
        }
        else { // Rounds >= 2: carry over prior round refinements as this round's proposals; fallback to LLM if missing

          const prevRefinement = (prevRound?.contributions || []).find((c) => c.type === CONTRIBUTION_TYPES.REFINEMENT && c.agentId === agent.config.id);
          if (prevRefinement) {
            const carryMetadata = { tokensUsed: 0, latencyMs: 0 } as Contribution['metadata'];
            contribution = this.buildContribution( agent, CONTRIBUTION_TYPES.PROPOSAL, prevRefinement.content, carryMetadata, started );
          }
          else { // Fallback: warn and perform LLM proposal
            writeStderr(`Warning: [Round ${roundNumber}] Missing previous refinement for ${agent.config.name}; falling back to LLM proposal.\n`);
            contribution = await this.buildProposalContributionFromLLM(agent, state, preparedContexts, started);
          }
        }
        await this.stateManager.addContribution(state.id, contribution);
        this.hooks?.onAgentComplete?.(agent.config.name, ACTIVITY_PROPOSING);
      })
    );
  }

  /**
   * Each agent critiques other agents' proposals from the previous round.
   * @param state - Current debate state.
   * @param roundNumber - Current round number for progress tracking.
   * @param preparedContexts - Map of agent ID to prepared (potentially summarized) context.
   */
  private async critiquePhase(state: DebateState, roundNumber: number, preparedContexts: Map<string, DebateContext>) {
    // Get proposals from last round
    const lastRound: DebateRound | undefined = state.rounds[state.rounds.length - 1];
    const proposals = (lastRound?.contributions || []).filter((c) => c.type === CONTRIBUTION_TYPES.PROPOSAL);

    // Calculate total critique tasks
    const totalCritiques = this.agents.reduce((sum, agent) => {
      const others = proposals.filter((p) => p.agentId !== agent.config.id);
      return sum + others.length;
    }, 0);
    
    this.hooks?.onPhaseStart?.(roundNumber, CONTRIBUTION_TYPES.CRITIQUE, totalCritiques);

    // Build array of async tasks for all agent-proposal pairs
    const tasks: Array<() => Promise<Contribution>> = [];
    
    for (const agent of this.agents) {
      const others = proposals.filter((p) => p.agentId !== agent.config.id);
      for (const prop of others) {
        tasks.push(async () => {
          const activity = `${ACTIVITY_CRITIQUING} ${prop.agentRole}`;
          this.hooks?.onAgentStart?.(agent.config.name, activity);
          try {
            const started = Date.now();
            const ctx = preparedContexts.get(agent.config.id) || this.buildContext(state);
            const critique = await agent.critique({ content: prop.content, metadata: prop.metadata }, ctx);
            const contribution = this.buildContribution( agent, CONTRIBUTION_TYPES.CRITIQUE, critique.content, critique.metadata, started, prop.agentId );
            return contribution;
          } finally {
            this.hooks?.onAgentComplete?.(agent.config.name, activity);
          }
        });
      }
    }

    // Execute all tasks concurrently
    const results = await Promise.allSettled(tasks.map((task) => task()));
    const successfulContributions: Contribution[] = results.filter(isFulfilled).map((result) => result.value);
    successfulContributions.forEach(async (contribution) => await this.stateManager.addContribution(state.id, contribution));
  }

  /**
   * Each agent refines their own prior proposal using critiques from others.
   * @param state - Current debate state.
   * @param roundNumber - Current round number for progress tracking.
   * @param preparedContexts - Map of agent ID to prepared (potentially summarized) context.
   */
  private async refinementPhase(state: DebateState, roundNumber: number, preparedContexts: Map<string, DebateContext>) {
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
        const ctx = preparedContexts.get(agent.config.id) || this.buildContext(state); // Use the prepared context for this agent
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
    // Prepare judge context with potential summarization
    const result = await this.judge.prepareContext(state.rounds);
    
    // Store judge summary if one was created
    if (result.summary) {
      await this.stateManager.addJudgeSummary(state.id, result.summary);
    }
    
    const ctx = this.buildContext(state);
    const enhancedProblem = enhanceProblemWithContext(state.problem, state.context);
    const solution = await this.judge.synthesize(enhancedProblem, state.rounds, ctx);
    return solution;
  }
}
