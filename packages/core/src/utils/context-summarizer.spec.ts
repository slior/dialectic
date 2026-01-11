import { LengthBasedSummarizer, LLMProvider, SummarizationConfig, SUMMARIZATION_METHODS, AGENT_ROLES, CompletionRequest, CompletionResponse, LLM_PROVIDERS } from 'dialectic-core';
//TODO: change the imports to import from source instead of dialectic-core.
// Test constants
const DEFAULT_SUMMARY_TEMPERATURE = 0.3;
const CUSTOM_TEMPERATURE = 0.55;
const MOCK_TOTAL_TOKENS = 100;
const TEST_MAX_LENGTH = 2500;
const TEST_THRESHOLD = 5000;
const LONG_SUMMARY_LENGTH = 3000;

// Mock LLM Provider
class MockLLMProvider implements LLMProvider {
  private mockResponse: string;
  private shouldFail: boolean;

  constructor(mockResponse: string = 'This is a test summary.', shouldFail: boolean = false) {
    this.mockResponse = mockResponse;
    this.shouldFail = shouldFail;
  }

  async complete(_request: CompletionRequest): Promise<CompletionResponse> {
    if (this.shouldFail) {
      throw new Error('Mock LLM failure');
    }
    return {
      text: this.mockResponse,
      usage: { totalTokens: MOCK_TOTAL_TOKENS }
    };
  }
}

describe('LengthBasedSummarizer', () => {
  const config: SummarizationConfig = {
    enabled: true,
    threshold: TEST_THRESHOLD,
    maxLength: TEST_MAX_LENGTH,
    method: SUMMARIZATION_METHODS.LENGTH_BASED,
  };

  it('should return summary with correct metadata (configured values)', async () => {
    const provider = new MockLLMProvider('Test summary content');
    const summarizer = new LengthBasedSummarizer(provider, { model: 'gpt-4o', temperature: CUSTOM_TEMPERATURE, provider: LLM_PROVIDERS.OPENAI });
    
    const content = 'This is the debate history to summarize.';
    const role = AGENT_ROLES.ARCHITECT;
    const systemPrompt = 'You are an architect.';
    const summaryPrompt = 'Summarize this content.';

    const result = await summarizer.summarize(content, role, config, systemPrompt, summaryPrompt);

    expect(result.summary).toBe('Test summary content');
    expect(result.metadata.beforeChars).toBe(content.length);
    expect(result.metadata.afterChars).toBe('Test summary content'.length);
    expect(result.metadata.method).toBe(SUMMARIZATION_METHODS.LENGTH_BASED);
    expect(result.metadata.timestamp).toBeInstanceOf(Date);
    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.tokensUsed).toBe(MOCK_TOTAL_TOKENS);
    expect(result.metadata.model).toBe('gpt-4o');
    expect(result.metadata.temperature).toBe(0.55);
    expect(result.metadata.provider).toBe('openai');
  });

  it('should call LLM provider with correct prompts (defaults as fallbacks)', async () => {
    const provider = new MockLLMProvider();
    const completeSpy = jest.spyOn(provider, 'complete');
    const summarizer = new LengthBasedSummarizer(provider);
    
    const content = 'Content to summarize';
    const systemPrompt = 'System prompt';
    const summaryPrompt = 'Summary prompt';

    await summarizer.summarize(content, AGENT_ROLES.ARCHITECT, config, systemPrompt, summaryPrompt);

    expect(completeSpy).toHaveBeenCalledWith({
      model: 'gpt-4',
      temperature: DEFAULT_SUMMARY_TEMPERATURE,
      systemPrompt: 'System prompt',
      userPrompt: 'Summary prompt',
    });
  });

  it('should truncate summary to maxLength if needed', async () => {
    const longSummary = 'a'.repeat(LONG_SUMMARY_LENGTH);
    const provider = new MockLLMProvider(longSummary);
    const summarizer = new LengthBasedSummarizer(provider);
    
    const result = await summarizer.summarize('content', AGENT_ROLES.ARCHITECT, config, 'sys', 'sum');

    expect(result.summary.length).toBe(config.maxLength);
    expect(result.summary).toBe('a'.repeat(config.maxLength));
  });

  it('should measure latency correctly', async () => {
    const provider = new MockLLMProvider();
    const summarizer = new LengthBasedSummarizer(provider);
    
    const result = await summarizer.summarize('content', AGENT_ROLES.ARCHITECT, config, 'sys', 'sum');

    expect(result.metadata.latencyMs).toBeDefined();
    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle LLM errors gracefully', async () => {
    const provider = new MockLLMProvider('', true);
    const summarizer = new LengthBasedSummarizer(provider);
    
    await expect(
      summarizer.summarize('content', AGENT_ROLES.ARCHITECT, config, 'sys', 'sum')
    ).rejects.toThrow('Mock LLM failure');
  });

  it('should include token usage when provided by LLM', async () => {
    const provider = new MockLLMProvider('Summary');
    const summarizer = new LengthBasedSummarizer(provider);
    
    const result = await summarizer.summarize('content', AGENT_ROLES.ARCHITECT, config, 'sys', 'sum');

    expect(result.metadata.tokensUsed).toBe(MOCK_TOTAL_TOKENS);
  });

  it('should handle missing token usage from LLM', async () => {
    class NoTokenProvider implements LLMProvider {
      async complete(_request: CompletionRequest): Promise<CompletionResponse> {
        return { text: 'Summary' };
      }
    }
    
    const provider = new NoTokenProvider();
    const summarizer = new LengthBasedSummarizer(provider);
    
    const result = await summarizer.summarize('content', AGENT_ROLES.ARCHITECT, config, 'sys', 'sum');

    expect(result.metadata.tokensUsed).toBeUndefined();
  });
});

