import { LLM_PROVIDERS } from './agent.types';

export interface EvaluatorConfig {
  id: string;
  name: string;
  model: string;
  provider: typeof LLM_PROVIDERS.OPENAI | typeof LLM_PROVIDERS.OPENROUTER;
  systemPromptPath?: string;
  userPromptPath?: string;
  timeout?: number; // milliseconds (ignored for execution after refactor)
  enabled?: boolean; // default true
}

export interface EvaluatorRunOptions {
  verbose?: boolean;
}

export interface EvaluatorInputs {
  problem: string;
  clarificationsMarkdown: string; // fenced code blocks including NA entries
  finalSolution: string;
}

export interface ParsedEvaluation {
  evaluation?: {
    functional_completeness?: {
      score?: number;
      reasoning?: string;
    };
    non_functional?: {
      performance_scalability?: { score?: number; reasoning?: string };
      security?: { score?: number; reasoning?: string };
      maintainability_evolvability?: { score?: number; reasoning?: string };
      regulatory_compliance?: { score?: number; reasoning?: string };
      testability?: { score?: number; reasoning?: string };
    };
  };
  overall_summary?: {
    strengths?: string;
    weaknesses?: string;
    overall_score?: number;
  };
}

export interface AggregatedAverages {
  functional_completeness: number | null; // null => N/A
  performance_scalability: number | null;
  security: number | null;
  maintainability_evolvability: number | null;
  regulatory_compliance: number | null;
  testability: number | null;
  overall_score: number | null;
}

export interface AggregatedJsonOutput {
  evaluation: {
    functional_completeness: { average_score: number | null };
    non_functional: {
      performance_scalability: { average_score: number | null };
      security: { average_score: number | null };
      maintainability_evolvability: { average_score: number | null };
      regulatory_compliance: { average_score: number | null };
      testability: { average_score: number | null };
    };
  };
  overall_score: number | null;
  agents: Record<string, ParsedEvaluation>; // keyed by evaluator id
}

export function isEnabledEvaluator(cfg: EvaluatorConfig): boolean {
  return cfg.enabled !== false;
}

export function clampScoreToRange(val: unknown): number | undefined {
  if (typeof val !== 'number' || !Number.isFinite(val)) return undefined;
  if (val < 1) return 1;
  if (val > 10) return 10;
  return val;
}

export function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}


