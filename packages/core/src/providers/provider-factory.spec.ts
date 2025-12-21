import { createProvider, OpenAIProvider, OpenRouterProvider, EXIT_CONFIG_ERROR } from '@dialectic/core';

// Mock the provider classes
jest.mock('./openai-provider');
jest.mock('./openrouter-provider');

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
      process.env.OPENAI_API_KEY = 'test-openai-key';
      
      const provider = createProvider('openai');
      
      expect(OpenAIProvider).toHaveBeenCalledWith('test-openai-key');
      expect(provider).toBeDefined();
    });

    it('should create OpenRouter provider with valid API key', () => {
      process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
      
      const provider = createProvider('openrouter');
      
      expect(OpenRouterProvider).toHaveBeenCalledWith('test-openrouter-key');
      expect(provider).toBeDefined();
    });

    it('should throw error when OpenAI API key is missing', () => {
      delete process.env.OPENAI_API_KEY;
      
      expect(() => createProvider('openai')).toThrow();
      
      try {
        createProvider('openai');
      } catch (error: any) {
        expect(error.message).toBe('OPENAI_API_KEY is not set');
        expect(error.code).toBe(EXIT_CONFIG_ERROR);
      }
    });

    it('should throw error when OpenRouter API key is missing', () => {
      delete process.env.OPENROUTER_API_KEY;
      
      expect(() => createProvider('openrouter')).toThrow();
      
      try {
        createProvider('openrouter');
      } catch (error: any) {
        expect(error.message).toBe('OPENROUTER_API_KEY is not set');
        expect(error.code).toBe(EXIT_CONFIG_ERROR);
      }
    });

    it('should throw error for unsupported provider type', () => {
      expect(() => createProvider('unsupported')).toThrow();
      
      try {
        createProvider('unsupported');
      } catch (error: any) {
        expect(error.message).toBe('Unsupported provider type: unsupported. Supported types are: openai, openrouter');
        expect(error.code).toBe(EXIT_CONFIG_ERROR);
      }
    });

    it('should throw error for empty provider type', () => {
      expect(() => createProvider('')).toThrow();
      
      try {
        createProvider('');
      } catch (error: any) {
        expect(error.message).toBe('Unsupported provider type: . Supported types are: openai, openrouter');
        expect(error.code).toBe(EXIT_CONFIG_ERROR);
      }
    });

    it('should handle undefined provider type', () => {
      expect(() => createProvider(undefined as any)).toThrow();
      
      try {
        createProvider(undefined as any);
      } catch (error: any) {
        expect(error.message).toBe('Unsupported provider type: undefined. Supported types are: openai, openrouter');
        expect(error.code).toBe(EXIT_CONFIG_ERROR);
      }
    });

    it('should handle case sensitivity correctly', () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      
      // Should work with exact case
      expect(() => createProvider('openai')).not.toThrow();
      
      // Should fail with different case
      expect(() => createProvider('OpenAI')).toThrow();
      expect(() => createProvider('OPENAI')).toThrow();
    });

    it('should handle whitespace in provider type', () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      
      expect(() => createProvider(' openai ')).toThrow();
      
      try {
        createProvider(' openai ');
      } catch (error: any) {
        expect(error.message).toBe('Unsupported provider type:  openai . Supported types are: openai, openrouter');
        expect(error.code).toBe(EXIT_CONFIG_ERROR);
      }
    });

    it('should work with empty string API keys', () => {
      process.env.OPENAI_API_KEY = '';
      
      expect(() => createProvider('openai')).toThrow();
      
      try {
        createProvider('openai');
      } catch (error: any) {
        expect(error.message).toBe('OPENAI_API_KEY is not set');
        expect(error.code).toBe(EXIT_CONFIG_ERROR);
      }
    });

    it('should work with whitespace-only API keys', () => {
      process.env.OPENAI_API_KEY = '   ';
      
      expect(() => createProvider('openai')).toThrow();
      
      try {
        createProvider('openai');
      } catch (error: any) {
        expect(error.message).toBe('OPENAI_API_KEY is not set');
        expect(error.code).toBe(EXIT_CONFIG_ERROR);
      }
    });
  });
});

