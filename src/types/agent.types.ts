import type { SummarizationConfig } from './config.types';

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

export const PROMPT_SOURCES = {
  BUILT_IN: "built-in",
  FILE: "file",
} as const;

export type PromptSourceType = (typeof PROMPT_SOURCES)[keyof typeof PROMPT_SOURCES];

/**
 * Configuration for an AI agent.
 *
 * @property id - Unique identifier for the agent.
 * @property name - Human-readable name for the agent.
 * @property role - The functional role of the agent (e.g., architect, security).
 * @property model - The LLM model name to use (e.g., "gpt-4").
 * @property provider - The LLM provider; currently only supports "openai".
 * @property temperature - Sampling temperature for the LLM (range: 0.0 - 1.0).
 * @property systemPromptPath - (Optional) Filesystem path to a markdown/text file containing the system prompt to prime the agent. Resolved relative to the configuration file directory.
 * @property summaryPromptPath - (Optional) Filesystem path to a markdown/text file containing the summary prompt. Resolved relative to the configuration file directory.
 * @property summarization - (Optional) Per-agent summarization configuration that overrides system-wide settings.
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
  /** (Optional) Filesystem path to a markdown/text file containing the system prompt to prime the agent. Resolved relative to the configuration file directory. */
  systemPromptPath?: string;
  /** (Optional) Filesystem path to a markdown/text file containing the summary prompt. Resolved relative to the configuration file directory. */
  summaryPromptPath?: string;
  /** (Optional) Per-agent summarization configuration that overrides system-wide settings. */
  summarization?: SummarizationConfig;
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

/**
 * Provenance information for a system prompt, indicating whether it was loaded from a file or using built-in defaults.
 *
 * @property source - The source of the system prompt ('built-in' for default, 'file' for loaded from filesystem).
 * @property absPath - (Optional) The absolute filesystem path to the prompt file, if source is 'file'.
 */
export interface PromptSource {
  source: PromptSourceType;
  absPath?: string;
}

/**
 * Metadata about an agent's prompt source for logging and persistence.
 *
 * @property agentId - The unique identifier of the agent.
 * @property role - The role of the agent.
 * @property source - Whether the prompt came from a file or built-in default.
 * @property path - (Optional) The file path if loaded from a file.
 */
export interface AgentPromptMetadata {
  agentId: string;
  role: AgentRole;
  source: PromptSourceType;
  path?: string;
}

/**
 * Metadata about a judge's prompt source for logging and persistence.
 *
 * @property id - The unique identifier of the judge.
 * @property source - Whether the prompt came from a file or built-in default.
 * @property path - (Optional) The file path if loaded from a file.
 * @property summarySource - Whether the summary prompt came from a file or built-in default.
 * @property summaryPath - (Optional) The file path for summary prompt if loaded from a file.
 */
export interface JudgePromptMetadata {
  id: string;
  source: PromptSourceType;
  path?: string;
  summarySource?: PromptSourceType;
  summaryPath?: string;
}

//the next two are just for convenience (readability) and potential future use if we need to distinguish between different types of responses

export interface Proposal extends AgentResponse {}

export interface Critique extends AgentResponse {}
