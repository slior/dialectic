import type { Langfuse } from 'langfuse';

/**
 * String literal constants for trace options.
 */
export const TRACE_OPTIONS = {
  LANGFUSE: 'langfuse',
} as const;

/**
 * Union type of all trace options.
 */
export type TraceOption = (typeof TRACE_OPTIONS)[keyof typeof TRACE_OPTIONS];

/**
 * String literal constants for span level values.
 */
export const SPAN_LEVEL = {
  ERROR: 'ERROR',
} as const;

/**
 * Union type of all span level values.
 */
export type SpanLevel = (typeof SPAN_LEVEL)[keyof typeof SPAN_LEVEL];

/**
 * Type alias for a Langfuse span object.
 * Represents a span created from a trace or parent span.
 */
export type LangfuseSpan = ReturnType<ReturnType<Langfuse['trace']>['span']>;

/**
 * Type alias for a Langfuse generation object.
 * Represents a generation created from a span or trace.
 */
export type LangfuseGeneration = ReturnType<LangfuseSpan['generation']>;

/**
 * Context object for tracing operations.
 * Contains the Langfuse client instance and the top-level trace for the debate command.
 * 
 * This context is passed through DebateContext but should NOT be persisted in debate state.
 * 
 * The currentSpans map tracks the active span for each agent (keyed by agent ID).
 * This allows concurrent agents to maintain separate span hierarchies without interference.
 * Each agent's current span is set/unset by TracingDecoratorAgent and used by TracingLLMProvider
 * to create generations within the correct parent span.
 */
export interface TracingContext {
  /** Langfuse client instance for creating traces, spans, and generations. */
  langfuse: Langfuse;
  /** Top-level trace for the debate command. */
  trace: ReturnType<Langfuse['trace']>;
  /** Map of agent ID to current active span (one per agent, for concurrent execution). */
  currentSpans: Map<string, LangfuseSpan>;
}

