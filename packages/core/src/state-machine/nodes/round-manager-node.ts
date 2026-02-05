import { DebateNode, NodeContext, NodeResult, NodeResultImpl } from '../node';
import { NODE_TYPES } from '../types';
import { DEBATE_EVENTS, createEvent } from '../events';
import { OrchestratorHooks } from '../../core/orchestrator';

/**
 * Round manager node that coordinates round execution.
 * Determines whether to start a new round or proceed to synthesis.
 */
export class RoundManagerNode implements DebateNode {
  readonly nodeType = NODE_TYPES.ROUND_MANAGER;

  constructor(private hooks?: OrchestratorHooks) {}

  async execute(context: NodeContext): Promise<NodeResult> {
    const { state, config, stateManager } = context;
    const totalRounds = Math.max(1, config.rounds);
    const currentRound = state.currentRound;

    // Check if max rounds reached
    if (currentRound >= totalRounds) {
      return NodeResultImpl.createResult(createEvent(DEBATE_EVENTS.MAX_ROUNDS_REACHED));
    }

    // Notify hook that round is starting
    const nextRound = currentRound + 1;
    this.hooks?.onRoundStart?.(nextRound, totalRounds);

    // Start a new round
    await stateManager.beginRound(state.id);
    
    // Get updated state after beginRound
    const updatedState = await stateManager.getDebate(state.id);
    if (!updatedState) {
      throw new Error(`Debate ${state.id} not found after beginRound`);
    }

    return NodeResultImpl.createResult(
      createEvent(DEBATE_EVENTS.BEGIN_ROUND),
      { state: updatedState }
    );
  }
}
