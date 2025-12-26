import { createProvider, OpenAIProvider, OpenRouterProvider, EXIT_CONFIG_ERROR } from '@dialectic/core';

// Mock the provider classes
jest.mock('./openai-provider');
jest.mock('./openrouter-provider');

// Test constants
const TEST_OPENAI_API_KEY = 'test-openai-key';
const TEST_OPENROUTER_API_KEY = 'test-openrouter-key';
const PROVIDER_TYPE_OPENAI = 'openai';
const PROVIDER_TYPE_OPENROUTER = 'openrouter';
const ENV_VAR_OPENAI_API_KEY = 'OPENAI_API_KEY';
const ENV_VAR_OPENROUTER_API_KEY = 'OPENROUTER_API_KEY';
const ERROR_MESSAGE_OPENAI_KEY_NOT_SET = 'OPENAI_API_KEY is not set';
const ERROR_MESSAGE_OPENROUTER_KEY_NOT_SET = 'OPENROUTER_API_KEY is not set';
const ERROR_MESSAGE_UNSUPPORTED_PROVIDER_PREFIX = 'Unsupported provider type:';
const ERROR_MESSAGE_SUPPORTED_TYPES_SUFFIX = 'Supported types are: openai, openrouter';

/**
 * Helper function to test error handling for createProvider calls.
 * Verifies that the function throws an error with the expected message and code.
 *
 * @param providerType - The provider type to test (can be string or undefined).
 * @param expectedMessage - The expected error message.
 */
function expectProviderError(providerType: string | undefined, expectedMessage: string): void {
  expect(() => createProvider(providerType as any)).toThrow();
  
  try {
    createProvider(providerType as any);
  } catch (error: any) {
    expect(error.message).toBe(expectedMessage);
    expect(error.code).toBe(EXIT_CONFIG_ERROR);
  }
}

describe('Provider Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createProvider', () => {
    it('should create OpenAI provider with valid API key', () => {
      process.env[ENV_VAR_OPENAI_API_KEY] = TEST_OPENAI_API_KEY;
      
      const provider = createProvider(PROVIDER_TYPE_OPENAI);
      
      expect(OpenAIProvider).toHaveBeenCalledWith(TEST_OPENAI_API_KEY);
      expect(provider).toBeDefined();
    });

    it('should create OpenRouter provider with valid API key', () => {
      process.env[ENV_VAR_OPENROUTER_API_KEY] = TEST_OPENROUTER_API_KEY;
      
      const provider = createProvider(PROVIDER_TYPE_OPENROUTER);
      
      expect(OpenRouterProvider).toHaveBeenCalledWith(TEST_OPENROUTER_API_KEY);
      expect(provider).toBeDefined();
    });

    it('should throw error when OpenAI API key is missing', () => {
      delete process.env[ENV_VAR_OPENAI_API_KEY];
      
      expectProviderError(PROVIDER_TYPE_OPENAI, ERROR_MESSAGE_OPENAI_KEY_NOT_SET);
    });

    it('should throw error when OpenRouter API key is missing', () => {
      delete process.env[ENV_VAR_OPENROUTER_API_KEY];
      
      expectProviderError(PROVIDER_TYPE_OPENROUTER, ERROR_MESSAGE_OPENROUTER_KEY_NOT_SET);
    });

    it('should throw error for unsupported provider type', () => {
      const unsupportedProvider = 'unsupported';
      const expectedMessage = `${ERROR_MESSAGE_UNSUPPORTED_PROVIDER_PREFIX} ${unsupportedProvider}. ${ERROR_MESSAGE_SUPPORTED_TYPES_SUFFIX}`;
      expectProviderError(unsupportedProvider, expectedMessage);
    });

    it('should throw error for empty provider type', () => {
      const emptyProvider = '';
      const expectedMessage = `${ERROR_MESSAGE_UNSUPPORTED_PROVIDER_PREFIX} . ${ERROR_MESSAGE_SUPPORTED_TYPES_SUFFIX}`;
      expectProviderError(emptyProvider, expectedMessage);
    });

    it('should handle undefined provider type', () => {
      const expectedMessage = `${ERROR_MESSAGE_UNSUPPORTED_PROVIDER_PREFIX} undefined. ${ERROR_MESSAGE_SUPPORTED_TYPES_SUFFIX}`;
      expectProviderError(undefined, expectedMessage);
    });

    it('should handle case sensitivity correctly', () => {
      process.env[ENV_VAR_OPENAI_API_KEY] = TEST_OPENAI_API_KEY;
      
      // Should work with exact case
      expect(() => createProvider(PROVIDER_TYPE_OPENAI)).not.toThrow();
      
      // Should fail with different case
      expect(() => createProvider('OpenAI')).toThrow();
      expect(() => createProvider('OPENAI')).toThrow();
    });

    it('should handle whitespace in provider type', () => {
      process.env[ENV_VAR_OPENAI_API_KEY] = TEST_OPENAI_API_KEY;
      
      const providerWithWhitespace = ' openai ';
      const expectedMessage = `${ERROR_MESSAGE_UNSUPPORTED_PROVIDER_PREFIX} ${providerWithWhitespace}. ${ERROR_MESSAGE_SUPPORTED_TYPES_SUFFIX}`;
      expectProviderError(providerWithWhitespace, expectedMessage);
    });

    it('should work with empty string API keys', () => {
      process.env[ENV_VAR_OPENAI_API_KEY] = '';
      
      expectProviderError(PROVIDER_TYPE_OPENAI, ERROR_MESSAGE_OPENAI_KEY_NOT_SET);
    });

    it('should work with whitespace-only API keys', () => {
      process.env[ENV_VAR_OPENAI_API_KEY] = '   ';
      
      expectProviderError(PROVIDER_TYPE_OPENAI, ERROR_MESSAGE_OPENAI_KEY_NOT_SET);
    });
  });
});

