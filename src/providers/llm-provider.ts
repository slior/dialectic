export interface CompletionRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface LLMProvider {
  complete(request: CompletionRequest): Promise<string>;
  stream?(request: CompletionRequest): AsyncIterator<string>;
  generateEmbedding?(text: string): Promise<number[]>;
}
