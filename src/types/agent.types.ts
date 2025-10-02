export type AgentRole = "architect" | "security" | "performance" | "testing" | "generalist";

export interface AgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  model: string; // e.g., "gpt-4"
  provider: "openai"; // Flow 1: only openai
  temperature: number; // 0.0 - 1.0
  systemPrompt?: string; // Optional: can be supplied by config; agents may also have built-ins
  enabled?: boolean; // default true if omitted
}

export interface ContributionMetadata {
  tokensUsed?: number;
  latencyMs?: number;
  model?: string;
}

export interface Proposal {
  content: string;
  metadata: ContributionMetadata;
}

export interface Critique {
  content: string;
  metadata: ContributionMetadata;
}
