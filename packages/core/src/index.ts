// Core classes
export { DebateOrchestrator } from './core/orchestrator';
export { StateManager } from './core/state-manager';
export { JudgeAgent } from './core/judge';
export { Agent, AgentLogger } from './core/agent';
export { RoleBasedAgent } from './agents/role-based-agent';
export { collectClarifications } from './core/clarifications';

// Providers
export { createProvider } from './providers/provider-factory';
export { LLMProvider, CompletionResponse, CompletionUsage, CompletionRequest, ChatMessage, ChatRole, CHAT_ROLES } from './providers/llm-provider';
export { OpenAIProvider } from './providers/openai-provider';
export { OpenRouterProvider } from './providers/openrouter-provider';

// Tools
export { ToolRegistry, createBaseRegistry } from './tools/tool-registry';
export { ToolImplementation, createToolErrorJson, createToolSuccessJson, createToolResult } from './tools/tool-implementation';
export { ContextSearchTool } from './tools/context-search-tool';
export { buildToolRegistry } from './utils/tool-registry-builder';

// Types - re-export all
export * from './types/debate.types';
export * from './types/agent.types';
export {
  // Re-export only SystemConfig, avoid SummarizationConfig collision
  SystemConfig,
  DEFAULT_SUMMARIZATION_ENABLED,
  DEFAULT_SUMMARIZATION_THRESHOLD,
  DEFAULT_SUMMARIZATION_MAX_LENGTH,
  DEFAULT_SUMMARIZATION_METHOD,
} from './types/config.types';
export * from './types/tool.types';
export * from './types/tracing.types';
export * from './types/eval.types';

// Utilities
export { resolvePrompt, PromptResolveResult, readBuiltInPrompt } from './utils/prompt-loader';
export { loadEnvironmentFile } from './utils/env-loader';
export { createValidationError, writeFileWithDirectories, numOrUndefined, averageOrNull, readJsonFile } from './utils/common';
export { isFulfilled } from './utils/promise';
export { generateDebateId } from './utils/id';
export { generateDebateReport } from './utils/report-generator';
export { enhanceProblemWithContext } from './utils/context-enhancer';
export { formatHistory, formatContextSection, prependContext, formatClarifications } from './utils/context-formatter';
export { ContextSummarizer, LengthBasedSummarizer } from './utils/context-summarizer';
export { EXIT_GENERAL_ERROR, EXIT_INVALID_ARGS, EXIT_CONFIG_ERROR, EXIT_PROVIDER_ERROR } from './utils/exit-codes';
export { logInfo, logSuccess, logWarning, writeStderr, MessageType, MESSAGE_ICONS } from './utils/console';
export { Logger } from './utils/logger';

// Tracing utilities
export { 
  validateLangfuseConfig, 
  createTracingContext, 
  createTracingProvider, 
  createTracingAgent 
} from './utils/tracing-factory';
export { buildTraceTags, formatTraceNameWithTimestamp } from './utils/tracing-utils';
export { TracingLLMProvider } from './utils/tracing-provider';
export { TracingDecoratorAgent } from './utils/tracing-decorator-agent';

// Evaluator
export { EvaluatorAgent } from './eval/evaluator-agent';

// Agent prompts (for advanced use)
export {
  INSTRUCTION_TYPES,
  InstructionType,
  REQUIREMENTS_COVERAGE_SECTION_TITLE,
  getSharedSystemInstructions,
  getSharedProposalInstructions,
  getSharedCritiqueInstructions,
  getSharedRefinementInstructions,
  getSharedSummarizationInstructions,
  getSharedClarificationInstructions,
  appendSharedInstructions,
} from './agents/prompts/shared';
export { getPromptsForRole } from './agents/prompts';
