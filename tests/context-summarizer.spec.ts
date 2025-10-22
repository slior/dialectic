import { LengthBasedSummarizer } from '../src/utils/context-summarizer';
import { LLMProvider } from '../src/providers/llm-provider';
import { SummarizationConfig, SUMMARIZATION_METHODS } from '../src/types/debate.types';
import { AGENT_ROLES } from '../src/types/agent.types';

// Mock LLM Provider
class MockLLMProvider implements LLMProvider {
  private mockResponse: string;
  private shouldFail: boolean;

  constructor(mockResponse: string = 'This is a test summary.', shouldFail: boolean = false) {
    this.mockResponse = mockResponse;
    this.shouldFail = shouldFail;
  }

  async complete(_request: any): Promise<any> {
    if (this.shouldFail) {
      throw new Error('Mock LLM failure');
    }
    return {
      text: this.mockResponse,
      usage: { totalTokens: 100 }
    };
  }
}

describe('LengthBasedSummarizer', () => {
  const config: SummarizationConfig = {
    enabled: true,
    threshold: 5000,
    maxLength: 2500,
    method: SUMMARIZATION_METHODS.LENGTH_BASED,
  };

  it('should return summary with correct metadata (configured values)', async () => {
    const provider = new MockLLMProvider('Test summary content');
    const summarizer = new LengthBasedSummarizer(provider, { model: 'gpt-4o', temperature: 0.55, provider: 'openai' as any });
    
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
    expect(result.metadata.tokensUsed).toBe(100);
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
      temperature: 0.3,
      systemPrompt: 'System prompt',
      userPrompt: 'Summary prompt',
    });
  });

  it('should truncate summary to maxLength if needed', async () => {
    const longSummary = 'a'.repeat(3000);
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

    expect(result.metadata.tokensUsed).toBe(100);
  });

  it('should handle missing token usage from LLM', async () => {
    class NoTokenProvider implements LLMProvider {
      async complete(_request: any): Promise<any> {
        return { text: 'Summary' };
      }
    }
    
    const provider = new NoTokenProvider();
    const summarizer = new LengthBasedSummarizer(provider);
    
    const result = await summarizer.summarize('content', AGENT_ROLES.ARCHITECT, config, 'sys', 'sum');

    expect(result.metadata.tokensUsed).toBeUndefined();
  });
});

