import { Agent } from '../core/agent';
import { AgentConfig, Proposal, Critique, PromptSource } from '../types/agent.types';
import { DebateContext } from '../types/debate.types';
import { LLMProvider } from '../providers/llm-provider';

const DEFAULT_SECURITY_SYSTEM_PROMPT = `You are a cybersecurity expert specializing in threat modeling, risk assessment, and security architecture.
Consider authentication, authorization, data protection, network security, application security, compliance frameworks, and operational security.
When proposing solutions, identify security requirements, threat vectors, security controls, risk mitigation strategies, and compliance considerations.
When critiquing, look for security vulnerabilities, missing security controls, compliance gaps, and potential attack vectors.`;

/**
 * SecurityAgent is an AI agent specializing in cybersecurity within the multi-agent debate system.
 * 
 * Responsibilities:
 * - Proposes security-focused solutions to software design problems, emphasizing threat modeling and risk assessment.
 * - Critiques proposals from other agents, focusing on security vulnerabilities, compliance gaps, and potential attack vectors.
 * - Refines its own proposals by incorporating feedback and strengthening security measures.
 * 
 * The agent leverages an LLM provider to generate its outputs, using a system prompt tailored for security reasoning.
 * 
 * Methods:
 * - propose: Generates a comprehensive security solution for a given problem.
 * - critique: Reviews and critiques a given proposal from a security perspective.
 * - refine: Refines an original proposal by addressing security concerns and strengthening the solution.
 *
 * Note: This class cannot be extended. Use the static `create` factory method to instantiate.
 */
export class SecurityAgent extends Agent {
  private readonly resolvedSystemPrompt: string;
  public readonly promptSource?: PromptSource;
  
  /**
   * Private constructor to prevent direct instantiation and extension.
   * Use the static `create` method instead.
   * @param config - Agent configuration, including model.
   * @param provider - LLMProvider instance for LLM interactions.
   * @param resolvedSystemPrompt - The final system prompt text this agent will use.
   * @param promptSource - Optional provenance metadata for verbose/persistence.
   */
  private constructor(config: AgentConfig, provider: LLMProvider, resolvedSystemPrompt: string, promptSource?: PromptSource) {
    super(config, provider);
    this.resolvedSystemPrompt = resolvedSystemPrompt;
    if (promptSource !== undefined) {
      this.promptSource = promptSource;
    }
  }

  /**
   * Factory method to create a new SecurityAgent instance.
   * @param config - Agent configuration, including model.
   * @param provider - LLMProvider instance for LLM interactions.
   * @param resolvedSystemPrompt - The final system prompt text this agent will use.
   * @param promptSource - Optional provenance metadata for verbose/persistence.
   * @returns A new SecurityAgent instance.
   */
  static create(config: AgentConfig, provider: LLMProvider, resolvedSystemPrompt: string, promptSource?: PromptSource): SecurityAgent {
    return new SecurityAgent(config, provider, resolvedSystemPrompt, promptSource);
  }

  /**
   * Expose the default system prompt text.
   */
  static defaultSystemPrompt(): string { return DEFAULT_SECURITY_SYSTEM_PROMPT; }

  /**
   * Generates a comprehensive security proposal for the given problem.
   * @param problem - The software design problem to solve.
   * @param context - Debate context
   * @returns A Proposal object containing the agent's solution and metadata.
   */
  async propose(problem: string, context: DebateContext): Promise<Proposal> {
    const system = this.resolvedSystemPrompt;
    const user = `Problem to solve:\n${problem}\n\nAs a cybersecurity expert, propose a comprehensive solution focusing on security requirements, threat modeling, security controls, and compliance considerations.`;
    return this.proposeImpl(context, system, user);
  }

  /**
   * Critiques a given proposal from a security perspective.
   * Identifies security vulnerabilities, missing controls, and compliance gaps.
   * @param proposal - The proposal to critique.
   * @param context - Debate context.
   * @returns A Critique object containing the agent's review and metadata.
   */
  async critique(proposal: Proposal, context: DebateContext): Promise<Critique> {
    const system = this.resolvedSystemPrompt;
    const user = `Review this proposal as a cybersecurity expert. Identify security vulnerabilities, missing security controls, compliance gaps, and potential attack vectors.\n\nProposal:\n${proposal.content}`;
    return this.critiqueImpl(proposal, context, system, user);
  }

  /**
   * Refines the original proposal by addressing security concerns and strengthening security measures.
   * Incorporates security feedback from other agents to improve the solution.
   * @param original - The original proposal to refine.
   * @param critiques - Array of critiques to address.
   * @param context - Debate context.
   * @returns A new Proposal object with the refined solution and metadata.
   */
  async refine(original: Proposal, critiques: Critique[], context: DebateContext): Promise<Proposal> {
    const system = this.resolvedSystemPrompt;
    const critiquesText = critiques.map((c, i) => `Critique ${i + 1}:\n${c.content}`).join('\n\n');
    const user = `Original proposal:\n${original.content}\n\nCritiques:\n${critiquesText}\n\nRefine your proposal addressing security concerns, strengthening security measures, and incorporating valid security feedback.`;
    return this.refineImpl(original, critiques, context, system, user);
  }
}