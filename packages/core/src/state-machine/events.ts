/**
 * Event constants for the state machine debate orchestration.
 * These events drive transitions between nodes in the debate flow.
 */
export const DEBATE_EVENTS = {
  // Lifecycle events
  START: 'START',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED',
  
  // Clarification events
  QUESTIONS_PENDING: 'QUESTIONS_PENDING',
  ALL_CLEAR: 'ALL_CLEAR',
  ANSWERS_SUBMITTED: 'ANSWERS_SUBMITTED',
  WAITING_FOR_INPUT: 'WAITING_FOR_INPUT',
  
  // Round events
  BEGIN_ROUND: 'BEGIN_ROUND',
  CONTEXTS_READY: 'CONTEXTS_READY',
  PROPOSALS_COMPLETE: 'PROPOSALS_COMPLETE',
  CRITIQUES_COMPLETE: 'CRITIQUES_COMPLETE',
  REFINEMENTS_COMPLETE: 'REFINEMENTS_COMPLETE',
  
  // Termination events
  CONTINUE: 'CONTINUE',
  CONSENSUS_REACHED: 'CONSENSUS_REACHED',
  MAX_ROUNDS_REACHED: 'MAX_ROUNDS_REACHED',
  
  // Error events
  RETRY: 'RETRY',
  FALLBACK: 'FALLBACK',
} as const;

/**
 * Event type representing a debate state machine event.
 */
export interface DebateEvent {
  type: keyof typeof DEBATE_EVENTS;
  payload?: Record<string, unknown> | undefined;
  timestamp: Date;
}

/**
 * Factory function to create a DebateEvent with a timestamp.
 * 
 * @param type - The event type (must be a key of DEBATE_EVENTS)
 * @param payload - Optional payload data for the event
 * @returns A DebateEvent with the current timestamp
 */
export function createEvent(
  type: keyof typeof DEBATE_EVENTS,
  payload?: Record<string, unknown> | undefined
): DebateEvent {
  return {
    type,
    ...(payload !== undefined && { payload }),
    timestamp: new Date(),
  };
}
