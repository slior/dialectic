import { LLMProvider, CompletionResponse } from '../providers/llm-provider';
import { createProvider } from '../providers/provider-factory';
import { writeStderr } from '../utils/console';
import { EvaluatorConfig, EvaluatorInputs } from '../types/eval.types';

export interface EvaluatorResult {
  id: string;
  rawText: string;
  latencyMs: number;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

/**
 * EvaluatorAgent
 *
 * This class represents an evaluator agent that uses a language model (LLM) provider to evaluate a software solution or debate.
 * It encapsulates the agent's configuration, associated model, prompt templates, and low-level logic to perform a deterministic evaluation.
 *
 * Usage:
 *   - Instantiate via static fromConfig() or directly via the constructor.
 *   - Call evaluate(inputs) to perform evaluation and receive response/result details.
 */
export class EvaluatorAgent {
  /** Unique identifier for the evaluator agent */
  readonly id: string;
  /** Human-readable agent name */
  readonly name: string;
  /** Model name used for the LLM invocation */
  readonly model: string;
  /** LLMProvider instance (e.g., OpenAI, Azure, etc.) */
  readonly provider: LLMProvider;
  /** Resolved system prompt string used for the LLM */
  readonly resolvedSystemPrompt: string;
  /** Resolved user prompt template (with placeholders) for evaluation */
  readonly resolvedUserPromptTemplate: string;

  /**
   * Fixed temperature value for model calls to ensure deterministic evaluation.
   * This is set to a low value (0.1) to reduce randomness/variance in LLM output.
   */
  private static readonly FIXED_TEMPERATURE = 0.1;

  /**
   * Constructs an EvaluatorAgent instance.
   *
   * @param config - EvaluatorConfig object defining agent identity and settings.
   * @param provider - Instantiated LLMProvider for this agent.
   * @param resolvedSystemPrompt - The system prompt string for agent context.
   * @param resolvedUserPromptTemplate - The user prompt template with placeholders.
   */
  constructor(
    config: EvaluatorConfig,
    provider: LLMProvider,
    resolvedSystemPrompt: string,
    resolvedUserPromptTemplate: string
  ) {
    this.id = config.id;
    this.name = config.name;
    this.model = config.model;
    this.provider = provider;
    this.resolvedSystemPrompt = resolvedSystemPrompt;
    this.resolvedUserPromptTemplate = resolvedUserPromptTemplate;
  }

  /**
   * Creates an EvaluatorAgent instance from an EvaluatorConfig, resolving the provider.
   *
   * @param cfg - The EvaluatorConfig object.
   * @param resolvedSystemPrompt - The preloaded system prompt.
   * @param resolvedUserPromptTemplate - The preloaded user prompt template.
   * @returns A new EvaluatorAgent instance.
   */
  static fromConfig(
    cfg: EvaluatorConfig,
    resolvedSystemPrompt: string,
    resolvedUserPromptTemplate: string
  ): EvaluatorAgent {
    const provider = createProvider(cfg.provider);
    return new EvaluatorAgent(cfg, provider, resolvedSystemPrompt, resolvedUserPromptTemplate);
  }

  /**
   * Renders the user prompt by replacing placeholders with actual inputs.
   *
   * @param inputs - The evaluation inputs (problem, clarifications, and solution).
   * @returns The rendered user prompt string.
   */
  private renderUserPrompt(inputs: EvaluatorInputs): string {
    return this.resolvedUserPromptTemplate
      .replace('{problem}', inputs.problem)
      .replace('{clarifications}', inputs.clarificationsMarkdown)
      .replace('{final_solution}', inputs.finalSolution);
  }

  /**
   * Performs the evaluation using the underlying LLMProvider.
   *
   * @param inputs - The inputs required for evaluation (problem, clarifications, finalSolution).
   * @returns The evaluation result, including raw text, latency, and optional usage data.
   * @throws An error if LLM call fails.
   */
  async evaluate(inputs: EvaluatorInputs): Promise<EvaluatorResult> {
    const userPrompt = this.renderUserPrompt(inputs);
    const systemPrompt = this.resolvedSystemPrompt;
    const started = Date.now();

    const llmCall = this.provider.complete({
      model: this.model,
      temperature: EvaluatorAgent.FIXED_TEMPERATURE,
      systemPrompt,
      userPrompt,
    });

    try {
      const res: CompletionResponse = await llmCall;
      const latencyMs = Date.now() - started;
      return {
        id: this.id,
        rawText: res.text,
        latencyMs,
        ...(res.usage !== undefined && { usage: res.usage }),
      };
    } catch (err: any) {
      writeStderr(`[${this.id}] Evaluation failed: ${err?.message ?? 'unknown error'}\n`);
      throw err;
    }
  }
}


