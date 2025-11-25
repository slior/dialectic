import { TracingContext } from '../types/tracing.types';

/**
 * Returns the appropriate parent for creating spans or generations.
 * Uses the current span for the specified agent if available, otherwise falls back to the trace.
 * 
 * This ensures that spans and generations are properly nested within the
 * active span hierarchy, providing correct parent-child relationships in Langfuse.
 * 
 * The agentId parameter allows concurrent agents to maintain separate span hierarchies
 * without interfering with each other. If agentId is undefined, returns the trace directly
 * (useful for judge or other non-agent providers).
 * 
 * @param tracingContext - The tracing context containing the trace and current spans map.
 * @param agentId - Optional ID of the agent requesting the span parent (for concurrent execution).
 * @returns The parent object (span or trace) that can be used to create child spans/generations.
 */
export function getSpanParent(tracingContext: TracingContext, agentId?: string): ReturnType<TracingContext['trace']['span']> | TracingContext['trace'] {
  if (!agentId) {
    return tracingContext.trace;
  }
  return tracingContext.currentSpans.get(agentId) ?? tracingContext.trace;
}

