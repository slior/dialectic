import { AgentConfig } from './agent.types';
import { DebateConfig, SummarizationMethod } from './debate.types';

export interface SummarizationConfig {
  enabled: boolean;
  threshold: number;
  maxLength: number;
  method: SummarizationMethod;
  promptPath?: string;
}

/** Default value for summarization enabled flag */
export const DEFAULT_SUMMARIZATION_ENABLED = true;

/** Default character count threshold for triggering summarization */
export const DEFAULT_SUMMARIZATION_THRESHOLD = 5000;

/** Default maximum length for generated summaries */
export const DEFAULT_SUMMARIZATION_MAX_LENGTH = 2500;

/** Default summarization method */
export const DEFAULT_SUMMARIZATION_METHOD: SummarizationMethod = 'length-based';

/** Default confidence threshold for termination conditions (convergence/quality) */
export const DEFAULT_TERMINATION_THRESHOLD = 90;

/** Default maximum number of clarification iterations allowed */
export const DEFAULT_CLARIFICATIONS_MAX_ITERATIONS = 3;

/** Default maximum number of clarification questions to accept per agent */
export const DEFAULT_CLARIFICATIONS_MAX_PER_AGENT = 5;

/**
 * Represents the top-level system configuration for a debate session.
 *
 * This interface defines the structure of the configuration file used to initialize
 * agents, judge, and debate parameters. It is typically loaded from a JSON file.
 *
 * @property agents - An array of agent configurations. Each agent participates in the debate.
 * @property judge - (Optional) The configuration for the judge agent responsible for synthesizing the final solution.
 * @property debate - (Optional) Debate-level configuration, such as number of rounds and other settings.
 * @property configDir - (Optional, internal) The absolute directory path of the loaded configuration file.
 *                      This is set internally by the loader to resolve relative paths for prompts and other files.
 *                      It is not user-provided.
 */
export interface SystemConfig {
  
  agents: AgentConfig[]; // List of agent configurations participating in the debate.
  judge?: AgentConfig; // (Optional) Configuration for the judge agent.
  debate?: DebateConfig; // (Optional) Debate-level configuration options.
  /**
   * (Internal) Directory of the loaded configuration file, used for resolving relative paths.
   * Set by the loader, not by the user.
   */
  configDir?: string;
}
