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

export type DebateAction =
  | { type: 'SET_PROBLEM'; payload: string }
  | { type: 'TOGGLE_CLARIFICATIONS' }
  | { type: 'DEBATE_STARTED' }
  | { type: 'COLLECTING_CLARIFICATIONS' }
  | { type: 'CLARIFICATIONS_REQUIRED'; payload: { questions: AgentClarifications[] } }
  | { type: 'CLARIFICATIONS_SUBMITTED' }
  | { type: 'CONNECTION_ESTABLISHED'; payload: { agents: AgentConfig[]; judge: AgentConfig } }
  | { type: 'ROUND_START'; payload: { round: number; total: number } }
  | { type: 'PHASE_START'; payload: { round: number; phase: ContributionType; expectedCount: number } }
  | { type: 'AGENT_START'; payload: { agentName: string; activity: string } }
  | { type: 'AGENT_COMPLETE'; payload: { agentName: string; activity: string } }
  | { type: 'PHASE_COMPLETE'; payload: { round: number; phase: ContributionType } }
  | { type: 'SYNTHESIS_START' }
  | { type: 'SYNTHESIS_COMPLETE' }
  | { type: 'DEBATE_COMPLETE'; payload: DebateResult }
  | { type: 'ERROR'; payload: { message: string } }
  | { type: 'WARNING'; payload: { message: string } }
  | { type: 'DEBATE_CANCELLED' }
  | { type: 'ADD_NOTIFICATION'; payload: NotificationMessage }
  | { type: 'CLEAR_NOTIFICATION'; payload: string };

