import { AgentLogger } from '../core/agent';
import { DebateEvent } from './events';
import { NodeType, NODE_TYPES } from './types';
import { NodeContext } from './node';

/**
 * Transition rule defining how the state machine moves between nodes.
 */
export type TransitionRule = {
  from: NodeType;
  event: keyof typeof import('./events').DEBATE_EVENTS;
  to: NodeType | null;
  condition?: (context: NodeContext) => boolean;
};

/**
 * Default transition rules for the debate state machine.
 * Defines all valid state transitions based on events.
 */
export const DEFAULT_TRANSITIONS: TransitionRule[] = [
  { from: NODE_TYPES.INITIALIZATION, event: 'START', to: NODE_TYPES.CLARIFICATION },
  { from: NODE_TYPES.CLARIFICATION, event: 'QUESTIONS_PENDING', to: NODE_TYPES.CLARIFICATION_INPUT },
  { from: NODE_TYPES.CLARIFICATION_INPUT, event: 'ANSWERS_SUBMITTED', to: NODE_TYPES.CLARIFICATION },
  { from: NODE_TYPES.CLARIFICATION_INPUT, event: 'WAITING_FOR_INPUT', to: null }, // Suspend point
  { from: NODE_TYPES.CLARIFICATION, event: 'ALL_CLEAR', to: NODE_TYPES.ROUND_MANAGER },
  { from: NODE_TYPES.ROUND_MANAGER, event: 'BEGIN_ROUND', to: NODE_TYPES.SUMMARIZATION },
  { from: NODE_TYPES.SUMMARIZATION, event: 'CONTEXTS_READY', to: NODE_TYPES.PROPOSAL },
  { from: NODE_TYPES.PROPOSAL, event: 'PROPOSALS_COMPLETE', to: NODE_TYPES.CRITIQUE },
  { from: NODE_TYPES.CRITIQUE, event: 'CRITIQUES_COMPLETE', to: NODE_TYPES.REFINEMENT },
  { from: NODE_TYPES.REFINEMENT, event: 'REFINEMENTS_COMPLETE', to: NODE_TYPES.EVALUATION },
  { from: NODE_TYPES.EVALUATION, event: 'CONTINUE', to: NODE_TYPES.ROUND_MANAGER },
  { from: NODE_TYPES.EVALUATION, event: 'CONSENSUS_REACHED', to: NODE_TYPES.SYNTHESIS },
  { from: NODE_TYPES.EVALUATION, event: 'MAX_ROUNDS_REACHED', to: NODE_TYPES.SYNTHESIS },
  { from: NODE_TYPES.ROUND_MANAGER, event: 'MAX_ROUNDS_REACHED', to: NODE_TYPES.SYNTHESIS },
  { from: NODE_TYPES.SYNTHESIS, event: 'COMPLETE', to: null }, // Terminal
];

/**
 * Transition graph that manages state machine transitions.
 * Routes events to the appropriate next node based on transition rules.
 * When an optional AgentLogger is provided, logs each transition at verbose level.
 */
export class TransitionGraph {
  constructor(
    private rules: TransitionRule[] = DEFAULT_TRANSITIONS,
    private logger?: AgentLogger
  ) {}

  /**
   * Gets the next node type based on the current node and event.
   *
   * @param currentNode - The current node type
   * @param event - The event that was emitted
   * @param context - The current node context (for conditional transitions)
   * @returns The next node type, or null if terminal
   */
  getNextNode(currentNode: NodeType, event: DebateEvent, context: NodeContext): NodeType | null {
    const rule = this.rules.find(
      (r) => r.from === currentNode && r.event === event.type && (!r.condition || r.condition(context))
    );
    const nextNode = rule?.to ?? null;
    if (this.logger) {
      const toLabel = nextNode === null ? 'terminal' : nextNode;
      this.logger(`Transition: ${currentNode} --[${event.type}]--> ${toLabel}`, true);
    }
    return nextNode;
  }
}
