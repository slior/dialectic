import { OrchestratorHooks } from '../../core/orchestrator';
import { DebateState, DebateConfig, DebateContext } from '../../types/debate.types';
import { TracingContext } from '../../types/tracing.types';
import { enhanceProblemWithContext } from '../../utils/context-enhancer';
import { DEBATE_EVENTS, createEvent } from '../events';
import { DebateNode, NodeContext, NodeResult, NodeResultImpl } from '../node';
import { NODE_TYPES } from '../types';

/**
 * Synthesis node that generates the final solution from all rounds.
 */
export class SynthesisNode implements DebateNode {
  readonly nodeType = NODE_TYPES.SYNTHESIS;

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

  async execute(context: NodeContext): Promise<NodeResult> {
    const { state, judge, stateManager, config, tracingContext, contextDirectory } = context;

    this.hooks?.onSynthesisStart?.();

    const result = await judge.prepareContext(state.rounds, tracingContext);

    if (result.summary) {
      await stateManager.addJudgeSummary(state.id, result.summary);
    }

    const ctx = this.buildContext(state, config, contextDirectory, tracingContext);
    const enhancedProblem = enhanceProblemWithContext(state.problem, state.context, contextDirectory);
    const solution = await judge.synthesize(enhancedProblem, state.rounds, ctx);

    await stateManager.completeDebate(state.id, solution);

    this.hooks?.onSynthesisComplete?.();

    const updatedState = await stateManager.getDebate(state.id);
    if (!updatedState) {
      throw new Error(`Debate ${state.id} not found after synthesis`);
    }

    return NodeResultImpl.createResult(
      createEvent(DEBATE_EVENTS.COMPLETE),
      { state: updatedState }
    );
  }
}
