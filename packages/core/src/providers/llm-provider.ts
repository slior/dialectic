import { ToolSchema, ToolCall } from '../types/tool.types';

/**
 * Chat message roles for function calling.
 */
export const CHAT_ROLES = {
  SYSTEM: 'system',
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL: 'tool',
} as const;

export type ChatRole = (typeof CHAT_ROLES)[keyof typeof CHAT_ROLES];

/**
 * Message format for function calling.
 */
export interface ChatMessage {
  role: ChatRole;
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

export interface CompletionRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens?: number;
  stopSequences?: string[];
  tools?: ToolSchema[]; /** Optional array of tool schemas for function calling. */
  messages?: ChatMessage[]; /** Optional messages array for function calling (takes precedence over systemPrompt/userPrompt when provided). */
}

export interface CompletionUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface CompletionResponse {
  text: string;
  usage?: CompletionUsage;
  toolCalls?: ToolCall[]; /** Optional array of tool calls from the LLM response. */
}

export interface LLMProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream?(request: CompletionRequest): AsyncIterator<string>;
  generateEmbedding?(text: string): Promise<number[]>;
}