/**
 * Types for the Dialectic Web UI.
 * These mirror the core types but are simplified for UI consumption.
 */

export type ContributionType = 'proposal' | 'critique' | 'refinement';

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  model: string;
  provider: string;
  temperature: number;
}

export interface Contribution {
  agentId: string;
  agentRole: string;
  type: ContributionType;
  content: string;
  targetAgentId?: string;
}

export interface Round {
  roundNumber: number;
  contributions: Contribution[];
}

export interface Solution {
  description: string;
  synthesizedBy?: string;
}

export interface DebateResult {
  debateId: string;
  solution: Solution;
  rounds: Round[];
  metadata: {
    totalRounds: number;
    durationMs: number;
  };
}

export interface ClarificationItem {
  id: string;
  question: string;
  answer?: string;
}

export interface AgentClarifications {
  agentId: string;
  agentName: string;
  role: string;
  items: ClarificationItem[];
}

export interface AgentState {
  id: string;
  name: string;
  role: string;
  currentActivity?: string;
  contributions: Array<{
    type: ContributionType;
    round: number;
    content: string;
  }>;
}

export interface DebateState {
  status: 'idle' | 'collecting_clarifications' | 'awaiting_clarifications' | 'running' | 'completed' | 'error';
  problem: string;
  clarificationsEnabled: boolean;
  rounds: number;
  clarificationQuestions?: AgentClarifications[];
  agents: AgentState[];
  currentRound: number;
  totalRounds: number;
  currentPhase?: ContributionType;
  solution?: Solution;
  notifications: NotificationMessage[];
  isRunning: boolean;
}

export interface NotificationMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: Date;
}

export const ACTION_TYPES = {
  SET_PROBLEM: 'SET_PROBLEM',
  SET_ROUNDS: 'SET_ROUNDS',
  TOGGLE_CLARIFICATIONS: 'TOGGLE_CLARIFICATIONS',
  DEBATE_STARTED: 'DEBATE_STARTED',
  COLLECTING_CLARIFICATIONS: 'COLLECTING_CLARIFICATIONS',
  CLARIFICATIONS_REQUIRED: 'CLARIFICATIONS_REQUIRED',
  CLARIFICATIONS_SUBMITTED: 'CLARIFICATIONS_SUBMITTED',
  CONNECTION_ESTABLISHED: 'CONNECTION_ESTABLISHED',
  ROUND_START: 'ROUND_START',
  PHASE_START: 'PHASE_START',
  AGENT_START: 'AGENT_START',
  AGENT_COMPLETE: 'AGENT_COMPLETE',
  PHASE_COMPLETE: 'PHASE_COMPLETE',
  SYNTHESIS_START: 'SYNTHESIS_START',
  SYNTHESIS_COMPLETE: 'SYNTHESIS_COMPLETE',
  DEBATE_COMPLETE: 'DEBATE_COMPLETE',
  CONTRIBUTION_CREATED: 'CONTRIBUTION_CREATED',
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  DEBATE_CANCELLED: 'DEBATE_CANCELLED',
  ADD_NOTIFICATION: 'ADD_NOTIFICATION',
  CLEAR_NOTIFICATION: 'CLEAR_NOTIFICATION',
} as const;

export type DebateAction =
  | { type: typeof ACTION_TYPES.SET_PROBLEM; payload: string }
  | { type: typeof ACTION_TYPES.SET_ROUNDS; payload: number }
  | { type: typeof ACTION_TYPES.TOGGLE_CLARIFICATIONS }
  | { type: typeof ACTION_TYPES.DEBATE_STARTED }
  | { type: typeof ACTION_TYPES.COLLECTING_CLARIFICATIONS }
  | { type: typeof ACTION_TYPES.CLARIFICATIONS_REQUIRED; payload: { questions: AgentClarifications[] } }
  | { type: typeof ACTION_TYPES.CLARIFICATIONS_SUBMITTED }
  | { type: typeof ACTION_TYPES.CONNECTION_ESTABLISHED; payload: { agents: AgentConfig[]; judge: AgentConfig } }
  | { type: typeof ACTION_TYPES.ROUND_START; payload: { round: number; total: number } }
  | { type: typeof ACTION_TYPES.PHASE_START; payload: { round: number; phase: ContributionType; expectedCount: number } }
  | { type: typeof ACTION_TYPES.AGENT_START; payload: { agentName: string; activity: string } }
  | { type: typeof ACTION_TYPES.AGENT_COMPLETE; payload: { agentName: string; activity: string } }
  | { type: typeof ACTION_TYPES.PHASE_COMPLETE; payload: { round: number; phase: ContributionType } }
  | { type: typeof ACTION_TYPES.SYNTHESIS_START }
  | { type: typeof ACTION_TYPES.SYNTHESIS_COMPLETE }
  | { type: typeof ACTION_TYPES.DEBATE_COMPLETE; payload: DebateResult }
  | { type: typeof ACTION_TYPES.CONTRIBUTION_CREATED; payload: { agentId: string; type: ContributionType; round: number; content: string } }
  | { type: typeof ACTION_TYPES.ERROR; payload: { message: string } }
  | { type: typeof ACTION_TYPES.WARNING; payload: { message: string } }
  | { type: typeof ACTION_TYPES.DEBATE_CANCELLED }
  | { type: typeof ACTION_TYPES.ADD_NOTIFICATION; payload: NotificationMessage }
  | { type: typeof ACTION_TYPES.CLEAR_NOTIFICATION; payload: string };

