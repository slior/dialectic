import { AgentClarifications, DebateContext } from '../types/debate.types';

import { Agent } from './agent';

/**
 * Collects clarifying questions from each agent, enforcing a per-agent limit and returning
 * normalized groups with empty answers to be filled by the CLI.
 *
 * @param problem - The problem statement to clarify
 * @param agents - List of agents participating
 * @param maxPerAgent - Maximum number of questions allowed per agent
 * @param warn - Warning output function for user-facing messages
 * @param existingClarifications - Optional previous Q&A; when set, agents receive this in context
 *   and may return follow-up questions or an empty list
 */
export async function collectClarifications(
  problem: string,
  agents: Agent[],
  maxPerAgent: number,
  warn: (message: string) => void,
  existingClarifications?: AgentClarifications[]
): Promise<AgentClarifications[]> {
  const agentPromises = agents.map(async (a) => {
    const ctx: DebateContext = existingClarifications
      ? { problem, clarifications: existingClarifications }
      : { problem };
    const res = await a.askClarifyingQuestions(problem, ctx);
    const list = Array.isArray(res?.questions) ? res.questions : [];
    const truncated = list.slice(0, maxPerAgent);
    if (list.length > maxPerAgent) {
      warn(`Agent ${a.config.name} returned ${list.length} questions; limited to ${maxPerAgent}.`);
    }
    return {
      agentId: a.config.id,
      agentName: a.config.name,
      role: a.config.role,
      items: truncated.map((q) => ({ id: q.id!, question: q.text, answer: '' }))
    };
  });

  return Promise.all(agentPromises);
}


