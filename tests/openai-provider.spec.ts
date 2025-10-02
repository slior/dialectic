import { OpenAIProvider } from '../src/providers/openai-provider';
import { LLMProvider } from '../src/providers/llm-provider';

// Mock the OpenAI SDK to avoid network calls and force fallback path
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: class OpenAIMock {
      // No responses API -> forces fallback
      public chat = {
        completions: {
          create: async (_: any) => ({ choices: [{ message: { content: 'ok' } }] }),
        },
      };
      constructor(_opts: any) {}
    },
  };
});

describe('OpenAIProvider', () => {
  it('falls back to chat completions when Responses API is unavailable', async () => {
    const provider: LLMProvider = new OpenAIProvider('fake');
    const res = await provider.complete({ model: 'gpt-4', systemPrompt: 'sys', userPrompt: 'hello', temperature: 0.5 });
    expect(res.text).toBe('ok');
  });
});
