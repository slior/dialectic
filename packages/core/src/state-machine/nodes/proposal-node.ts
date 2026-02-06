import { Agent } from '../../core/agent';
import { OrchestratorHooks } from '../../core/orchestrator';
import { AgentRole } from '../../types/agent.types';
import { Contribution, DebateRound, DebateState, DebateConfig, DebateContext } from '../../types/debate.types';
import { CONTRIBUTION_TYPES } from '../../types/debate.types';
import { TracingContext } from '../../types/tracing.types';
import { logWarning } from '../../utils/console';
import { enhanceProblemWithContext } from '../../utils/context-enhancer';
import { DEBATE_EVENTS, createEvent } from '../events';
import { DebateNode, NodeContext, NodeResult, NodeResultImpl } from '../node';
import { NODE_TYPES } from '../types';

const ACTIVITY_PROPOSING = 'proposing';

/**
 * Proposal node that generates proposals from all agents.
 */
export class ProposalNode implements DebateNode {
  readonly nodeType = NODE_TYPES.PROPOSAL;

  constructor(private hooks?: OrchestratorHooks) {}

  private buildContext(
    state: DebateState,
    config: DebateConfig,
    contextDirectory?: string,
    tracingContext?: TracingContext
  ): DebateContext {
    const base: DebateContext = {
      problem: state.problem,
      ...(state.context !== undefined && { context: state.context }),
      ...(contextDirectory && { contextDirectory }),
      ...(config.includeFullHistory && { history: state.rounds }),
      includeFullHistory: config.includeFullHistory,
      ...(state.hasClarifications() && { clarifications: state.clarifications }),
      ...(tracingContext && { tracingContext }),
    };
    return base;
  }

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

    const metadata = {
      ...existingMetadata,
      latencyMs: existingMetadata.latencyMs ?? (Date.now() - startedAtMs),
      model: agent.config.model,
    };

    const contribution: Contribution = { agentId, agentRole, type, content, metadata };

    if (targetAgentId) {
      contribution.targetAgentId = targetAgentId;
    }

    return contribution;
  }

  private async buildProposalContributionFromLLM(
    agent: Agent,
    state: DebateState,
    config: DebateConfig,
    preparedContexts: Map<string, DebateContext>,
    startedAtMs: number,
    contextDirectory?: string,
    tracingContext?: TracingContext
  ): Promise<Contribution> {
    const ctx = preparedContexts?.get(agent.config.id) || this.buildContext(state, config, contextDirectory, tracingContext);
    const enhancedProblem = enhanceProblemWithContext(state.problem, state.context, contextDirectory);
    const proposal = await agent.propose(enhancedProblem, ctx, state);
    return this.buildContribution(agent, CONTRIBUTION_TYPES.PROPOSAL, proposal.content, proposal.metadata, startedAtMs);
  }

  async execute(context: NodeContext): Promise<NodeResult> {
    const { state, agents, stateManager, config, preparedContexts, tracingContext, contextDirectory } = context;
    const roundNumber = state.currentRound;

    this.hooks?.onPhaseStart?.(roundNumber, CONTRIBUTION_TYPES.PROPOSAL, agents.length);

    const prevRoundIndex = state.rounds.length - 2;
    const prevRound: DebateRound | undefined = prevRoundIndex >= 0 ? state.rounds[prevRoundIndex] : undefined;

    await Promise.all(
      agents.map(async (agent) => {
        this.hooks?.onAgentStart?.(agent.config.name, ACTIVITY_PROPOSING);
        const started = Date.now();
        let contribution: Contribution | undefined;
        if (roundNumber === 1) {
          contribution = await this.buildProposalContributionFromLLM(
            agent,
            state,
            config,
            preparedContexts || new Map(),
            started,
            contextDirectory,
            tracingContext
          );
        } else {
          const prevRefinement = (prevRound?.contributions || []).find(
            (c) => c.type === CONTRIBUTION_TYPES.REFINEMENT && c.agentId === agent.config.id
          );
          if (prevRefinement) {
            const carryMetadata = { tokensUsed: 0, latencyMs: 0 } as Contribution['metadata'];
            contribution = this.buildContribution(agent, CONTRIBUTION_TYPES.PROPOSAL, prevRefinement.content, carryMetadata, started);
          } else {
            logWarning(`[Round ${roundNumber}] Missing previous refinement for ${agent.config.name}; falling back to LLM proposal.`);
            contribution = await this.buildProposalContributionFromLLM( agent, state, config, preparedContexts || new Map(), started, contextDirectory, tracingContext );
          }
        }
        await stateManager.addContribution(state.id, contribution);
        this.hooks?.onContributionCreated?.(contribution, roundNumber);
        this.hooks?.onAgentComplete?.(agent.config.name, ACTIVITY_PROPOSING);
      })
    );

    this.hooks?.onPhaseComplete?.(roundNumber, CONTRIBUTION_TYPES.PROPOSAL);

    //TODO: this bit repeats in most nodes. Consider moving to a helper function.
    const updatedState = await stateManager.getDebate(state.id);
    if (!updatedState) {
      throw new Error(`Debate ${state.id} not found after proposal phase`);
    }

    return NodeResultImpl.createResult(
      createEvent(DEBATE_EVENTS.PROPOSALS_COMPLETE),
      { state: updatedState }
    );
  }
}
