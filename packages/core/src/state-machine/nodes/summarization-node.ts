import { Agent } from '../../core/agent';
import { StateManager } from '../../core/state-manager';
import { DebateContext, DebateState, DebateConfig } from '../../types/debate.types';
import { TracingContext } from '../../types/tracing.types';
import { DebateNode, NodeContext, NodeResult, NodeResultImpl } from '../node';
import { NODE_TYPES } from '../types';
import { DEBATE_EVENTS, createEvent } from '../events';
import { OrchestratorHooks } from '../../core/orchestrator';

/**
 * Summarization node that prepares contexts for all agents.
 * Each agent may summarize their history if needed.
 */
export class SummarizationNode implements DebateNode {
  readonly nodeType = NODE_TYPES.SUMMARIZATION;

  constructor(private hooks?: OrchestratorHooks) {}

  private buildContext(state: DebateState, config: DebateConfig, contextDirectory?: string, tracingContext?: TracingContext): DebateContext {
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

  /**
   * Processes summarization for a single agent.
   * Prepares the context, handles summary if generated, and invokes appropriate hooks.
   * 
   * @param agent - The agent to process summarization for.
   * @param baseContext - The base debate context to prepare.
   * @param roundNumber - The current round number.
   * @param debateId - The ID of the debate.
   * @param stateManager - The state manager to persist summaries.
   * @returns The prepared context for the agent.
   */
  private async processAgentSummarization(
    agent: Agent,
    baseContext: DebateContext,
    roundNumber: number,
    debateId: string,
    stateManager: StateManager
  ): Promise<DebateContext> {
    this.hooks?.onSummarizationStart?.(agent.config.name);

    const result = await agent.prepareContext(baseContext, roundNumber);

    if (result.summary) {
      await stateManager.addSummary(debateId, result.summary);
      this.hooks?.onSummarizationComplete?.( agent.config.name, result.summary.metadata.beforeChars, result.summary.metadata.afterChars );
    } else {
      this.hooks?.onSummarizationEnd?.(agent.config.name);
    }

    return result.context;
  }

  async execute(context: NodeContext): Promise<NodeResult> {
    const { state, agents, stateManager, config, tracingContext, contextDirectory } = context;
    const roundNumber = state.currentRound;
    const baseContext = this.buildContext(state, config, contextDirectory, tracingContext);
    const preparedContexts = new Map<string, DebateContext>();

    for (const agent of agents) {
      const preparedContext = await this.processAgentSummarization( agent, baseContext, roundNumber, state.id, stateManager );
      preparedContexts.set(agent.config.id, preparedContext);
    }

    // Get updated state after summaries
    const updatedState = await stateManager.getDebate(state.id);
    if (!updatedState) {
      throw new Error(`Debate ${state.id} not found after summarization`);
    }

    return NodeResultImpl.createResult(
      createEvent(DEBATE_EVENTS.CONTEXTS_READY),
      {
        state: updatedState,
        preparedContexts,
      }
    );
  }
}
