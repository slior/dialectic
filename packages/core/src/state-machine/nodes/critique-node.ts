import { Agent } from '../../core/agent';
import { AgentRole } from '../../types/agent.types';
import { Contribution, DebateState, DebateConfig, DebateContext } from '../../types/debate.types';
import { CONTRIBUTION_TYPES } from '../../types/debate.types';
import { TracingContext } from '../../types/tracing.types';
import { isFulfilled } from '../../utils/promise';
import { DebateNode, NodeContext, NodeResult, NodeResultImpl } from '../node';
import { NODE_TYPES } from '../types';
import { DEBATE_EVENTS, createEvent } from '../events';
import { OrchestratorHooks } from '../../core/orchestrator';

const ACTIVITY_CRITIQUING = 'critiquing';

function formatCritiqueActivity(agents: Agent[], critiquedAgentId: string): string {
  const critiquedAgent = agents.find((a) => a.config.id === critiquedAgentId);
  const critiquedAgentName = critiquedAgent?.config.name;
  return critiquedAgentName ? `${ACTIVITY_CRITIQUING} ${critiquedAgentName}` : ACTIVITY_CRITIQUING;
}

/**
 * Critique node that generates critiques from all agents.
 */
export class CritiqueNode implements DebateNode {
  readonly nodeType = NODE_TYPES.CRITIQUE;

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
    targetAgentId: string
  ): Contribution {
    const agentId = agent.config.id;
    const agentRole: AgentRole = agent.config.role;

    const metadata = {
      ...existingMetadata,
      latencyMs: existingMetadata.latencyMs ?? (Date.now() - startedAtMs),
      model: agent.config.model,
    };

    const contribution: Contribution = { agentId, agentRole, type: CONTRIBUTION_TYPES.CRITIQUE, content, metadata, targetAgentId};

    return contribution;
  }

  private async buildCritiqueContribution(
    agent: Agent,
    proposal: Contribution,
    preparedContexts: Map<string, DebateContext>,
    state: DebateState,
    config: DebateConfig,
    agents: Agent[],
    contextDirectory?: string,
    tracingContext?: TracingContext
  ): Promise<Contribution> {
    const activity = formatCritiqueActivity(agents, proposal.agentId);
    this.hooks?.onAgentStart?.(agent.config.name, activity);
    try {
      const started = Date.now();
      const ctx = preparedContexts?.get(agent.config.id) || this.buildContext(state, config, contextDirectory, tracingContext);
      const critique = await agent.critique({ content: proposal.content, metadata: proposal.metadata }, ctx, state);
      const contribution = this.buildContribution( agent, critique.content, critique.metadata, started, proposal.agentId );
      return contribution;
    } finally {
      this.hooks?.onAgentComplete?.(agent.config.name, activity);
    }
  }

  async execute(context: NodeContext): Promise<NodeResult> {
    const { state, agents, stateManager, config, preparedContexts, tracingContext, contextDirectory } = context;
    const roundNumber = state.currentRound;

    const lastRound = state.getLatestRound();
    const proposals = (lastRound?.contributions || []).filter((c) => c.type === CONTRIBUTION_TYPES.PROPOSAL);

    const totalCritiques = agents.reduce((sum, agent) => {
      const others = proposals.filter((p) => p.agentId !== agent.config.id);
      return sum + others.length;
    }, 0);

    this.hooks?.onPhaseStart?.(roundNumber, CONTRIBUTION_TYPES.CRITIQUE, totalCritiques);

    const tasks: Array<() => Promise<Contribution>> = [];

    for (const agent of agents) {
      const others = proposals.filter((p) => p.agentId !== agent.config.id);
      for (const prop of others) {
        tasks.push(async () => {
          return this.buildCritiqueContribution( agent, prop, preparedContexts || new Map(), state, config, agents, contextDirectory, tracingContext );
        });
      }
    }

    const results = await Promise.allSettled(tasks.map((task) => task()));
    const successfulContributions: Contribution[] = results.filter(isFulfilled).map((result) => result.value);
    for (const contribution of successfulContributions) {
      await stateManager.addContribution(state.id, contribution);
      this.hooks?.onContributionCreated?.(contribution, roundNumber);
    }

    this.hooks?.onPhaseComplete?.(roundNumber, CONTRIBUTION_TYPES.CRITIQUE);

    const updatedState = await stateManager.getDebate(state.id);
    if (!updatedState) {
      throw new Error(`Debate ${state.id} not found after critique phase`);
    }

    return NodeResultImpl.createResult(
      createEvent(DEBATE_EVENTS.CRITIQUES_COMPLETE),
      { state: updatedState }
    );
  }
}
