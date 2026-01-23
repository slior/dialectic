import type { Langfuse } from 'langfuse';

import type { AgentConfig } from '../types/agent.types';
import type { TracingContext } from '../types/tracing.types';

import {
  CLARIFY_TAG,
  TRACE_NAME_PREFIX,
  buildTraceTags,
  collectUniqueAgentRoles,
  collectUniqueToolNames,
  formatTraceNameWithTimestamp,
  getSpanParent,
} from './tracing-utils';

/**
 * Mock type for Langfuse generation with jest mocks.
 */
interface MockLangfuseGeneration {
  end: jest.Mock;
}

/**
 * Mock type for Langfuse span with jest mocks.
 */
interface MockLangfuseSpan {
  end: jest.Mock;
  generation: jest.Mock<MockLangfuseGeneration>;
}

/**
 * Mock type for Langfuse trace with jest mocks.
 */
interface MockLangfuseTrace {
  span: jest.Mock<MockLangfuseSpan>;
  generation: jest.Mock<MockLangfuseGeneration>;
}

describe('tracing-utils', () => {
  describe('CLARIFY_TAG', () => {
    it('should have the correct value', () => {
      expect(CLARIFY_TAG).toBe('clarify');
    });
  });

  describe('TRACE_NAME_PREFIX', () => {
    it('should have the correct value', () => {
      expect(TRACE_NAME_PREFIX).toBe('debate-command');
    });
  });

  describe('getSpanParent', () => {
    let mockTrace: MockLangfuseTrace;
    let mockSpan: MockLangfuseSpan;
    let tracingContext: TracingContext;

    beforeEach(() => {
      mockSpan = {
        end: jest.fn(),
        generation: jest.fn(),
      };

      mockTrace = {
        span: jest.fn().mockReturnValue(mockSpan),
        generation: jest.fn(),
      };

      tracingContext = {
        langfuse: {} as unknown as Langfuse,
        trace: mockTrace as unknown as ReturnType<Langfuse['trace']>,
        currentSpans: new Map(),
      };
    });

    it('should return trace when agentId is undefined', () => {
      const result = getSpanParent(tracingContext);
      expect(result).toBe(mockTrace);
    });

    it('should return trace when agentId is not in currentSpans map', () => {
      const result = getSpanParent(tracingContext, 'agent-1');
      expect(result).toBe(mockTrace);
    });

    it('should return span when agentId exists in currentSpans map', () => {
      const agentId = 'agent-1';
      tracingContext.currentSpans.set(agentId, mockSpan as unknown as ReturnType<TracingContext['trace']['span']>);
      
      const result = getSpanParent(tracingContext, agentId);
      expect(result).toBe(mockSpan);
    });

    it('should return different spans for different agentIds', () => {
      const agentId1 = 'agent-1';
      const agentId2 = 'agent-2';
      const mockSpan2: MockLangfuseSpan = {
        end: jest.fn(),
        generation: jest.fn(),
      };

      tracingContext.currentSpans.set(agentId1, mockSpan as unknown as ReturnType<TracingContext['trace']['span']>);
      tracingContext.currentSpans.set(agentId2, mockSpan2 as unknown as ReturnType<TracingContext['trace']['span']>);

      const result1 = getSpanParent(tracingContext, agentId1);
      const result2 = getSpanParent(tracingContext, agentId2);

      expect(result1).toBe(mockSpan);
      expect(result2).toBe(mockSpan2);
    });

    it('should return trace when agentId is empty string', () => {
      const result = getSpanParent(tracingContext, '');
      expect(result).toBe(mockTrace);
    });
  });

  describe('collectUniqueToolNames', () => {
    it('should return empty array when agentConfigs is empty', () => {
      const agentConfigs: AgentConfig[] = [];
      const result = collectUniqueToolNames(agentConfigs);
      expect(result).toEqual([]);
    });

    it('should return empty array when no agents have tools', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: 'performance',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
      ];
      const result = collectUniqueToolNames(agentConfigs);
      expect(result).toEqual([]);
    });

    it('should return empty array when tools array is empty', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [],
        },
      ];
      const result = collectUniqueToolNames(agentConfigs);
      expect(result).toEqual([]);
    });

    it('should collect unique tool names from single agent', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [
            { name: 'tool1' },
            { name: 'tool2' },
          ],
        },
      ];
      const result = collectUniqueToolNames(agentConfigs);
      expect(result).toEqual(['tool1', 'tool2']);
    });

    it('should collect unique tool names from multiple agents', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [
            { name: 'tool1' },
            { name: 'tool2' },
          ],
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: 'performance',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [
            { name: 'tool2' },
            { name: 'tool3' },
          ],
        },
      ];
      const result = collectUniqueToolNames(agentConfigs);
      expect(result).toEqual(['tool1', 'tool2', 'tool3']);
    });

    it('should remove duplicate tool names', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [
            { name: 'tool1' },
            { name: 'tool1' },
            { name: 'tool2' },
          ],
        },
      ];
      const result = collectUniqueToolNames(agentConfigs);
      expect(result).toEqual(['tool1', 'tool2']);
    });

    it('should sort tool names alphabetically', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [
            { name: 'zebra' },
            { name: 'apple' },
            { name: 'banana' },
          ],
        },
      ];
      const result = collectUniqueToolNames(agentConfigs);
      expect(result).toEqual(['apple', 'banana', 'zebra']);
    });

    it('should skip tools with empty name', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [
            { name: 'tool1' },
            { name: '' },
            { name: 'tool2' },
          ],
        },
      ];
      const result = collectUniqueToolNames(agentConfigs);
      expect(result).toEqual(['tool1', 'tool2']);
    });

    it('should skip tools with whitespace-only name', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [
            { name: 'tool1' },
            { name: '   ' },
            { name: '\t\n' },
            { name: 'tool2' },
          ],
        },
      ];
      const result = collectUniqueToolNames(agentConfigs);
      expect(result).toEqual(['tool1', 'tool2']);
    });

    it('should handle tools with undefined name', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [
            { name: 'tool1' },
            { name: undefined as unknown as string },
            { name: 'tool2' },
          ],
        },
      ];
      const result = collectUniqueToolNames(agentConfigs);
      expect(result).toEqual(['tool1', 'tool2']);
    });

    it('should handle mixed case tool names and preserve case', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [
            { name: 'ToolA' },
            { name: 'toolB' },
            { name: 'TOOLC' },
          ],
        },
      ];
      const result = collectUniqueToolNames(agentConfigs);
      expect(result).toEqual(['TOOLC', 'ToolA', 'toolB']);
    });

    it('should handle agents with and without tools', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [
            { name: 'tool1' },
          ],
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: 'performance',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-3',
          name: 'Agent 3',
          role: 'security',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [
            { name: 'tool2' },
          ],
        },
      ];
      const result = collectUniqueToolNames(agentConfigs);
      expect(result).toEqual(['tool1', 'tool2']);
    });
  });

  describe('collectUniqueAgentRoles', () => {
    it('should return empty array when agentConfigs is empty', () => {
      const agentConfigs: AgentConfig[] = [];
      const result = collectUniqueAgentRoles(agentConfigs);
      expect(result).toEqual([]);
    });

    it('should collect unique roles from single agent', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
      ];
      const result = collectUniqueAgentRoles(agentConfigs);
      expect(result).toEqual(['architect']);
    });

    it('should collect unique roles from multiple agents', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: 'performance',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-3',
          name: 'Agent 3',
          role: 'security',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
      ];
      const result = collectUniqueAgentRoles(agentConfigs);
      expect(result).toEqual(['architect', 'performance', 'security']);
    });

    it('should remove duplicate roles', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-3',
          name: 'Agent 3',
          role: 'performance',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
      ];
      const result = collectUniqueAgentRoles(agentConfigs);
      expect(result).toEqual(['architect', 'performance']);
    });

    it('should sort roles alphabetically', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'testing',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-3',
          name: 'Agent 3',
          role: 'datamodeling',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
      ];
      const result = collectUniqueAgentRoles(agentConfigs);
      expect(result).toEqual(['architect', 'datamodeling', 'testing']);
    });

    it('should skip agents with undefined role', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: undefined as unknown as AgentConfig['role'],
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-3',
          name: 'Agent 3',
          role: 'performance',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
      ];
      const result = collectUniqueAgentRoles(agentConfigs);
      expect(result).toEqual(['architect', 'performance']);
    });

    it('should handle all valid agent roles', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: 'security',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-3',
          name: 'Agent 3',
          role: 'performance',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-4',
          name: 'Agent 4',
          role: 'testing',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-5',
          name: 'Agent 5',
          role: 'generalist',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-6',
          name: 'Agent 6',
          role: 'kiss',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-7',
          name: 'Agent 7',
          role: 'datamodeling',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
      ];
      const result = collectUniqueAgentRoles(agentConfigs);
      expect(result).toEqual(['architect', 'datamodeling', 'generalist', 'kiss', 'performance', 'security', 'testing']);
    });
  });

  describe('buildTraceTags', () => {
    it('should return empty array when no clarification and no agents', () => {
      const agentConfigs: AgentConfig[] = [];
      const result = buildTraceTags(agentConfigs, false);
      expect(result).toEqual([]);
    });

    it('should include clarify tag when clarification requested', () => {
      const agentConfigs: AgentConfig[] = [];
      const result = buildTraceTags(agentConfigs, true);
      expect(result).toEqual([CLARIFY_TAG]);
    });

    it('should include tool names when agents have tools', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [
            { name: 'tool1' },
            { name: 'tool2' },
          ],
        },
      ];
      const result = buildTraceTags(agentConfigs, false);
      expect(result).toEqual(['tool1', 'tool2', 'architect']);
    });

    it('should include agent roles when agents have roles', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: 'performance',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
      ];
      const result = buildTraceTags(agentConfigs, false);
      expect(result).toEqual(['architect', 'performance']);
    });

    it('should include clarify tag, tool names, and agent roles', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [
            { name: 'tool1' },
          ],
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: 'performance',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [
            { name: 'tool2' },
          ],
        },
      ];
      const result = buildTraceTags(agentConfigs, true);
      expect(result).toEqual([CLARIFY_TAG, 'tool1', 'tool2', 'architect', 'performance']);
    });

    it('should sort tool names and roles alphabetically', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'testing',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [
            { name: 'ztool' },
            { name: 'atool' },
          ],
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
      ];
      const result = buildTraceTags(agentConfigs, false);
      expect(result).toEqual(['atool', 'ztool', 'architect', 'testing']);
    });

    it('should handle duplicate tool names across agents', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [
            { name: 'tool1' },
            { name: 'tool2' },
          ],
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: 'performance',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [
            { name: 'tool2' },
            { name: 'tool3' },
          ],
        },
      ];
      const result = buildTraceTags(agentConfigs, false);
      expect(result).toEqual(['tool1', 'tool2', 'tool3', 'architect', 'performance']);
    });

    it('should handle duplicate roles across agents', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
      ];
      const result = buildTraceTags(agentConfigs, false);
      expect(result).toEqual(['architect']);
    });

    it('should skip empty tool names', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          tools: [
            { name: 'tool1' },
            { name: '' },
            { name: 'tool2' },
          ],
        },
      ];
      const result = buildTraceTags(agentConfigs, false);
      expect(result).toEqual(['tool1', 'tool2', 'architect']);
    });

    it('should handle agents without tools or roles', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: undefined as unknown as AgentConfig['role'],
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
      ];
      const result = buildTraceTags(agentConfigs, false);
      expect(result).toEqual(['architect']);
    });

    it('should not include clarify tag when clarification not requested', () => {
      const agentConfigs: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
      ];
      const result = buildTraceTags(agentConfigs, false);
      expect(result).not.toContain(CLARIFY_TAG);
      expect(result).toEqual(['architect']);
    });
  });

  describe('formatTraceNameWithTimestamp', () => {
    it('should format trace name with prefix and timestamp', () => {
      const date = new Date(2024, 0, 15, 14, 30);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toBe('debate-command-20240115-1430');
    });

    it('should handle single-digit months', () => {
      const date = new Date(2024, 0, 15, 14, 30);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toMatch(/^debate-command-202401/);
    });

    it('should handle double-digit months', () => {
      const date = new Date(2024, 11, 15, 14, 30);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toMatch(/^debate-command-202412/);
    });

    it('should handle single-digit days', () => {
      const date = new Date(2024, 0, 5, 14, 30);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toMatch(/^debate-command-20240105-/);
    });

    it('should handle double-digit days', () => {
      const date = new Date(2024, 0, 31, 14, 30);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toMatch(/^debate-command-20240131-/);
    });

    it('should handle single-digit hours', () => {
      const date = new Date(2024, 0, 15, 5, 30);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toMatch(/-0530$/);
    });

    it('should handle double-digit hours', () => {
      const date = new Date(2024, 0, 15, 23, 30);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toMatch(/-2330$/);
    });

    it('should handle single-digit minutes', () => {
      const date = new Date(2024, 0, 15, 14, 5);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toMatch(/-1405$/);
    });

    it('should handle double-digit minutes', () => {
      const date = new Date(2024, 0, 15, 14, 59);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toMatch(/-1459$/);
    });

    it('should handle midnight (00:00)', () => {
      const date = new Date(2024, 0, 15, 0, 0);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toBe('debate-command-20240115-0000');
    });

    it('should handle end of day (23:59)', () => {
      const date = new Date(2024, 0, 15, 23, 59);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toBe('debate-command-20240115-2359');
    });

    it('should handle first day of month', () => {
      const date = new Date(2024, 0, 1, 14, 30);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toBe('debate-command-20240101-1430');
    });

    it('should handle last day of month', () => {
      const date = new Date(2024, 0, 31, 14, 30);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toBe('debate-command-20240131-1430');
    });

    it('should handle February 29 in leap year', () => {
      const date = new Date(2024, 1, 29, 14, 30);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toBe('debate-command-20240229-1430');
    });

    it('should handle December', () => {
      const date = new Date(2024, 11, 15, 14, 30);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toBe('debate-command-20241215-1430');
    });

    it('should handle year boundaries', () => {
      const date = new Date(2023, 11, 31, 23, 59);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toBe('debate-command-20231231-2359');
    });

    it('should handle year 2000', () => {
      const date = new Date(2000, 0, 1, 0, 0);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toBe('debate-command-20000101-0000');
    });

    it('should handle future years', () => {
      const date = new Date(2099, 11, 31, 23, 59);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toBe('debate-command-20991231-2359');
    });

    it('should produce consistent format for same date', () => {
      const date = new Date(2024, 5, 15, 10, 30);
      const result1 = formatTraceNameWithTimestamp(date);
      const result2 = formatTraceNameWithTimestamp(date);
      expect(result1).toBe(result2);
      expect(result1).toBe('debate-command-20240615-1030');
    });

    it('should handle all single-digit values', () => {
      const date = new Date(2024, 0, 1, 0, 0);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toBe('debate-command-20240101-0000');
    });

    it('should handle all double-digit values', () => {
      const date = new Date(2024, 11, 31, 23, 59);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toBe('debate-command-20241231-2359');
    });

    it('should always start with TRACE_NAME_PREFIX', () => {
      const date = new Date(2024, 0, 15, 14, 30);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toMatch(new RegExp(`^${TRACE_NAME_PREFIX}-`));
    });

    it('should include timestamp in correct format', () => {
      const date = new Date(2024, 0, 15, 14, 30);
      const result = formatTraceNameWithTimestamp(date);
      expect(result).toMatch(/^debate-command-\d{8}-\d{4}$/);
    });
  });
});
