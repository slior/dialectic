/**
 * The role of the agent.
 */
export const AGENT_ROLES = {
  ARCHITECT: "architect",
  SECURITY: "security",
  PERFORMANCE: "performance",
  TESTING: "testing",
  GENERALIST: "generalist",
} as const;

export type AgentRole = (typeof AGENT_ROLES)[keyof typeof AGENT_ROLES];

export const LLM_PROVIDERS = {
  OPENAI: "openai",
} as const;

/**
 * Configuration for an AI agent.
 *
 * @property id - Unique identifier for the agent.
 * @property name - Human-readable name for the agent.
 * @property role - The functional role of the agent (e.g., architect, security).
 * @property model - The LLM model name to use (e.g., "gpt-4").
 * @property provider - The LLM provider; currently only supports "openai".
 * @property temperature - Sampling temperature for the LLM (range: 0.0 - 1.0).
 * @property systemPrompt - (Optional) System prompt to prime the agent; can be provided by config or use built-in.
 * @property enabled - (Optional) Whether the agent is enabled; defaults to true if omitted.
 */
export interface AgentConfig {
  /** Unique identifier for the agent. */
  id: string;
  /** Human-readable name for the agent. */
  name: string;
  /** The functional role of the agent. */
  role: AgentRole;
  /** The LLM model name to use (e.g., "gpt-4"). */
  model: string;
  /** The LLM provider; currently only supports "openai". */
  provider: typeof LLM_PROVIDERS.OPENAI;
  /** Sampling temperature for the LLM (range: 0.0 - 1.0). */
  temperature: number;
  /** (Optional) System prompt to prime the agent; can be provided by config or use built-in. */
  systemPrompt?: string;
  /** (Optional) Whether the agent is enabled; defaults to true if omitted. */
  enabled?: boolean;
}

/**
 * Metadata for a contribution made by an agent.
 *
 * @property tokensUsed - (Optional) Number of tokens used in the contribution.
 * @property latencyMs - (Optional) Latency in milliseconds for the contribution.
 * @property model - (Optional) The LLM model used for the contribution.
 */
export interface ContributionMetadata {
  tokensUsed?: number;
  latencyMs?: number;
  model?: string;
}

/**
 * Represents a generic response from an agent, such as a proposal, critique, or refinement.
 *
 * @property content - The main textual content of the agent's response (e.g., solution, critique, or refinement).
 * @property metadata - Metadata about the response, including token usage, latency, and model information.
 */
export interface AgentResponse {
  /** The main textual content of the agent's response. */
  content: string;
  /** Metadata about the response, such as tokens used, latency, and model. */
  metadata: ContributionMetadata;
}

//the next two are just for convenience (readability) and potential future use if we need to distinguish between different types of responses

export interface Proposal extends AgentResponse {}

export interface Critique extends AgentResponse {}
