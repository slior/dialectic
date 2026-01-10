import { AgentConfig } from '../types/agent.types';
import { TracingContext } from '../types/tracing.types';

import { formatTimestampForTraceName } from './id';

/**
 * Tag name for clarification requests in Langfuse traces.
 */
export const CLARIFY_TAG = 'clarify';

/**
 * Trace name prefix for debate command traces.
 */
export const TRACE_NAME_PREFIX = 'debate-command';

/**
 * Returns the appropriate parent for creating spans or generations.
 * Uses the current span for the specified agent if available, otherwise falls back to the trace.
 * 
 * This ensures that spans and generations are properly nested within the
 * active span hierarchy, providing correct parent-child relationships in Langfuse.
 * 
 * The agentId parameter allows concurrent agents to maintain separate span hierarchies
 * without interfering with each other. If agentId is undefined, returns the trace directly
 * (useful for judge or other non-agent providers).
 * 
 * @param tracingContext - The tracing context containing the trace and current spans map.
 * @param agentId - Optional ID of the agent requesting the span parent (for concurrent execution).
 * @returns The parent object (span or trace) that can be used to create child spans/generations.
 */
export function getSpanParent(tracingContext: TracingContext, agentId?: string): ReturnType<TracingContext['trace']['span']> | TracingContext['trace'] {
  if (!agentId) {
    return tracingContext.trace;
  }
  return tracingContext.currentSpans.get(agentId) ?? tracingContext.trace;
}

/**
 * Collects unique tool names from all agent configurations.
 * 
 * @param agentConfigs - Array of agent configurations.
 * @returns Array of unique tool names, sorted alphabetically.
 */
export function collectUniqueToolNames(agentConfigs: AgentConfig[]): string[] {
  const toolNames = new Set<string>();
  
  for (const agentConfig of agentConfigs) {
    if (agentConfig.tools && agentConfig.tools.length > 0) {
      for (const tool of agentConfig.tools) {
        if (tool.name && tool.name.trim() !== '') {
          toolNames.add(tool.name);
        }
      }
    }
  }
  
  return Array.from(toolNames).sort();
}

/**
 * Collects unique agent roles from all agent configurations.
 * 
 * @param agentConfigs - Array of agent configurations.
 * @returns Array of unique agent roles, sorted alphabetically.
 */
export function collectUniqueAgentRoles(agentConfigs: AgentConfig[]): string[] {
  const roles = new Set<string>();
  
  for (const agentConfig of agentConfigs) {
    if (agentConfig.role) {
      roles.add(agentConfig.role);
    }
  }
  
  return Array.from(roles).sort();
}

/**
 * Builds an array of tags for the Langfuse trace.
 * Includes 'clarify' tag if clarification requested, plus tool names and agent roles.
 * 
 * @param agentConfigs - Array of agent configurations.
 * @param clarificationRequested - Whether clarification phase was requested.
 * @returns Array of tag strings.
 */
export function buildTraceTags(agentConfigs: AgentConfig[], clarificationRequested: boolean): string[] {
  const tags: string[] = [];
  
  if (clarificationRequested) {
    tags.push(CLARIFY_TAG);
  }
  
  const toolNames = collectUniqueToolNames(agentConfigs);
  tags.push(...toolNames);
  
  const agentRoles = collectUniqueAgentRoles(agentConfigs);
  tags.push(...agentRoles);
  
  return tags;
}

/**
 * Formats the trace name with timestamp prefix.
 * 
 * @param date - The date to use for timestamp formatting.
 * @returns Formatted trace name in format: debate-command-YYYYMMDD-hhmm
 */
export function formatTraceNameWithTimestamp(date: Date): string {
  const timestamp = formatTimestampForTraceName(date);
  return `${TRACE_NAME_PREFIX}-${timestamp}`;
}

