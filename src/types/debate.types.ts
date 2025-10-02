import { AgentRole } from './agent.types';

export interface DebateConfig {
  rounds: number;
  terminationCondition: { type: 'fixed' | 'convergence' | 'quality'; threshold?: number };
  synthesisMethod: 'judge' | 'voting' | 'merge';
  includeFullHistory: boolean;
  timeoutPerRound: number; // ms
}

export interface DebateState {
  id: string;
  problem: string;
  context?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  currentRound: number;
  rounds: DebateRound[];
  finalSolution?: Solution;
  createdAt: Date;
  updatedAt: Date;
}

export interface DebateRound {
  roundNumber: number;
  phase: 'proposal' | 'critique' | 'refinement';
  contributions: Contribution[];
  timestamp: Date;
}

export interface Contribution {
  agentId: string;
  agentRole: AgentRole;
  type: 'proposal' | 'critique' | 'refinement';
  content: string;
  targetAgentId?: string;
  metadata: {
    tokensUsed?: number;
    latencyMs?: number;
    model?: string;
  };
}

export interface Solution {
  description: string;
  implementation?: string;
  tradeoffs: string[];
  recommendations: string[];
  confidence: number; // 0-100
  synthesizedBy: string; // judge agent id
}

export interface DebateResult {
  debateId: string;
  solution: Solution;
  rounds: DebateRound[];
  metadata: {
    totalRounds: number;
    totalTokens?: number;
    durationMs: number;
  };
}

export interface DebateContext {
  problem: string;
  context?: string;
  history?: DebateRound[];
  summary?: string;
}
