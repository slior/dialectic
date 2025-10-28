import { LLMProvider } from '../providers/llm-provider';
import { createProvider } from '../providers/provider-factory';
import { writeStderr } from '../cli/index';
import { EvaluatorConfig, EvaluatorInputs } from '../types/eval.types';

export interface EvaluatorResult {
  id: string;
  rawText: string;
  latencyMs: number;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

export class EvaluatorAgent {
  readonly id: string;
  readonly name: string;
  readonly model: string;
  readonly provider: LLMProvider;
  readonly resolvedSystemPrompt: string;
  readonly resolvedUserPromptTemplate: string;

  // Fixed low temperature for determinism
  private static readonly FIXED_TEMPERATURE = 0.1;

  constructor(params: {
    config: EvaluatorConfig;
    provider: LLMProvider;
    resolvedSystemPrompt: string;
    resolvedUserPromptTemplate: string;
  }) {
    this.id = params.config.id;
    this.name = params.config.name;
    this.model = params.config.model;
    this.provider = params.provider;
    this.resolvedSystemPrompt = params.resolvedSystemPrompt;
    this.resolvedUserPromptTemplate = params.resolvedUserPromptTemplate;
  }

  static fromConfig(cfg: EvaluatorConfig, resolvedSystemPrompt: string, resolvedUserPromptTemplate: string): EvaluatorAgent {
    const provider = createProvider(cfg.provider);
    return new EvaluatorAgent({ config: cfg, provider, resolvedSystemPrompt, resolvedUserPromptTemplate });
  }

  private renderUserPrompt(inputs: EvaluatorInputs): string {
    return this.resolvedUserPromptTemplate
      .replace('{problem}', inputs.problem)
      .replace('{clarifications}', inputs.clarificationsMarkdown)
      .replace('{final_solution}', inputs.finalSolution);
  }

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
      const res = await llmCall as any;
      const latencyMs = Date.now() - started;
      return {
        id: this.id,
        rawText: res.text ?? '',
        latencyMs,
        usage: res.usage,
      };
    } catch (err: any) {
      writeStderr(`[${this.id}] Evaluation failed: ${err?.message ?? 'unknown error'}\n`);
      throw err;
    }
  }
}


