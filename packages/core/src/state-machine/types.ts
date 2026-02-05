/**
 * Node type constants for the state machine debate orchestration.
 * Each node represents a distinct phase or operation in the debate flow.
 */
export const NODE_TYPES = {
  INITIALIZATION: 'initialization',
  CLARIFICATION: 'clarification',
  CLARIFICATION_INPUT: 'clarification_input',
  ROUND_MANAGER: 'round_manager',
  SUMMARIZATION: 'summarization',
  PROPOSAL: 'proposal',
  CRITIQUE: 'critique',
  REFINEMENT: 'refinement',
  EVALUATION: 'evaluation',
  SYNTHESIS: 'synthesis',
} as const;

/**
 * Union type of all node types.
 */
export type NodeType = typeof NODE_TYPES[keyof typeof NODE_TYPES];

// Re-export node types for convenience
export type { DebateNode, NodeContext } from './node';
