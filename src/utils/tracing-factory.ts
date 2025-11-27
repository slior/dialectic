import { Langfuse } from 'langfuse';
import { TracingContext, TRACE_OPTIONS } from '../types/tracing.types';
import { DebateConfig } from '../types/debate.types';
import { Agent } from '../core/agent';
import { LLMProvider } from '../providers/llm-provider';
import { TracingLLMProvider } from './tracing-provider';
import { TracingDecoratorAgent } from './tracing-decorator-agent';
import { logWarning } from './console';

/**
 * Default Langfuse base URL if not specified in environment.
 */
const DEFAULT_LANGFUSE_BASE_URL = 'https://cloud.langfuse.com';

/**
 * Environment variable names for Langfuse configuration.
 */
const LANGFUSE_SECRET_KEY_ENV = 'LANGFUSE_SECRET_KEY';
const LANGFUSE_PUBLIC_KEY_ENV = 'LANGFUSE_PUBLIC_KEY';
const LANGFUSE_BASE_URL_ENV = 'LANGFUSE_BASE_URL';

/**
 * Validates that Langfuse environment variables are set and non-empty.
 * 
 * @throws {Error} If required environment variables are missing or empty.
 */
export function validateLangfuseConfig(): void {
  const secretKey = process.env[LANGFUSE_SECRET_KEY_ENV];
  const publicKey = process.env[LANGFUSE_PUBLIC_KEY_ENV];

  if (!secretKey || secretKey.trim() === '') {
    throw new Error(`${LANGFUSE_SECRET_KEY_ENV} is not set or is empty`);
  }

  if (!publicKey || publicKey.trim() === '') {
    throw new Error(`${LANGFUSE_PUBLIC_KEY_ENV} is not set or is empty`);
  }
}

/**
 * Creates a tracing context for the debate command if tracing is enabled.
 * 
 * @param debateConfig - The debate configuration.
 * @param debateId - The unique identifier for this debate.
 * @returns Tracing context if tracing is enabled and config is valid, undefined otherwise.
 */
export function createTracingContext(
  debateConfig: DebateConfig,
  debateId: string
): TracingContext | undefined {
  // Check if tracing is enabled
  if (debateConfig.trace !== TRACE_OPTIONS.LANGFUSE) {
    return undefined;
  }

  try {
    // Validate configuration
    validateLangfuseConfig();

    // Get configuration values
    const secretKey = process.env[LANGFUSE_SECRET_KEY_ENV]!;
    const publicKey = process.env[LANGFUSE_PUBLIC_KEY_ENV]!;
    const baseUrl = process.env[LANGFUSE_BASE_URL_ENV] || DEFAULT_LANGFUSE_BASE_URL;

    // Create Langfuse client
    const langfuse = new Langfuse({
      secretKey,
      publicKey,
      baseUrl,
    });

    // Create top-level trace for debate command
    // Note: debateId may be temporary initially, will be updated after debate state is created
    const trace = langfuse.trace({
      name: `debate-command`,
      metadata: {
        debateId,
      },
    });

    return {
      langfuse,
      trace,
      currentSpans: new Map(),
    };
  } catch (error: any) {
    // Log warning but don't throw - tracing failures should be non-blocking
    logWarning(`Failed to create Langfuse tracing context: ${error.message}`);
    return undefined;
  }
}

/**
 * Wraps an LLM provider with tracing if tracing context is provided.
 * 
 * @param provider - The LLM provider to wrap.
 * @param tracingContext - Optional tracing context. If undefined, returns original provider.
 * @returns Wrapped provider with tracing, or original provider if tracing is disabled.
 */
export function createTracingProvider(
  provider: LLMProvider,
  tracingContext?: TracingContext
): LLMProvider {
  if (!tracingContext) {
    return provider;
  }

  return new TracingLLMProvider(provider, tracingContext);
}

/**
 * Wraps an agent with tracing if tracing context is provided.
 * 
 * @param agent - The agent to wrap.
 * @param tracingContext - Optional tracing context. If undefined, returns original agent.
 * @returns Wrapped agent with tracing, or original agent if tracing is disabled.
 */
export function createTracingAgent(
  agent: Agent,
  tracingContext?: TracingContext
): Agent {
  if (!tracingContext) {
    return agent;
  }

  return new TracingDecoratorAgent(agent, tracingContext);
}
