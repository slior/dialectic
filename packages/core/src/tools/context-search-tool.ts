import { DebateContext, Contribution, DebateState, DebateRound } from '../types/debate.types';
import { ToolSchema } from '../types/tool.types';

import { ToolImplementation, createToolErrorJson, createToolSuccessJson } from './tool-implementation';

/**
 * Maximum length for content snippets returned by context search.
 */
const MAX_CONTENT_SNIPPET_LENGTH = 200;

/**
 * Represents a match found by the context search tool.
 */
type ContextSearchMatch = {
  roundNumber: number;
  agentId: string;
  agentRole: string;
  type: string;
  contentSnippet: string;
};

/**
 * Context Search tool allows agents to search for terms in debate history.
 * Returns relevant contributions containing the search term.
 */
export class ContextSearchTool implements ToolImplementation {
  name = 'context_search';
  
  schema: ToolSchema = {
    name: 'context_search',
    description: 'Search for a term in the debate history. Returns relevant contributions containing the search term.',
    parameters: {
      type: 'object',
      properties: {
        term: {
          type: 'string',
          description: 'The search term to find in debate history',
        },
      },
      required: ['term'],
    },
  };

  /**
   * Executes the context search tool.
   * Searches through debate history for contributions containing the search term.
   * Uses state.rounds if provided (takes precedence), otherwise falls back to context.history.
   * 
   * @param args - Tool arguments containing the search term.
   * @param context - Optional debate context containing history to search.
   * @param state - Optional debate state providing access to full debate rounds (takes precedence over context.history).
   * @returns JSON string with status and matches array.
   */
  execute(args: { term?: string }, context?: DebateContext, state?: DebateState): string {
    const validationError = this.verifyToolArguments(args, context);
    if (validationError) {
      return validationError;
    }

    // After validation, context and args.term are guaranteed to be defined
    const validatedContext = context!;
    const validatedTerm = args.term!;

    // Determine history source: prefer state.rounds, fall back to context.history
    const history = state?.rounds ?? validatedContext.history;

    if (!history || history.length === 0) {
      return createToolSuccessJson({
        matches: [],
      });
    }

    const searchTerm = validatedTerm.toLowerCase();
    const matches: ContextSearchMatch[] = [];

    // Search through all rounds and contributions
    for (const round of history) {
      this.searchRound(round, searchTerm, matches);
    }

    return createToolSuccessJson({
      matches,
    });
  }

  /**
   * Searches a single round for contributions matching the search term.
   * Adds any matches found to the provided matches array.
   * 
   * @param round - The debate round to search.
   * @param searchTerm - The lowercase search term to find.
   * @param matches - Array to add matches to.
   */
  private searchRound(round: DebateRound, searchTerm: string, matches: ContextSearchMatch[]): void {
    if (!round.contributions) return;

    for (const contribution of round.contributions) {
      const match = this.processContributionMatch(contribution, searchTerm, round.roundNumber);
      if (match) {
        matches.push(match);
      }
    }
  }

  /**
   * Verifies that the tool arguments and context are valid.
   * 
   * @param args - Tool arguments containing the search term.
   * @param context - Optional debate context containing history to search.
   * @returns Error JSON string if validation fails, null if validation passes.
   */
  private verifyToolArguments(args: { term?: string }, context?: DebateContext): string | null {
    if (!context) {
      return createToolErrorJson('Context is required for context search');
    }

    if (!args.term || typeof args.term !== 'string') {
      return createToolErrorJson('Search term is required and must be a string');
    }

    return null;
  }

  /**
   * Processes a contribution to check if it matches the search term and creates a match object if found.
   * 
   * @param contribution - The contribution to check.
   * @param searchTerm - The lowercase search term to find.
   * @param roundNumber - The round number this contribution belongs to.
   * @returns Match object if the contribution contains the search term, null otherwise.
   */
  private processContributionMatch( contribution: Contribution, searchTerm: string, roundNumber: number ): ContextSearchMatch | null {
    const content = contribution.content.toLowerCase();
    
    if (!content.includes(searchTerm)) {
      return null;
    }

    // Extract a snippet around the match
    const snippet = contribution.content.substring(0, MAX_CONTENT_SNIPPET_LENGTH);
    const truncatedSnippet = contribution.content.length > MAX_CONTENT_SNIPPET_LENGTH 
      ? snippet + '...' 
      : snippet;

    return {
      roundNumber,
      agentId: contribution.agentId,
      agentRole: contribution.agentRole,
      type: contribution.type,
      contentSnippet: truncatedSnippet,
    };
  }
}

