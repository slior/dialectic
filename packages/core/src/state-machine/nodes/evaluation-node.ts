import { DebateNode, NodeContext, NodeResult, NodeResultImpl } from '../node';
import { NODE_TYPES } from '../types';
import { DEBATE_EVENTS, createEvent } from '../events';
import { TERMINATION_TYPES } from '../../types/debate.types';
import { DEFAULT_TERMINATION_THRESHOLD } from '../../types/config.types';

/**
 * Evaluation node that checks for consensus and determines if debate should continue.
 * Evaluates confidence using the judge's evaluateConfidence method.
 */
export class EvaluationNode implements DebateNode {
  readonly nodeType = NODE_TYPES.EVALUATION;

  async execute(context: NodeContext): Promise<NodeResult> {
    const { state, config, judge, tracingContext } = context;

    // For 'fixed' termination, check if we've completed all rounds
    // currentRound is 0-indexed: 0 = no rounds, 1 = round 1 completed, etc.
    // config.rounds is the total number of rounds to run
    if (config.terminationCondition.type === TERMINATION_TYPES.FIXED) {
      if (state.currentRound >= config.rounds) {
        return NodeResultImpl.createResult(createEvent(DEBATE_EVENTS.MAX_ROUNDS_REACHED));
      }
      return NodeResultImpl.createResult(createEvent(DEBATE_EVENTS.CONTINUE));
    }

    // For 'convergence' or 'quality', evaluate confidence
    const confidenceScore = await judge.evaluateConfidence(state, tracingContext);
    const threshold = config.terminationCondition.threshold ?? DEFAULT_TERMINATION_THRESHOLD;

    if (confidenceScore >= threshold) {
      return NodeResultImpl.createResult(
        createEvent(DEBATE_EVENTS.CONSENSUS_REACHED, { confidenceScore })
      );
    }

    return NodeResultImpl.createResult(createEvent(DEBATE_EVENTS.CONTINUE));
  }
}
