import type { ChatRole } from '../providers/llm-provider';

/**
 * Tool schema matching OpenAI function calling format.
 * Used to define available tools for LLM agents.
 */
export interface ToolSchema {
  /** Tool name (must be unique within a registry). */
  name: string;
  /** Human-readable description of what the tool does. */
  description: string;
  /** JSON Schema definition of tool parameters. */
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      [key: string]: any;
    }>;
    required?: string[];
  };
}

/**
 * Represents a tool call request from an LLM.
 * Matches OpenAI's function calling response format.
 */
export interface ToolCall {
  /** Unique identifier for this tool call (from LLM). */
  id: string;
  /** Name of the tool to call. */
  name: string;
  /** JSON string of arguments to pass to the tool. */
  arguments: string;
}

/**
 * Represents the result of executing a tool.
 * Matches OpenAI's expected format for tool results.
 */
export interface ToolResult {
  /** ID of the tool call this result corresponds to. */
  tool_call_id: string;
  /** Role identifier (always "tool" for tool results). */
  role: ChatRole;
  /** JSON string containing status and result/error. */
  content: string;
}

/**
 * Metadata about tool calls made during an agent contribution.
 * Stored in contribution metadata for persistence and analysis.
 */
export interface ToolCallMetadata {
  /** Array of tool calls made during this contribution. */
  toolCalls?: ToolCall[];
  /** Array of tool results received during this contribution. */
  toolResults?: ToolResult[];
  /** Number of tool call iterations performed. */
  toolCallIterations?: number;
}

/**
 * Tool result status values.
 */
export const TOOL_RESULT_STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
} as const;

export type ToolResultStatus = (typeof TOOL_RESULT_STATUS)[keyof typeof TOOL_RESULT_STATUS];

