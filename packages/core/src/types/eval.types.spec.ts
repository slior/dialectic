import {
  isEnabledEvaluator,
  clampScoreToRange,
  round2,
  EvaluatorConfig,
} from './eval.types';
import { LLM_PROVIDERS } from './agent.types';

// Test constants
const EVALUATOR_ID_1 = 'eval-1';
const EVALUATOR_NAME_1 = 'Evaluator 1';
const EVALUATOR_MODEL_GPT4 = 'gpt-4';
const EVALUATOR_PROVIDER_OPENAI = LLM_PROVIDERS.OPENAI;
const EVALUATOR_PROVIDER_OPENROUTER = LLM_PROVIDERS.OPENROUTER;

describe('eval.types', () => {
  describe('isEnabledEvaluator', () => {
    it('should return true when enabled is true', () => {
      const config: EvaluatorConfig = {
        id: EVALUATOR_ID_1,
        name: EVALUATOR_NAME_1,
        model: EVALUATOR_MODEL_GPT4,
        provider: EVALUATOR_PROVIDER_OPENAI,
        enabled: true,
      };

      expect(isEnabledEvaluator(config)).toBe(true);
    });

    it('should return false when enabled is false', () => {
      const config: EvaluatorConfig = {
        id: EVALUATOR_ID_1,
        name: EVALUATOR_NAME_1,
        model: EVALUATOR_MODEL_GPT4,
        provider: EVALUATOR_PROVIDER_OPENAI,
        enabled: false,
      };

      expect(isEnabledEvaluator(config)).toBe(false);
    });

    it('should return true when enabled is undefined (default behavior)', () => {
      const config: EvaluatorConfig = {
        id: EVALUATOR_ID_1,
        name: EVALUATOR_NAME_1,
        model: EVALUATOR_MODEL_GPT4,
        provider: EVALUATOR_PROVIDER_OPENAI,
      };

      expect(isEnabledEvaluator(config)).toBe(true);
    });

    it('should return true when enabled property is missing', () => {
      const config = {
        id: EVALUATOR_ID_1,
        name: EVALUATOR_NAME_1,
        model: EVALUATOR_MODEL_GPT4,
        provider: EVALUATOR_PROVIDER_OPENAI,
      } as EvaluatorConfig;

      expect(isEnabledEvaluator(config)).toBe(true);
    });

    it('should work with OpenRouter provider', () => {
      const config: EvaluatorConfig = {
        id: EVALUATOR_ID_1,
        name: EVALUATOR_NAME_1,
        model: EVALUATOR_MODEL_GPT4,
        provider: EVALUATOR_PROVIDER_OPENROUTER,
        enabled: true,
      };

      expect(isEnabledEvaluator(config)).toBe(true);
    });
  });

  describe('clampScoreToRange', () => {
    it('should return the value when it is within valid range (1-10)', () => {
      expect(clampScoreToRange(1)).toBe(1);
      expect(clampScoreToRange(5)).toBe(5);
      expect(clampScoreToRange(10)).toBe(10);
      expect(clampScoreToRange(7.5)).toBe(7.5);
    });

    it('should clamp values below 1 to 1', () => {
      expect(clampScoreToRange(0)).toBe(1);
      expect(clampScoreToRange(-1)).toBe(1);
      expect(clampScoreToRange(-100)).toBe(1);
      expect(clampScoreToRange(0.5)).toBe(1);
      expect(clampScoreToRange(0.999)).toBe(1);
    });

    it('should clamp values above 10 to 10', () => {
      expect(clampScoreToRange(11)).toBe(10);
      expect(clampScoreToRange(100)).toBe(10);
      expect(clampScoreToRange(10.1)).toBe(10);
      expect(clampScoreToRange(10.999)).toBe(10);
    });

    it('should return undefined for non-number types', () => {
      expect(clampScoreToRange('5')).toBeUndefined();
      expect(clampScoreToRange('invalid')).toBeUndefined();
      expect(clampScoreToRange(null)).toBeUndefined();
      expect(clampScoreToRange(undefined)).toBeUndefined();
      expect(clampScoreToRange({})).toBeUndefined();
      expect(clampScoreToRange([])).toBeUndefined();
      expect(clampScoreToRange(true)).toBeUndefined();
      expect(clampScoreToRange(false)).toBeUndefined();
    });

    it('should return undefined for NaN', () => {
      expect(clampScoreToRange(NaN)).toBeUndefined();
    });

    it('should return undefined for Infinity', () => {
      expect(clampScoreToRange(Infinity)).toBeUndefined();
      expect(clampScoreToRange(-Infinity)).toBeUndefined();
    });

    it('should return undefined for non-finite numbers', () => {
      expect(clampScoreToRange(Number.POSITIVE_INFINITY)).toBeUndefined();
      expect(clampScoreToRange(Number.NEGATIVE_INFINITY)).toBeUndefined();
    });

    it('should handle boundary values correctly', () => {
      expect(clampScoreToRange(1)).toBe(1);
      expect(clampScoreToRange(10)).toBe(10);
      expect(clampScoreToRange(0.999999999)).toBe(1);
      expect(clampScoreToRange(10.000000001)).toBe(10);
    });
  });

  describe('round2', () => {
    it('should round to 2 decimal places', () => {
      expect(round2(1.234)).toBe(1.23);
      expect(round2(1.235)).toBe(1.24);
      expect(round2(1.236)).toBe(1.24);
      expect(round2(5.555)).toBe(5.56);
      expect(round2(10.999)).toBe(11);
    });

    it('should handle integers', () => {
      expect(round2(0)).toBe(0);
      expect(round2(1)).toBe(1);
      expect(round2(10)).toBe(10);
      expect(round2(100)).toBe(100);
    });

    it('should handle numbers with fewer than 2 decimal places', () => {
      expect(round2(1.2)).toBe(1.2);
      expect(round2(1.23)).toBe(1.23);
      expect(round2(5.5)).toBe(5.5);
    });

    it('should handle numbers with more than 2 decimal places', () => {
      expect(round2(1.2345)).toBe(1.23);
      expect(round2(1.2349)).toBe(1.23);
      expect(round2(1.2351)).toBe(1.24);
      expect(round2(1.9999)).toBe(2);
    });

    it('should handle rounding up correctly', () => {
      expect(round2(1.225)).toBe(1.23);
      expect(round2(1.235)).toBe(1.24);
      expect(round2(1.245)).toBe(1.25);
    });

    it('should handle rounding down correctly', () => {
      expect(round2(1.224)).toBe(1.22);
      expect(round2(1.234)).toBe(1.23);
      expect(round2(1.244)).toBe(1.24);
    });

    it('should handle floating point precision issues', () => {
      // Test cases that might have floating point precision issues
      expect(round2(0.1 + 0.2)).toBe(0.3);
      expect(round2(1.005)).toBe(1.01);
      expect(round2(2.675)).toBe(2.68);
    });

    it('should handle negative numbers', () => {
      expect(round2(-1.234)).toBe(-1.23);
      expect(round2(-1.235)).toBe(-1.23); // Math.round rounds -123.5 to -123 (towards zero)
      expect(round2(-5.555)).toBe(-5.55); // Math.round rounds -555.5 to -555 (towards zero)
    });

    it('should handle very small numbers', () => {
      expect(round2(0.001)).toBe(0);
      expect(round2(0.004)).toBe(0);
      expect(round2(0.005)).toBe(0.01);
      expect(round2(0.009)).toBe(0.01);
    });

    it('should handle very large numbers', () => {
      expect(round2(1000.123)).toBe(1000.12);
      expect(round2(1000.125)).toBe(1000.13);
      expect(round2(999999.999)).toBe(1000000);
    });

    it('should use Number.EPSILON for precision', () => {
      // This test verifies that the function uses Number.EPSILON
      // to handle floating point precision issues
      const result = round2(1.005);
      expect(result).toBe(1.01);
    });
  });
});
