import { Agent } from '../../core/agent';
import { collectClarifications } from '../../core/clarifications';
import { DEFAULT_CLARIFICATIONS_MAX_ITERATIONS, DEFAULT_CLARIFICATIONS_MAX_PER_AGENT } from '../../types/config.types';
import { AgentClarifications, DebateState } from '../../types/debate.types';
import { logWarning } from '../../utils/console';
import { DEBATE_EVENTS, createEvent } from '../events';
import { DebateNode, NodeContext, NodeResult, NodeResultImpl } from '../node';
import { NODE_TYPES } from '../types';

/**
 * Clarification node that handles iterative agent clarifying questions.
 * Supports multiple rounds of clarifications until all agents signal ALL_CLEAR
 * or max iterations is reached.
 */
export class ClarificationNode implements DebateNode {
  readonly nodeType = NODE_TYPES.CLARIFICATION;

  async execute(context: NodeContext): Promise<NodeResult> {
    const { state, agents, stateManager } = context;
    const iterations = state.clarificationIterations ?? 0;
    const pendingAgents = this.getAgentsWithPendingQuestions(state, agents);

    if (this.areClarificationsDoneOrClear(context, pendingAgents)) {
      return NodeResultImpl.createResult(createEvent(DEBATE_EVENTS.ALL_CLEAR));
    }

    // Ask agents for (more) questions, passing existing Q&A history
    //TODO: with interactive clarifications, change this to an interactive process, where we ask a question, get answer and so forth.
    const questions = await this.collectQuestions(pendingAgents.length > 0 ? pendingAgents : agents, context);
    
    // If no questions were collected (all agents signaled ALL_CLEAR), proceed to debate
    if (!questions || questions.length === 0 || !questions.some(q => q.items.length > 0)) {
      return NodeResultImpl.createResult(createEvent(DEBATE_EVENTS.ALL_CLEAR));
    }
    
    // Merge with existing clarifications
    const mergedClarifications = this.mergeClarifications(state.clarifications, questions);
    
    // Update state
    const updatedIterations = iterations + 1;
    await stateManager.setClarifications(state.id, mergedClarifications);
    
    // Get updated state
    const updatedState = await stateManager.getDebate(state.id);
    if (!updatedState) {
      throw new Error(`Debate ${state.id} not found`);
    }
    updatedState.clarificationIterations = updatedIterations;

    return NodeResultImpl.createResult(
      createEvent(DEBATE_EVENTS.QUESTIONS_PENDING),
      { state: updatedState }
    );
  }

  /**
   * Returns true if clarifications are disabled, max iterations reached, or all agents are done (no more questions).
   */
  private areClarificationsDoneOrClear(context: NodeContext, pendingAgents: Agent[]): boolean {
    const { state, config } = context;
    if (!config.interactiveClarifications) {
      return true;
    }
    const iterations = state.clarificationIterations ?? 0;
    const maxIterations = config.clarificationsMaxIterations ?? DEFAULT_CLARIFICATIONS_MAX_ITERATIONS;
    if (iterations >= maxIterations) {
      return true;
    }
    if (pendingAgents.length === 0 && state.hasClarifications()) {
      return true;
    }
    return false;
  }

  /**
   * Checks if an agent has unanswered clarifications.
   * 
   * @param agent - The agent to check.
   * @param clarifications - Array of all agent clarifications.
   * @returns `true` if the agent has unanswered clarifications, `false` otherwise.
   *          Returns `false` if the agent has no clarifications (they've signaled ALL_CLEAR).
   */
  private agentHasUnansweredClarifications(agent: Agent, clarifications: AgentClarifications[]): boolean {
    const agentClarifications = clarifications.find((c: AgentClarifications) => c.agentId === agent.getID());
    if (!agentClarifications || agentClarifications.items.length === 0) {
      // Agent has no clarifications - they've signaled ALL_CLEAR
      return false;
    }

    // Check if all questions are answered (not "NA" or empty)
    return agentClarifications.items.some(
      (item) => !item.answer || item.answer.trim() === '' //|| item.answer === 'NA' //NA is a valid answer
    );
  }

  /**
   * Gets agents that still have pending questions (haven't signaled ALL_CLEAR).
   */
  private getAgentsWithPendingQuestions(state: DebateState, agents: Agent[]): Agent[] {
    if (!state.hasClarifications()) {
      // No clarifications yet - all agents are pending
      return agents;
    }

    // Check which agents have unanswered questions
    // At this point, we know clarifications exist (checked above)
    const clarifications = state.clarifications!;
    return agents.filter((agent) => this.agentHasUnansweredClarifications(agent, clarifications));
  }

  /**
   * Collects questions from agents that have pending questions.
   * In practice, this would be handled externally, but we provide a basic implementation here.
   */
  private async collectQuestions(agents: Agent[], context: NodeContext): Promise<AgentClarifications[]> {
    const maxPerAgent = context.config.clarificationsMaxPerAgent ?? DEFAULT_CLARIFICATIONS_MAX_PER_AGENT;
    return collectClarifications(context.state.problem, agents, maxPerAgent, (msg) => logWarning(msg));
  }

  /**
   * Merges new questions with existing clarifications, preserving answers.
   * 
   * @param existing - Existing clarifications (may be undefined)
   * @param newQuestions - New questions from agents
   * @returns Merged clarifications array
   */
  private mergeClarifications( existing: AgentClarifications[] | undefined, newQuestions: AgentClarifications[] ): AgentClarifications[]
  {
    if (!existing || existing.length === 0) {
      return newQuestions;
    }

    // Create a map of existing clarifications by agentId
    const existingMap = new Map<string, AgentClarifications>();
    for (const group of existing) {
      existingMap.set(group.agentId, group);
    }

    // Merge: preserve existing answers, add new questions
    const merged: AgentClarifications[] = [];
    for (const newGroup of newQuestions) {
      const existingGroup = existingMap.get(newGroup.agentId);
      if (existingGroup) {
        merged.push(this.mergeWithExistingGroup(existingGroup, newGroup));
      } else {
        // New agent - add all questions
        merged.push(newGroup);
      }
    }

    // Add any existing agents not in new questions (they've signaled ALL_CLEAR)
    for (const existingGroup of existing) {
      if (!existingMap.has(existingGroup.agentId) || !newQuestions.some(n => n.agentId === existingGroup.agentId)) {
        // Check if this agent still has unanswered questions
        const hasUnanswered = existingGroup.items.some(
          item => !item.answer || item.answer.trim() === '' || item.answer === 'NA'
        );
        if (hasUnanswered) {
          merged.push(existingGroup);
        }
      }
    }

    return merged;
  }

  /**
   * Merges a new clarifications group into an existing group for the same agent.
   * 
   * - Preserves all items from the existing group, including their answers.
   * - Adds any new questions from the new group that are not already present in the existing group (by ID).
   * - Does not overwrite existing answers.
   *
   * @param existingGroup - The current set of clarifications for an agent, possibly including answered items.
   * @param newGroup - The newly proposed clarifications for the same agent (may introduce new questions).
   * @returns An AgentClarifications object containing the union of items, with existing answers preserved.
   */
  private mergeWithExistingGroup( existingGroup: AgentClarifications, newGroup: AgentClarifications ): AgentClarifications {
    const existingItemMap = new Map<string, { answer: string }>();
    for (const item of existingGroup.items) {
      if (item.answer && item.answer.trim() !== '') {
        existingItemMap.set(item.id, { answer: item.answer });
      }
    }

    const mergedItems = [...existingGroup.items];
    for (const newItem of newGroup.items) {
      if (!existingItemMap.has(newItem.id)) {
        mergedItems.push(newItem);
      }
    }

    return {
      ...existingGroup,
      items: mergedItems,
    };
  }
}
