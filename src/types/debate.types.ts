import { AgentRole, AgentPromptMetadata, JudgePromptMetadata } from './agent.types';

/** String literal constants for termination types */
export const TERMINATION_TYPES = {
  FIXED: 'fixed',
  CONVERGENCE: 'convergence',
  QUALITY: 'quality',
} as const;

/** Union type of all termination types */
export type TerminationType = (typeof TERMINATION_TYPES)[keyof typeof TERMINATION_TYPES];

/** String literal constants for synthesis methods */
export const SYNTHESIS_METHODS = {
  JUDGE: 'judge',
  VOTING: 'voting',
  MERGE: 'merge',
} as const;

/** Union type of all synthesis methods */
export type SynthesisMethod = (typeof SYNTHESIS_METHODS)[keyof typeof SYNTHESIS_METHODS];

/** String literal constants for debate statuses */
export const DEBATE_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

/** Union type of all debate statuses */
export type DebateStatus = (typeof DEBATE_STATUS)[keyof typeof DEBATE_STATUS];

/** String literal constants for contribution types */
export const CONTRIBUTION_TYPES = {
  PROPOSAL: 'proposal',
  CRITIQUE: 'critique',
  REFINEMENT: 'refinement',
} as const;

/** Union type of all contribution types */
export type ContributionType = (typeof CONTRIBUTION_TYPES)[keyof typeof CONTRIBUTION_TYPES];

/**
 * Configuration controlling how a debate is executed.
 */
export interface DebateConfig {
  
  rounds: number; /** Number of complete rounds to execute (>= 1). */
  terminationCondition: { type: TerminationType; threshold?: number }; /** Termination condition; currently only 'fixed' is supported at runtime. */
  synthesisMethod: SynthesisMethod; /** Method used to synthesize the final solution. */
  includeFullHistory: boolean; /** Whether to include full debate history in the context passed to agents and judge. */
  timeoutPerRound: number; /** Maximum time allowed per round in milliseconds. */
}

/**
 * In-memory (and persisted) state for a debate execution.
 */
export interface DebateState {
  id: string; /** Unique debate identifier. */
  problem: string; /** Problem statement under discussion. */
  context?: string; /** Optional additional context for the problem. */
  status: DebateStatus; /** Current status of the debate. */
  currentRound: number; /** The currently active round number (1-indexed, 0 when no rounds have started). */
  rounds: DebateRound[]; /** All executed rounds and their contributions. */
  finalSolution?: Solution; /** Final solution, if completed. */
  createdAt: Date; /** Creation timestamp. */
  updatedAt: Date; /** Last updated timestamp. */
  /**
   * Provenance of system prompts used by agents and judge for this debate (persisted once per debate).
   */
  promptSources?: {
    agents: AgentPromptMetadata[];
    judge: JudgePromptMetadata;
  };
}

/**
 * A single debate round containing contributions for all phases.
 */
export interface DebateRound {
  roundNumber: number; /** Round index (1-indexed). */
  contributions: Contribution[]; /** All contributions made within this round. */
  timestamp: Date; /** Timestamp when the round was created. */
}

/**
 * A single contribution from an agent within a round.
 */
export interface Contribution {
  agentId: string; /** Unique identifier of the contributing agent. */
  agentRole: AgentRole; /** The role of the contributing agent. */
  type: ContributionType; /** The contribution type (proposal, critique, or refinement). */
  content: string; /** The main textual content. */
  targetAgentId?: string; /** The agent id this critique targets (only for critiques). */
  metadata: {
    tokensUsed?: number; /** Optional number of tokens used. */
    latencyMs?: number; /** Optional latency in milliseconds. */
    model?: string; /** Optional model used for the contribution. */
  };
}

/**
 * Final synthesized solution returned by the judge.
 */
export interface Solution {
  description: string; /** Summary description of the solution. */
  implementation?: string; /** Optional implementation guidance or snippet. */
  tradeoffs: string[]; /** Trade-offs considered. */
  recommendations: string[]; /** Concrete recommendations. */
  confidence: number; /** Confidence score (0-100). */
  synthesizedBy: string; /** Judge agent id that performed the synthesis. */
}

/**
 * Top-level result of a debate run including the final solution and metadata.
 */
export interface DebateResult {
  debateId: string; /** Debate identifier for correlating with persisted state. */
  solution: Solution; /** Final solution. */
  rounds: DebateRound[]; /** Executed rounds and their contributions. */
  /** Aggregate metadata about the debate execution. */
  metadata: {
    totalRounds: number; /** Number of rounds actually executed. */
    totalTokens?: number; /** Optional total tokens used across all contributions (if computed). */
    durationMs: number; /** Total duration in milliseconds. */
  };
}

/**
 * Context object provided to agents and judge.
 */
export interface DebateContext {
  
  problem: string; /** Problem statement. */
  context?: string; /** Optional additional context for the current request. */
  history?: DebateRound[]; /** Optional full history of rounds when enabled. */
  summary?: string; /** Optional pre-computed summary for context compression. */
}
