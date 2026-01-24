import type { DebateContext, DebateRound, AgentClarifications } from '../types/debate.types';
import { CONTRIBUTION_TYPES } from '../types/debate.types';

import { formatHistory, formatContextSection, prependContext, formatClarifications } from './context-formatter';

describe('context-formatter', () => {
  describe('formatHistory', () => {
    it('should return empty string for empty history', () => {
      const history: DebateRound[] = [];
      const result = formatHistory(history);
      expect(result).toBe('');
    });

    it('should format single round with single contribution', () => {
      const history: DebateRound[] = [
        {
          roundNumber: 1,
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: 'architect',
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: 'This is a proposal',
              metadata: {},
            },
          ],
          timestamp: new Date(),
        },
      ];
      const result = formatHistory(history);
      expect(result).toBe('Round 1:\n  [architect] proposal: This is a proposal');
    });

    it('should format single round with multiple contributions', () => {
      const history: DebateRound[] = [
        {
          roundNumber: 1,
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: 'architect',
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: 'Proposal 1',
              metadata: {},
            },
            {
              agentId: 'agent-2',
              agentRole: 'performance',
              type: CONTRIBUTION_TYPES.CRITIQUE,
              content: 'Critique 1',
              metadata: {},
            },
          ],
          timestamp: new Date(),
        },
      ];
      const result = formatHistory(history);
      expect(result).toBe('Round 1:\n  [architect] proposal: Proposal 1\n  [performance] critique: Critique 1');
    });

    it('should format multiple rounds', () => {
      const history: DebateRound[] = [
        {
          roundNumber: 1,
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: 'architect',
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: 'Round 1 proposal',
              metadata: {},
            },
          ],
          timestamp: new Date(),
        },
        {
          roundNumber: 2,
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: 'architect',
              type: CONTRIBUTION_TYPES.REFINEMENT,
              content: 'Round 2 refinement',
              metadata: {},
            },
          ],
          timestamp: new Date(),
        },
      ];
      const result = formatHistory(history);
      expect(result).toBe('Round 1:\n  [architect] proposal: Round 1 proposal\n\nRound 2:\n  [architect] refinement: Round 2 refinement');
    });

    it('should extract first line from multi-line content', () => {
      const history: DebateRound[] = [
        {
          roundNumber: 1,
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: 'architect',
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: 'First line\nSecond line\nThird line',
              metadata: {},
            },
          ],
          timestamp: new Date(),
        },
      ];
      const result = formatHistory(history);
      expect(result).toBe('Round 1:\n  [architect] proposal: First line');
    });

    it('should truncate content longer than MAX_PREVIEW_LENGTH', () => {
      const longContent = 'a'.repeat(150);
      const history: DebateRound[] = [
        {
          roundNumber: 1,
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: 'architect',
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: longContent,
              metadata: {},
            },
          ],
          timestamp: new Date(),
        },
      ];
      const result = formatHistory(history);
      expect(result).toContain('a'.repeat(100) + '...');
      expect(result).not.toContain('a'.repeat(101));
    });

    it('should not truncate content exactly at MAX_PREVIEW_LENGTH', () => {
      const exactLengthContent = 'a'.repeat(100);
      const history: DebateRound[] = [
        {
          roundNumber: 1,
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: 'architect',
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: exactLengthContent,
              metadata: {},
            },
          ],
          timestamp: new Date(),
        },
      ];
      const result = formatHistory(history);
      expect(result).toContain(exactLengthContent);
      expect(result).not.toContain('...');
    });

    it('should handle empty content', () => {
      const history: DebateRound[] = [
        {
          roundNumber: 1,
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: 'architect',
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: '',
              metadata: {},
            },
          ],
          timestamp: new Date(),
        },
      ];
      const result = formatHistory(history);
      expect(result).toBe('Round 1:\n  [architect] proposal: ');
    });

    it('should handle content with only newlines', () => {
      const history: DebateRound[] = [
        {
          roundNumber: 1,
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: 'architect',
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: '\n\n\n',
              metadata: {},
            },
          ],
          timestamp: new Date(),
        },
      ];
      const result = formatHistory(history);
      expect(result).toBe('Round 1:\n  [architect] proposal: ');
    });

    it('should truncate first line if it exceeds MAX_PREVIEW_LENGTH', () => {
      const firstLine = 'a'.repeat(150);
      const content = `${firstLine}\nSecond line`;
      const history: DebateRound[] = [
        {
          roundNumber: 1,
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: 'architect',
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content,
              metadata: {},
            },
          ],
          timestamp: new Date(),
        },
      ];
      const result = formatHistory(history);
      expect(result).toContain('a'.repeat(100) + '...');
      expect(result).not.toContain('Second line');
    });
  });

  describe('formatContextSection', () => {
    it('should return empty string for null context', () => {
      const result = formatContextSection(null as unknown as DebateContext, 'agent-1');
      expect(result).toBe('');
    });

    it('should return empty string for undefined context', () => {
      const result = formatContextSection(undefined as unknown as DebateContext, 'agent-1');
      expect(result).toBe('');
    });

    it('should return empty string for context with no history', () => {
      const context: DebateContext = {
        problem: 'Test problem',
      };
      const result = formatContextSection(context, 'agent-1');
      expect(result).toBe('');
    });

    it('should return empty string for context with empty history array', () => {
      const context: DebateContext = {
        problem: 'Test problem',
        history: [],
      };
      const result = formatContextSection(context, 'agent-1');
      expect(result).toBe('');
    });

    it('should return summary from most recent round when available', () => {
      const context: DebateContext = {
        problem: 'Test problem',
        history: [
          {
            roundNumber: 1,
            contributions: [],
            timestamp: new Date(),
            summaries: {
              'agent-1': {
                agentId: 'agent-1',
                agentRole: 'architect',
                summary: 'Summary from round 1',
                metadata: {
                  beforeChars: 100,
                  afterChars: 50,
                  method: 'length-based',
                  timestamp: new Date(),
                },
              },
            },
          },
          {
            roundNumber: 2,
            contributions: [],
            timestamp: new Date(),
            summaries: {
              'agent-1': {
                agentId: 'agent-1',
                agentRole: 'architect',
                summary: 'Summary from round 2',
                metadata: {
                  beforeChars: 100,
                  afterChars: 50,
                  method: 'length-based',
                  timestamp: new Date(),
                },
              },
            },
          },
        ],
      };
      const result = formatContextSection(context, 'agent-1');
      expect(result).toContain('Summary from round 2');
      expect(result).not.toContain('Summary from round 1');
      expect(result).toContain('[SUMMARY from Round 2]');
      expect(result).toContain('=== Previous Debate Context ===');
    });

    it('should return summary from earlier round when no summary in most recent round', () => {
      const context: DebateContext = {
        problem: 'Test problem',
        history: [
          {
            roundNumber: 1,
            contributions: [],
            timestamp: new Date(),
            summaries: {
              'agent-1': {
                agentId: 'agent-1',
                agentRole: 'architect',
                summary: 'Summary from round 1',
                metadata: {
                  beforeChars: 100,
                  afterChars: 50,
                  method: 'length-based',
                  timestamp: new Date(),
                },
              },
            },
          },
          {
            roundNumber: 2,
            contributions: [],
            timestamp: new Date(),
          },
        ],
      };
      const result = formatContextSection(context, 'agent-1');
      expect(result).toContain('Summary from round 1');
      expect(result).toContain('[SUMMARY from Round 1]');
    });

    it('should return full history when no summary found and includeFullHistory is true', () => {
      const context: DebateContext = {
        problem: 'Test problem',
        history: [
          {
            roundNumber: 1,
            contributions: [
              {
                agentId: 'agent-1',
                agentRole: 'architect',
                type: CONTRIBUTION_TYPES.PROPOSAL,
                content: 'Proposal content',
                metadata: {},
              },
            ],
            timestamp: new Date(),
          },
        ],
      };
      const result = formatContextSection(context, 'agent-1', true);
      expect(result).toContain('=== Previous Debate Rounds ===');
      expect(result).toContain('Round 1:');
      expect(result).toContain('Proposal content');
    });

    it('should return empty string when no summary found and includeFullHistory is false', () => {
      const context: DebateContext = {
        problem: 'Test problem',
        history: [
          {
            roundNumber: 1,
            contributions: [
              {
                agentId: 'agent-1',
                agentRole: 'architect',
                type: CONTRIBUTION_TYPES.PROPOSAL,
                content: 'Proposal content',
                metadata: {},
              },
            ],
            timestamp: new Date(),
          },
        ],
      };
      const result = formatContextSection(context, 'agent-1', false);
      expect(result).toBe('');
    });

    it('should use default includeFullHistory=true when not specified', () => {
      const context: DebateContext = {
        problem: 'Test problem',
        history: [
          {
            roundNumber: 1,
            contributions: [
              {
                agentId: 'agent-1',
                agentRole: 'architect',
                type: CONTRIBUTION_TYPES.PROPOSAL,
                content: 'Proposal content',
                metadata: {},
              },
            ],
            timestamp: new Date(),
          },
        ],
      };
      const result = formatContextSection(context, 'agent-1');
      expect(result).toContain('=== Previous Debate Rounds ===');
    });

    it('should skip rounds with undefined summaries', () => {
      const context: DebateContext = {
        problem: 'Test problem',
        history: [
          {
            roundNumber: 1,
            contributions: [],
            timestamp: new Date(),
          },
          {
            roundNumber: 2,
            contributions: [],
            timestamp: new Date(),
            summaries: {
              'agent-1': {
                agentId: 'agent-1',
                agentRole: 'architect',
                summary: 'Summary from round 2',
                metadata: {
                  beforeChars: 100,
                  afterChars: 50,
                  method: 'length-based',
                  timestamp: new Date(),
                },
              },
            },
          },
        ],
      };
      const result = formatContextSection(context, 'agent-1');
      expect(result).toContain('Summary from round 2');
    });

    it('should handle multiple agents with different summaries', () => {
      const context: DebateContext = {
        problem: 'Test problem',
        history: [
          {
            roundNumber: 1,
            contributions: [],
            timestamp: new Date(),
            summaries: {
              'agent-1': {
                agentId: 'agent-1',
                agentRole: 'architect',
                summary: 'Agent 1 summary',
                metadata: {
                  beforeChars: 100,
                  afterChars: 50,
                  method: 'length-based',
                  timestamp: new Date(),
                },
              },
              'agent-2': {
                agentId: 'agent-2',
                agentRole: 'performance',
                summary: 'Agent 2 summary',
                metadata: {
                  beforeChars: 100,
                  afterChars: 50,
                  method: 'length-based',
                  timestamp: new Date(),
                },
              },
            },
          },
        ],
      };
      const result1 = formatContextSection(context, 'agent-1');
      const result2 = formatContextSection(context, 'agent-2');
      expect(result1).toContain('Agent 1 summary');
      expect(result1).not.toContain('Agent 2 summary');
      expect(result2).toContain('Agent 2 summary');
      expect(result2).not.toContain('Agent 1 summary');
    });

    it('should handle round with undefined entry in history array', () => {
      const context: DebateContext = {
        problem: 'Test problem',
        history: [
          {
            roundNumber: 1,
            contributions: [],
            timestamp: new Date(),
          },
          undefined as unknown as DebateRound,
          {
            roundNumber: 3,
            contributions: [],
            timestamp: new Date(),
            summaries: {
              'agent-1': {
                agentId: 'agent-1',
                agentRole: 'architect',
                summary: 'Summary from round 3',
                metadata: {
                  beforeChars: 100,
                  afterChars: 50,
                  method: 'length-based',
                  timestamp: new Date(),
                },
              },
            },
          },
        ],
      };
      const result = formatContextSection(context, 'agent-1');
      expect(result).toContain('Summary from round 3');
    });

    it('should skip null entry when searching backwards for summary', () => {
      // Create a context where we need to skip a null entry to find the summary
      const history: (DebateRound | null | undefined)[] = [
        {
          roundNumber: 1,
          contributions: [],
          timestamp: new Date(),
        },
        null,
        {
          roundNumber: 3,
          contributions: [],
          timestamp: new Date(),
          summaries: {
            'agent-1': {
              agentId: 'agent-1',
              agentRole: 'architect',
              summary: 'Summary from round 3',
              metadata: {
                beforeChars: 100,
                afterChars: 50,
                method: 'length-based',
                timestamp: new Date(),
              },
            },
          },
        },
      ];
      const context: DebateContext = {
        problem: 'Test problem',
        history: history as DebateRound[],
      };
      const result = formatContextSection(context, 'agent-1');
      expect(result).toContain('Summary from round 3');
    });

    it('should execute continue when round is null and summary exists in earlier index', () => {
      // Summary in round 1 (index 0); null at index 1; no summary in round 3 (index 2).
      // Backwards: i=2 no summary; i=1 null -> continue; i=0 has summary -> return.
      const history: (DebateRound | null | undefined)[] = [
        {
          roundNumber: 1,
          contributions: [],
          timestamp: new Date(),
          summaries: {
            'agent-1': {
              agentId: 'agent-1',
              agentRole: 'architect',
              summary: 'Summary from round 1',
              metadata: {
                beforeChars: 100,
                afterChars: 50,
                method: 'length-based',
                timestamp: new Date(),
              },
            },
          },
        },
        null,
        {
          roundNumber: 3,
          contributions: [],
          timestamp: new Date(),
        },
      ];
      const context: DebateContext = {
        problem: 'Test problem',
        history: history as DebateRound[],
      };
      const result = formatContextSection(context, 'agent-1');
      expect(result).toContain('Summary from round 1');
      expect(result).toContain('[SUMMARY from Round 1]');
    });
  });

  describe('prependContext', () => {
    it('should return original prompt when context is undefined', () => {
      const prompt = 'Base prompt';
      const result = prependContext(prompt);
      expect(result).toBe(prompt);
    });

    it('should return original prompt when context is null', () => {
      const prompt = 'Base prompt';
      const result = prependContext(prompt, null as unknown as DebateContext);
      expect(result).toBe(prompt);
    });

    it('should return original prompt when agentId is undefined', () => {
      const prompt = 'Base prompt';
      const context: DebateContext = {
        problem: 'Test problem',
        history: [
          {
            roundNumber: 1,
            contributions: [],
            timestamp: new Date(),
          },
        ],
      };
      const result = prependContext(prompt, context);
      expect(result).toBe(prompt);
    });

    it('should return original prompt when agentId is empty string', () => {
      const prompt = 'Base prompt';
      const context: DebateContext = {
        problem: 'Test problem',
        history: [
          {
            roundNumber: 1,
            contributions: [],
            timestamp: new Date(),
          },
        ],
      };
      const result = prependContext(prompt, context, '');
      expect(result).toBe(prompt);
    });

    it('should prepend clarifications only when no history', () => {
      const prompt = 'Base prompt';
      const context: DebateContext = {
        problem: 'Test problem',
        clarifications: [
          {
            agentId: 'agent-1',
            agentName: 'Test Agent',
            role: 'architect',
            items: [
              {
                id: 'q1',
                question: 'What is the scale?',
                answer: 'Large scale',
              },
            ],
          },
        ],
      };
      const result = prependContext(prompt, context, 'agent-1');
      expect(result).toContain('## Clarifications');
      expect(result).toContain('What is the scale?');
      expect(result).toContain('Large scale');
      expect(result).toContain('Base prompt');
      expect(result.endsWith('Base prompt')).toBe(true);
    });

    it('should prepend history only when no clarifications', () => {
      const prompt = 'Base prompt';
      const context: DebateContext = {
        problem: 'Test problem',
        history: [
          {
            roundNumber: 1,
            contributions: [
              {
                agentId: 'agent-1',
                agentRole: 'architect',
                type: CONTRIBUTION_TYPES.PROPOSAL,
                content: 'Proposal content',
                metadata: {},
              },
            ],
            timestamp: new Date(),
          },
        ],
      };
      const result = prependContext(prompt, context, 'agent-1');
      expect(result).toContain('=== Previous Debate Rounds ===');
      expect(result).toContain('Proposal content');
      expect(result).toContain('Base prompt');
      expect(result.endsWith('Base prompt')).toBe(true);
    });

    it('should prepend both clarifications and history', () => {
      const prompt = 'Base prompt';
      const context: DebateContext = {
        problem: 'Test problem',
        clarifications: [
          {
            agentId: 'agent-1',
            agentName: 'Test Agent',
            role: 'architect',
            items: [
              {
                id: 'q1',
                question: 'What is the scale?',
                answer: 'Large scale',
              },
            ],
          },
        ],
        history: [
          {
            roundNumber: 1,
            contributions: [
              {
                agentId: 'agent-1',
                agentRole: 'architect',
                type: CONTRIBUTION_TYPES.PROPOSAL,
                content: 'Proposal content',
                metadata: {},
              },
            ],
            timestamp: new Date(),
          },
        ],
      };
      const result = prependContext(prompt, context, 'agent-1');
      expect(result).toContain('## Clarifications');
      expect(result).toContain('=== Previous Debate Rounds ===');
      expect(result).toContain('Base prompt');
      expect(result.endsWith('Base prompt')).toBe(true);
    });

    it('should return original prompt when context has no clarifications and no history', () => {
      const prompt = 'Base prompt';
      const context: DebateContext = {
        problem: 'Test problem',
      };
      const result = prependContext(prompt, context, 'agent-1');
      expect(result).toBe(prompt);
    });

    it('should return original prompt when clarifications array is empty', () => {
      const prompt = 'Base prompt';
      const context: DebateContext = {
        problem: 'Test problem',
        clarifications: [],
        history: [],
      };
      const result = prependContext(prompt, context, 'agent-1');
      expect(result).toBe(prompt);
    });

    it('should use includeFullHistory parameter', () => {
      const prompt = 'Base prompt';
      const context: DebateContext = {
        problem: 'Test problem',
        history: [
          {
            roundNumber: 1,
            contributions: [
              {
                agentId: 'agent-1',
                agentRole: 'architect',
                type: CONTRIBUTION_TYPES.PROPOSAL,
                content: 'Proposal content',
                metadata: {},
              },
            ],
            timestamp: new Date(),
          },
        ],
      };
      const resultWithHistory = prependContext(prompt, context, 'agent-1', true);
      const resultWithoutHistory = prependContext(prompt, context, 'agent-1', false);
      expect(resultWithHistory).toContain('=== Previous Debate Rounds ===');
      expect(resultWithoutHistory).toBe(prompt);
    });

    it('should use default includeFullHistory=true when not specified', () => {
      const prompt = 'Base prompt';
      const context: DebateContext = {
        problem: 'Test problem',
        history: [
          {
            roundNumber: 1,
            contributions: [
              {
                agentId: 'agent-1',
                agentRole: 'architect',
                type: CONTRIBUTION_TYPES.PROPOSAL,
                content: 'Proposal content',
                metadata: {},
              },
            ],
            timestamp: new Date(),
          },
        ],
      };
      const result = prependContext(prompt, context, 'agent-1');
      expect(result).toContain('=== Previous Debate Rounds ===');
    });

    it('should handle empty clarifications with newline separator correctly', () => {
      const prompt = 'Base prompt';
      const context: DebateContext = {
        problem: 'Test problem',
        clarifications: [
          {
            agentId: 'agent-1',
            agentName: 'Test Agent',
            role: 'architect',
            items: [
              {
                id: 'q1',
                question: 'Question?',
                answer: 'Answer',
              },
            ],
          },
        ],
        history: [],
      };
      const result = prependContext(prompt, context, 'agent-1', false);
      // Should have clarifications but no history, so no extra newline before prompt
      expect(result).toContain('## Clarifications');
      expect(result).toContain('Base prompt');
    });

    it('should trim whitespace when context section is empty', () => {
      const prompt = 'Base prompt';
      const context: DebateContext = {
        problem: 'Test problem',
        clarifications: [],
        history: [],
      };
      const result = prependContext(prompt, context, 'agent-1', false);
      expect(result).toBe(prompt);
    });
  });

  describe('formatClarifications', () => {
    it('should return formatted text with newline for empty array', () => {
      const result = formatClarifications([]);
      expect(result).toBe('## Clarifications\n\n\n');
    });

    it('should format single agent with single clarification', () => {
      const clarifications: AgentClarifications[] = [
        {
          agentId: 'agent-1',
          agentName: 'System Architect',
          role: 'architect',
          items: [
            {
              id: 'q1',
              question: 'What is the expected scale?',
              answer: 'Large scale system',
            },
          ],
        },
      ];
      const result = formatClarifications(clarifications);
      expect(result).toContain('## Clarifications');
      expect(result).toContain('### System Architect (architect)');
      expect(result).toContain('Question (q1):');
      expect(result).toContain('What is the expected scale?');
      expect(result).toContain('Answer:');
      expect(result).toContain('Large scale system');
      expect(result.endsWith('\n')).toBe(true);
    });

    it('should format single agent with multiple clarifications', () => {
      const clarifications: AgentClarifications[] = [
        {
          agentId: 'agent-1',
          agentName: 'System Architect',
          role: 'architect',
          items: [
            {
              id: 'q1',
              question: 'What is the expected scale?',
              answer: 'Large scale system',
            },
            {
              id: 'q2',
              question: 'What are the performance requirements?',
              answer: 'Low latency required',
            },
          ],
        },
      ];
      const result = formatClarifications(clarifications);
      expect(result).toContain('Question (q1):');
      expect(result).toContain('What is the expected scale?');
      expect(result).toContain('Question (q2):');
      expect(result).toContain('What are the performance requirements?');
      expect(result).toContain('Large scale system');
      expect(result).toContain('Low latency required');
    });

    it('should format multiple agents with clarifications', () => {
      const clarifications: AgentClarifications[] = [
        {
          agentId: 'agent-1',
          agentName: 'System Architect',
          role: 'architect',
          items: [
            {
              id: 'q1',
              question: 'What is the expected scale?',
              answer: 'Large scale system',
            },
          ],
        },
        {
          agentId: 'agent-2',
          agentName: 'Performance Expert',
          role: 'performance',
          items: [
            {
              id: 'q2',
              question: 'What are the latency requirements?',
              answer: 'Under 100ms',
            },
          ],
        },
      ];
      const result = formatClarifications(clarifications);
      expect(result).toContain('### System Architect (architect)');
      expect(result).toContain('### Performance Expert (performance)');
      expect(result).toContain('What is the expected scale?');
      expect(result).toContain('What are the latency requirements?');
    });

    it('should format clarification with "NA" answer', () => {
      const clarifications: AgentClarifications[] = [
        {
          agentId: 'agent-1',
          agentName: 'System Architect',
          role: 'architect',
          items: [
            {
              id: 'q1',
              question: 'What is the expected scale?',
              answer: 'NA',
            },
          ],
        },
      ];
      const result = formatClarifications(clarifications);
      expect(result).toContain('Question (q1):');
      expect(result).toContain('What is the expected scale?');
      expect(result).toContain('Answer:');
      expect(result).toContain('NA');
    });

    it('should format clarification with empty answer', () => {
      const clarifications: AgentClarifications[] = [
        {
          agentId: 'agent-1',
          agentName: 'System Architect',
          role: 'architect',
          items: [
            {
              id: 'q1',
              question: 'What is the expected scale?',
              answer: '',
            },
          ],
        },
      ];
      const result = formatClarifications(clarifications);
      expect(result).toContain('Question (q1):');
      expect(result).toContain('What is the expected scale?');
      expect(result).toContain('Answer:');
    });

    it('should format agent with empty items array', () => {
      const clarifications: AgentClarifications[] = [
        {
          agentId: 'agent-1',
          agentName: 'System Architect',
          role: 'architect',
          items: [],
        },
      ];
      const result = formatClarifications(clarifications);
      expect(result).toContain('## Clarifications');
      expect(result).toContain('### System Architect (architect)');
      expect(result.endsWith('\n')).toBe(true);
    });

    it('should format clarification with multi-line question and answer', () => {
      const clarifications: AgentClarifications[] = [
        {
          agentId: 'agent-1',
          agentName: 'System Architect',
          role: 'architect',
          items: [
            {
              id: 'q1',
              question: 'Question line 1\nQuestion line 2',
              answer: 'Answer line 1\nAnswer line 2',
            },
          ],
        },
      ];
      const result = formatClarifications(clarifications);
      expect(result).toContain('Question line 1\nQuestion line 2');
      expect(result).toContain('Answer line 1\nAnswer line 2');
    });

    it('should format multiple items with same agent', () => {
      const clarifications: AgentClarifications[] = [
        {
          agentId: 'agent-1',
          agentName: 'System Architect',
          role: 'architect',
          items: [
            {
              id: 'q1',
              question: 'Question 1?',
              answer: 'Answer 1',
            },
            {
              id: 'q2',
              question: 'Question 2?',
              answer: 'Answer 2',
            },
            {
              id: 'q3',
              question: 'Question 3?',
              answer: 'Answer 3',
            },
          ],
        },
      ];
      const result = formatClarifications(clarifications);
      expect(result).toContain('Question (q1):');
      expect(result).toContain('Question (q2):');
      expect(result).toContain('Question (q3):');
      expect(result).toContain('Answer 1');
      expect(result).toContain('Answer 2');
      expect(result).toContain('Answer 3');
    });
  });
});
