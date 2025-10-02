import OpenAI from 'openai';
import { CompletionRequest, LLMProvider } from './llm-provider';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(request: CompletionRequest): Promise<string> {
    // Try Responses API first
    try {
      // Build Responses API payload conditionally
      const respPayload: any = {
        model: request.model,
        temperature: request.temperature,
        input: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
      };
      if (request.maxTokens != null) respPayload.max_output_tokens = request.maxTokens;
      if (request.stopSequences) respPayload.stop = request.stopSequences;

      const resp = await (this.client as any).responses?.create?.(respPayload);

      if (resp && resp.output_text) {
        return resp.output_text as string;
      }
      // Some SDK shapes use output[0]?.content[0]?.text
      const outText: string | undefined = resp?.output?.[0]?.content?.[0]?.text;
      if (outText) return outText;

      // Fallback if Responses API returned unexpected shape
      throw new Error('Unexpected Responses API response shape');
    } catch (_err) {
      // Fallback to Chat Completions API
      const chatPayload: any = {
        model: request.model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
        temperature: request.temperature,
      };
      if (request.maxTokens != null) chatPayload.max_tokens = request.maxTokens;
      if (request.stopSequences) chatPayload.stop = request.stopSequences;

      const chat = await this.client.chat.completions.create(chatPayload);
      return chat.choices[0]?.message?.content ?? '';
    }
  }
}
