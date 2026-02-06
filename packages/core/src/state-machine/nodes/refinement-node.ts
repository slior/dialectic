import { Agent } from '../../core/agent';
import { OrchestratorHooks } from '../../core/orchestrator';
import { AgentRole, Critique } from '../../types/agent.types';
import { Contribution, DebateState, DebateConfig, DebateContext, DebateRound } from '../../types/debate.types';
import { CONTRIBUTION_TYPES } from '../../types/debate.types';
import { TracingContext } from '../../types/tracing.types';
import { DEBATE_EVENTS, createEvent } from '../events';
import { DebateNode, NodeContext, NodeResult, NodeResultImpl } from '../node';
import { NODE_TYPES } from '../types';

const ACTIVITY_REFINING = 'refining';

/**
 * Refinement node that generates refinements from all agents.
 */
export class RefinementNode implements DebateNode {
  readonly nodeType = NODE_TYPES.REFINEMENT;

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

    const contribution: Contribution = { agentId, agentRole, type: CONTRIBUTION_TYPES.REFINEMENT, content, metadata };

    if (targetAgentId) {
      contribution.targetAgentId = targetAgentId;
    }

    return contribution;
  }

  /**
   * Gets the last proposal contribution from the latest round for a specific agent.
   * 
   * @param latestRound - The latest debate round, or undefined if no rounds exist.
   * @param agentId - The ID of the agent to find the proposal for.
   * @returns The proposal contribution if found, undefined otherwise.
   */
  private getLastAgentProposal(latestRound: DebateRound | undefined, agentId: string): Contribution | undefined {
    return latestRound?.contributions.find(
      (c) => c.type === CONTRIBUTION_TYPES.PROPOSAL && c.agentId === agentId
    );
  }

  /**
   * Gets the latest feedback (critique contributions) targeting a specific agent from the latest round.
   * 
   * @param latestRound - The latest debate round, or undefined if no rounds exist.
   * @param agentId - The ID of the agent to find critiques for.
   * @returns An array of critique contributions targeting the agent.
   */
  private getLatestFeedback(latestRound: DebateRound | undefined, agentId: string): Contribution[] {
    return (latestRound?.contributions || []).filter(
      (c) => c.type === CONTRIBUTION_TYPES.CRITIQUE && c.targetAgentId === agentId
    );
  }

  async execute(context: NodeContext): Promise<NodeResult> {
    const { state, agents, stateManager, config, preparedContexts, tracingContext, contextDirectory } = context;
    const roundNumber = state.currentRound;
    const latestRound = state.getLatestRound();

    this.hooks?.onPhaseStart?.(roundNumber, CONTRIBUTION_TYPES.REFINEMENT, agents.length);

    await Promise.all(
      agents.map(async (agent) => {
        this.hooks?.onAgentStart?.(agent.config.name, ACTIVITY_REFINING);
        const agentId = agent.config.id;
        const original = this.getLastAgentProposal(latestRound, agentId);
        const critiqueContributions = this.getLatestFeedback(latestRound, agentId);

        const critiques: Critique[] = critiqueContributions.map((c) => ({
          content: c.content,
          metadata: c.metadata,
        }));

        const started = Date.now();
        const ctx = preparedContexts?.get(agent.config.id) || this.buildContext(state, config, contextDirectory, tracingContext);
        const refined = await agent.refine(
          { content: original?.content || '', metadata: original?.metadata || {} },
          critiques,
          ctx,
          state
        );
        const contribution = this.buildContribution( agent, refined.content, refined.metadata, started );
        await stateManager.addContribution(state.id, contribution);
        this.hooks?.onContributionCreated?.(contribution, roundNumber);
        this.hooks?.onAgentComplete?.(agent.config.name, ACTIVITY_REFINING);
      })
    );

    this.hooks?.onPhaseComplete?.(roundNumber, CONTRIBUTION_TYPES.REFINEMENT);

    const updatedState = await stateManager.getDebate(state.id);
    if (!updatedState) {
      throw new Error(`Debate ${state.id} not found after refinement phase`);
    }

    return NodeResultImpl.createResult(
      createEvent(DEBATE_EVENTS.REFINEMENTS_COMPLETE),
      { state: updatedState }
    );
  }
}
