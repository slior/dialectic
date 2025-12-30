/**
 * Types for the Dialectic Web UI.
 * These mirror the core types but are simplified for UI consumption.
 */

export type ContributionType = 'proposal' | 'critique' | 'refinement';

/** String literal constants for debate statuses (UI-specific) */
export const DEBATE_STATUS = {
  IDLE: 'idle',
  COLLECTING_CLARIFICATIONS: 'collecting_clarifications',
  AWAITING_CLARIFICATIONS: 'awaiting_clarifications',
  RUNNING: 'running',
  COMPLETED: 'completed',
  ERROR: 'error',
} as const;

/** Union type of all debate statuses */
export type DebateStatus = (typeof DEBATE_STATUS)[keyof typeof DEBATE_STATUS];

/** String literal constants for connection statuses */
export const CONNECTION_STATUS = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
} as const;

/** Union type of all connection statuses */
export type ConnectionStatus = (typeof CONNECTION_STATUS)[keyof typeof CONNECTION_STATUS];

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  model: string;
  provider: string;
  temperature: number;
}

export interface AgentConfigInput {
  id: string;
  name: string;
  role: string; // AgentRole from core
  model: string;
  provider: string; // LLM_PROVIDERS from core
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
  status: DebateStatus;
  connectionStatus: ConnectionStatus;
  problem: string;
  clarificationsEnabled: boolean;
  rounds: number;
  clarificationQuestions?: AgentClarifications[];
  agents: AgentState[];
  agentConfigs: AgentConfigInput[];
  configPanelCollapsed: boolean;
  currentRound: number;
  totalRounds: number;
  currentPhase?: ContributionType;
  solution?: Solution;
  notifications: NotificationMessage[];
  isRunning: boolean;
  debateId?: string;
  userFeedback?: number;
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
  SET_AGENT_CONFIGS: 'SET_AGENT_CONFIGS',
  UPDATE_AGENT_CONFIG: 'UPDATE_AGENT_CONFIG',
  ADD_AGENT_CONFIG: 'ADD_AGENT_CONFIG',
  REMOVE_AGENT_CONFIG: 'REMOVE_AGENT_CONFIG',
  SET_CONFIG_PANEL_COLLAPSED: 'SET_CONFIG_PANEL_COLLAPSED',
  SET_CONNECTION_STATUS: 'SET_CONNECTION_STATUS',
  SET_USER_FEEDBACK: 'SET_USER_FEEDBACK',
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
  | { type: typeof ACTION_TYPES.CLEAR_NOTIFICATION; payload: string }
  | { type: typeof ACTION_TYPES.SET_AGENT_CONFIGS; payload: AgentConfigInput[] }
  | { type: typeof ACTION_TYPES.UPDATE_AGENT_CONFIG; payload: { index: number; agent: AgentConfigInput } }
  | { type: typeof ACTION_TYPES.ADD_AGENT_CONFIG; payload: AgentConfigInput }
  | { type: typeof ACTION_TYPES.REMOVE_AGENT_CONFIG; payload: number }
  | { type: typeof ACTION_TYPES.SET_CONFIG_PANEL_COLLAPSED; payload: boolean }
  | { type: typeof ACTION_TYPES.SET_CONNECTION_STATUS; payload: ConnectionStatus }
  | { type: typeof ACTION_TYPES.SET_USER_FEEDBACK; payload: number };

