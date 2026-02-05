import { DebateState } from '../../types/debate.types';
import { DebateNode, NodeContext, NodeResult, NodeResultImpl } from '../node';
import { NODE_TYPES } from '../types';
import { DEBATE_EVENTS, createEvent } from '../events';

/**
 * Node representing "waiting for human input" state.
 * 
 * On first execution (no answers): emits WAITING_FOR_INPUT to suspend.
 * On resume (answers provided): stores answers and emits ANSWERS_SUBMITTED.
 */
export class ClarificationInputNode implements DebateNode {
  readonly nodeType = NODE_TYPES.CLARIFICATION_INPUT;

  async execute(context: NodeContext): Promise<NodeResult> {
    const { state } = context;
    
    // Check if we have unanswered questions (first execution)
    if (this.hasUnansweredQuestions(state)) {
      // Suspend - return WAITING_FOR_INPUT event
      // The orchestrator will handle suspension
      return NodeResultImpl.createResult(
        createEvent(DEBATE_EVENTS.WAITING_FOR_INPUT, {
          questions: state.clarifications,
          iteration: state.clarificationIterations ?? 1,
        })
      );
    }
    
    // All questions answered (resume case) - proceed to check for more
    return NodeResultImpl.createResult(createEvent(DEBATE_EVENTS.ANSWERS_SUBMITTED));
  }

  private hasUnansweredQuestions(state: DebateState): boolean {
    if (!state.hasClarifications()) return false;
    return state.clarifications!.some(group =>
      group.items.some(item => 
        !item.answer || item.answer.trim() === '' //|| item.answer === 'NA' //NA is a valid answer
      )
    );
  }
}
