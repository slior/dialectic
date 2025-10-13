import type { DebateContext, DebateRound } from '../types/debate.types';

/**
 * Formats debate history into a readable string for LLM prompts.
 * Groups contributions by round and formats with clear labels.
 * 
 * @param history - Array of debate rounds to format.
 * @returns A formatted string representation of the debate history.
 */
export function formatHistory(history: DebateRound[]): string {
  return history.map(round => {
    const contributions = round.contributions.map(c => {
      const firstLine = c.content.split('\n')[0] || '';
      const preview = firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
      return `  [${c.agentRole}] ${c.type}: ${preview}`;
    }).join('\n');
    return `Round ${round.roundNumber}:\n${contributions}`;
  }).join('\n\n');
}

/**
 * Formats a context section for inclusion in prompts.
 * Searches backwards through rounds to find this agent's most recent summary.
 * Falls back to full history only if includeFullHistory is true and no summary found.
 * Returns empty string if no context available or includeFullHistory is false.
 * 
 * @param context - The debate context containing history.
 * @param agentId - The agent ID to look up the summary for.
 * @param includeFullHistory - Whether to fall back to full history when no summary is found.
 * @returns A formatted context section, or empty string if no context.
 */
export function formatContextSection(context: DebateContext, agentId: string, includeFullHistory: boolean = true): string {
  if (!context?.history || context.history.length === 0) {
    return '';
  }
  
  // Search backwards through rounds to find this agent's most recent summary
  for (let i = context.history.length - 1; i >= 0; i--) {
    const round = context.history[i];
    if (!round) continue;
    
    const agentSummary = round.summaries?.[agentId];
    
    if (agentSummary) {
      return `=== Previous Debate Context ===\n\n` +
             `[SUMMARY from Round ${round.roundNumber}]\n` +
             `${agentSummary.summary}\n\n` +
             `===================================\n\n`;
    }
  }
  
  // No summary found for this agent
  if (includeFullHistory) {
    // Fall back to full history only if includeFullHistory is true
    return `=== Previous Debate Rounds ===\n\n` +
           `${formatHistory(context.history)}\n\n` +
           `===================================\n\n`;
  } else {
    // Return empty string if includeFullHistory is false
    return '';
  }
}

/**
 * Prepends a context section to a prompt if context is available.
 * Adds proper formatting and separation.
 * 
 * @param prompt - The base prompt to prepend context to.
 * @param context - The debate context.
 * @param agentId - The agent ID for finding their specific summary.
 * @param includeFullHistory - Whether to fall back to full history when no summary is found.
 * @returns The prompt with context prepended, or the original prompt if no context.
 */
export function prependContext(prompt: string, context?: DebateContext, agentId?: string, includeFullHistory: boolean = true): string {
  if (!context || !agentId) {
    return prompt;
  }
  
  const contextSection = formatContextSection(context, agentId, includeFullHistory);
  if (!contextSection) {
    return prompt;
  }
  
  return contextSection + prompt;
}

