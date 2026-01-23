import type { AgentRole } from '../../types/agent.types';
import type { DebateContext } from '../../types/debate.types';

/**
 * Creates a minimal mock DebateContext with empty history.
 * 
 * @param problem - The problem statement (default: empty string)
 * @returns A DebateContext with the specified problem and empty history
 */
export function createMockDebateContext(problem: string = ''): DebateContext {
  return {
    problem,
    history: [],
  };
}

/**
 * Creates a mock DebateContext with full history (contributions but no summaries).
 * 
 * @param problem - The problem statement (default: empty string)
 * @returns A DebateContext with the specified problem and one round of history with contributions
 */
export function createMockDebateContextWithFullHistory(problem: string = ''): DebateContext {
  return {
    problem,
    history: [
      {
        roundNumber: 1,
        contributions: [
          {
            agentId: 'agent-1',
            agentRole: 'architect',
            type: 'proposal',
            content: 'Previous proposal',
            metadata: {},
          },
        ],
        summaries: {},
        timestamp: new Date(),
      },
    ],
  };
}

/**
 * Creates a mock DebateContext with a summary for a specific agent.
 * 
 * @param agentId - The agent ID for the summary
 * @param agentRole - The role of the agent (default: 'architect')
 * @param problem - The problem statement (default: empty string)
 * @returns A DebateContext with the specified problem and one round containing a summary for the agent
 */
export function createMockDebateContextWithSummary(
  agentId: string,
  agentRole: AgentRole = 'architect',
  problem: string = ''
): DebateContext {
  return {
    problem,
    history: [
      {
        roundNumber: 1,
        contributions: [],
        summaries: {
          [agentId]: {
            agentId,
            agentRole,
            summary: 'Previous round summary',
            metadata: {
              beforeChars: 1000,
              afterChars: 500,
              method: 'length-based',
              timestamp: new Date(),
            },
          },
        },
        timestamp: new Date(),
      },
    ],
  };
}

/**
 * Creates a mock DebateContext with clarifications.
 * 
 * @param agentName - The name of the agent asking the clarification
 * @param role - The role of the agent
 * @param question - The clarification question
 * @param answer - The answer to the clarification question
 * @param problem - The problem statement (default: empty string)
 * @param agentId - The agent ID (default: 'agent-1')
 * @param questionId - The question ID (default: 'q1')
 * @returns A DebateContext with the specified problem, empty history, and clarifications
 */
export function createMockDebateContextWithClarifications(
  agentName: string,
  role: AgentRole,
  question: string,
  answer: string,
  problem: string = '',
  agentId: string = 'agent-1',
  questionId: string = 'q1'
): DebateContext {
  return {
    problem,
    history: [],
    clarifications: [
      {
        agentId,
        agentName,
        role,
        items: [
          {
            id: questionId,
            question,
            answer,
          },
        ],
      },
    ],
  };
}
