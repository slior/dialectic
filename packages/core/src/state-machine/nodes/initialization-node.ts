import { DebateNode, NodeContext, NodeResult, NodeResultImpl } from '../node';
import { NODE_TYPES } from '../types';
import { DEBATE_EVENTS, createEvent } from '../events';

/**
 * Initialization node that creates the debate state.
 * This is typically the first node executed in the state machine.
 */
export class InitializationNode implements DebateNode {
  readonly nodeType = NODE_TYPES.INITIALIZATION;

  async execute(_context: NodeContext): Promise<NodeResult> {
    // The debate state should already be created before reaching this node.
    // This node simply emits START to transition to the next phase.
    return NodeResultImpl.createResult(createEvent(DEBATE_EVENTS.START));
  }
}
