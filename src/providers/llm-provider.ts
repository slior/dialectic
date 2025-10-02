export interface CompletionRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface CompletionUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface CompletionResponse {
  text: string;
  usage?: CompletionUsage;
}

export interface LLMProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream?(request: CompletionRequest): AsyncIterator<string>;
  generateEmbedding?(text: string): Promise<number[]>;
}
