import { ToolSchema, ToolResult, TOOL_RESULT_STATUS, ToolResultStatus } from '../types/tool.types';
import { DebateContext, DebateState } from '../types/debate.types';
import { CHAT_ROLES } from '../providers/llm-provider';

/**
 * Interface for tool implementations.
 * Tools are synchronous functions that execute and return results.
 */
export interface ToolImplementation {
  /** Tool name (must match schema name). */
  name: string;
  /** Tool schema matching OpenAI function calling format. */
  schema: ToolSchema;
  /**
   * Execute the tool with given arguments and optional context.
   * 
   * @param args - Parsed arguments from tool call (object).
   * @param context - Optional debate context (needed for tools like context search).
   * @param state - Optional debate state providing access to full debate rounds (takes precedence over context.history).
   * @returns JSON string with status and result/error: `{"status":"success","result":{...}}` or `{"status":"error","error":"..."}`
   */
  execute(args: any, context?: DebateContext, state?: DebateState): string;
}

/**
 * Creates a JSON string for a tool error result.
 * This is a convenience function for tools to return error responses in the standard format.
 *
 * @param errorMessage - The error message describing what went wrong.
 * @returns JSON string with status "error" and the error message.
 */
export function createToolErrorJson(errorMessage: string): string {
  return JSON.stringify({
    status: TOOL_RESULT_STATUS.ERROR,
    error: errorMessage,
  });
}

/**
 * Creates a JSON string for a tool success result.
 * This is a convenience function for tools to return success responses in the standard format.
 *
 * @param result - The result data to include in the success response.
 * @returns JSON string with status "success" and the result data.
 */
export function createToolSuccessJson(result: any): string {
  return JSON.stringify({
    status: TOOL_RESULT_STATUS.SUCCESS,
    result,
  });
}

/**
 * Creates a ToolResult object in OpenAI format.
 * 
 * @param callId - The tool call ID this result corresponds to.
 * @param status - Result status ("success" or "error").
 * @param result - Optional result data (for success).
 * @param error - Optional error message (for error).
 * @returns ToolResult object with properly formatted content.
 */
export function createToolResult(
  callId: string,
  status: ToolResultStatus,
  result?: any,
  error?: string
): ToolResult {
  const content: any = { status };
  if (status === TOOL_RESULT_STATUS.SUCCESS && result !== undefined) {
    content.result = result;
  } else if (status === TOOL_RESULT_STATUS.ERROR && error !== undefined) {
    content.error = error;
  }

  return {
    tool_call_id: callId,
    role: CHAT_ROLES.TOOL,
    content: JSON.stringify(content),
  };
}

