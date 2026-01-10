import { LLM_PROVIDERS } from '../types/agent.types';
import { EXIT_CONFIG_ERROR } from '../utils/exit-codes';

import { LLMProvider } from './llm-provider';
import { OpenAIProvider } from './openai-provider';
import { OpenRouterProvider } from './openrouter-provider';

/**
 * Environment variable names for API keys
 */
const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';
const OPENROUTER_API_KEY_ENV = 'OPENROUTER_API_KEY';


/**
 * Helper function to create a provider instance with API key validation.
 * 
 * @param envVarName - The name of the environment variable containing the API key
 * @param ProviderClass - The provider class constructor
 * @returns An LLM provider instance
 * @throws {Error} If the API key is missing or empty
 */
function createProviderWithApiKey<T extends LLMProvider>(
  envVarName: string,
  ProviderClass: new (apiKey: string) => T
): T {
  const apiKey = process.env[envVarName];
  if (!apiKey || apiKey.trim() === '') {
    const err: any = new Error(`${envVarName} is not set`);
    err.code = EXIT_CONFIG_ERROR;
    throw err;
  }
  return new ProviderClass(apiKey);
}

/**
 * Creates an LLM provider instance based on the specified provider type.
 * 
 * This factory function handles provider creation and API key retrieval from environment
 * variables. It implements fail-fast error handling with clear error messages for
 * configuration issues.
 * 
 * @param providerType - The type of provider to create ("openai" or "openrouter")
 * @returns An LLM provider instance
 * @throws {Error} If the provider type is invalid or the required API key is missing
 */
export function createProvider(providerType: string): LLMProvider {
  
  switch (providerType) {
    case LLM_PROVIDERS.OPENAI: {
      return createProviderWithApiKey(OPENAI_API_KEY_ENV, OpenAIProvider);
    }
    
    case LLM_PROVIDERS.OPENROUTER: {
      return createProviderWithApiKey(OPENROUTER_API_KEY_ENV, OpenRouterProvider);
    }
    
    default: {
      const supportedTypes = Object.values(LLM_PROVIDERS).join(', ');
      const err: any = new Error(`Unsupported provider type: ${providerType}. Supported types are: ${supportedTypes}`);
      err.code = EXIT_CONFIG_ERROR;
      throw err;
    }
  }
}
