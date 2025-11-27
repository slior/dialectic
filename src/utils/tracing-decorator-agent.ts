import { Agent, AgentLLMResponse } from '../core/agent';
import { Proposal, Critique } from '../types/agent.types';
import { DebateContext, ContextPreparationResult, ClarificationQuestionsResponse, DebateState } from '../types/debate.types';
import { TracingContext, SPAN_LEVEL } from '../types/tracing.types';
import { logWarning } from './console';
import { ToolCall, ToolResult, TOOL_RESULT_STATUS } from '../types/tool.types';
import { ToolImplementation } from '../tools/tool-implementation';
import { TracingLLMProvider } from './tracing-provider';
import { getSpanParent } from './tracing-utils';
import { getPromptsForRole } from '../agents/prompts';
import { LLMProvider } from '../providers/llm-provider';

/**
 * Decorator agent that wraps a RoleBasedAgent and adds Langfuse tracing
 * to all agent methods (propose, critique, refine, prepareContext, askClarifyingQuestions)
 * and tool executions.
 * 
 * This decorator maintains the Agent interface while adding observability
 * without modifying the underlying agent implementation.
 */
export class TracingDecoratorAgent extends Agent {
  constructor(
    private readonly wrappedAgent: Agent,
    private readonly tracingContext: TracingContext
  ) {
    // Extract protected members from wrapped agent (need cast since they're protected)
    const provider = (wrappedAgent as any).provider as LLMProvider;
    const toolRegistry = (wrappedAgent as any).toolRegistry;
    const toolCallLimit = (wrappedAgent as any).toolCallLimit;
    const logger = (wrappedAgent as any).logger;

    // Pass through the wrapped agent's config and provider
    super(
      wrappedAgent.config,
      provider,
      toolRegistry,
      toolCallLimit,
      logger
    );

    // Set agent ID on the tracing provider so it can resolve the correct parent span
    // This is necessary for concurrent agent execution to maintain separate span hierarchies
    if (provider instanceof TracingLLMProvider) {
      provider.setAgentId(this.config.id);
    }
  }

  /**
   * Creates a proposal with tracing span.
   * 
   * Instead of calling wrappedAgent.propose() (which would call its own proposeImpl),
   * we prepare prompts from the wrapped agent and call our own proposeImpl(),
   * which will use our callLLM override (which uses our executeTool override).
   */
  async propose(problem: string, context: DebateContext, state?: DebateState): Promise<Proposal> {
    const spanName = `agent-propose-${this.config.id}`;
    return this.executeWithSpan(spanName, context, async () => {
      // Access wrapped agent's prompt preparation (RoleBasedAgent-specific)
      const wrappedAgentAny = this.wrappedAgent as any;
      const systemPrompt = wrappedAgentAny.resolvedSystemPrompt;
      const rolePrompts = wrappedAgentAny.rolePrompts || getPromptsForRole(this.config.role);
      const userPrompt = rolePrompts.proposePrompt(problem, context, this.config.id, context.includeFullHistory);
      
      // Call our own proposeImpl, which will use our callLLM (which uses our executeTool)
      return await this.proposeImpl(context, systemPrompt, userPrompt, state);
    });
  }

  /**
   * Creates a critique with tracing span.
   */
  async critique(proposal: Proposal, context: DebateContext, state?: DebateState): Promise<Critique> {
    const spanName = `agent-critique-${this.config.id}`;
    return this.executeWithSpan(spanName, context, async () => {
      // Access wrapped agent's prompt preparation (RoleBasedAgent-specific)
      const wrappedAgentAny = this.wrappedAgent as any;
      const systemPrompt = wrappedAgentAny.resolvedSystemPrompt;
      const rolePrompts = wrappedAgentAny.rolePrompts || getPromptsForRole(this.config.role);
      const userPrompt = rolePrompts.critiquePrompt(proposal.content, context, this.config.id, context.includeFullHistory);
      
      // Call our own critiqueImpl, which will use our callLLM (which uses our executeTool)
      return await this.critiqueImpl(context, systemPrompt, userPrompt, state);
    });
  }

  /**
   * Refines a proposal with tracing span.
   */
  async refine(originalProposal: Proposal, critiques: Critique[], context: DebateContext, state?: DebateState): Promise<Proposal> {
    const spanName = `agent-refine-${this.config.id}`;
    return this.executeWithSpan(spanName, context, async () => {
      // Access wrapped agent's prompt preparation (RoleBasedAgent-specific)
      const wrappedAgentAny = this.wrappedAgent as any;
      const systemPrompt = wrappedAgentAny.resolvedSystemPrompt;
      const rolePrompts = wrappedAgentAny.rolePrompts || getPromptsForRole(this.config.role);
      const critiquesText = critiques.map((c, i) => `Critique ${i + 1}:\n${c.content}`).join('\n\n');
      const userPrompt = rolePrompts.refinePrompt(originalProposal.content, critiquesText, context, this.config.id, context.includeFullHistory);
      
      // Call our own refineImpl, which will use our callLLM (which uses our executeTool)
      return await this.refineImpl(context, systemPrompt, userPrompt, state);
    });
  }

  /**
   * Prepares context with tracing span.
   */
  async prepareContext(context: DebateContext, roundNumber: number): Promise<ContextPreparationResult> {
    const spanName = `agent-prepareContext-${this.config.id}`;
    return this.executeWithSpan(spanName, context, async () => {
      return await this.wrappedAgent.prepareContext(context, roundNumber);
    });
  }

  /**
   * Asks clarifying questions with tracing span.
   */
  async askClarifyingQuestions(problem: string, context: DebateContext): Promise<ClarificationQuestionsResponse> {
    const spanName = `agent-askClarifyingQuestions-${this.config.id}`;
    return this.executeWithSpan(spanName, context, async () => {
      return await this.wrappedAgent.askClarifyingQuestions(problem, context);
    });
  }

  /**
   * Delegates to wrapped agent.
   */
  shouldSummarize(context: DebateContext): boolean {
    return this.wrappedAgent.shouldSummarize(context);
  }

  /**
   * Overrides proposeImpl to ensure our executeTool override is used.
   * 
   * When wrappedAgent.propose() calls this.proposeImpl(), it calls it on the wrapped agent.
   * But we need the wrapped agent's proposeImpl to use our callLLM (which uses our executeTool).
   * 
   * The solution: Override proposeImpl here so when the wrapped agent's propose() calls
   * this.proposeImpl(), it will call our override, which calls super.proposeImpl() (which
   * calls our callLLM override, which uses our executeTool override).
   */
  protected async proposeImpl(context: DebateContext, systemPrompt: string, userPrompt: string, state?: DebateState): Promise<Proposal> {
    // Call the base class proposeImpl, which will call this.callLLM() (our override)
    // which will use our executeTool override for tracing
    return super.proposeImpl(context, systemPrompt, userPrompt, state);
  }

  /**
   * Overrides critiqueImpl to ensure our executeTool override is used.
   */
  protected async critiqueImpl(context: DebateContext, systemPrompt: string, userPrompt: string, state?: DebateState): Promise<Critique> {
    return super.critiqueImpl(context, systemPrompt, userPrompt, state);
  }

  /**
   * Overrides refineImpl to ensure our executeTool override is used.
   */
  protected async refineImpl(context: DebateContext, systemPrompt: string, userPrompt: string, state?: DebateState): Promise<Proposal> {
    return super.refineImpl(context, systemPrompt, userPrompt, state);
  }

  /**
   * Overrides callLLM to ensure our executeTool override is used.
   * This is called by proposeImpl/critiqueImpl/refineImpl, and will use our executeTool override.
   */
  protected async callLLM(systemPrompt: string, userPrompt: string, context?: DebateContext, state?: DebateState): Promise<AgentLLMResponse> {
    // Call the base class callLLM, which will call this.executeTool() (our override)
    return super.callLLM(systemPrompt, userPrompt, context, state);
  }

  /**
   * Executes a tool with tracing span.
   * Overrides the protected executeTool method from Agent base class.
   */
  protected executeTool(
    tool: ToolImplementation,
    args: Record<string, unknown>,
    toolCall: ToolCall,
    context: DebateContext | undefined,
    state: DebateState | undefined,
    toolResultsForThisIteration: ToolResult[],
    allToolResults: ToolResult[]
  ): void {
    const spanName = `tool-execution-${toolCall.name}`;
    
    // Only create tracing span if tracing context is available
    if (!this.tracingContext) {
      // No tracing - fall back to base class behavior
      super.executeTool(tool, args, toolCall, context, state, toolResultsForThisIteration, allToolResults);
      return;
    }
    
    try {
      // Create a span for tool execution within the current span if available, otherwise on the trace
      // This ensures tool executions appear nested within the agent span/generation that triggered them
      // Pass agent ID to get the correct parent span for this agent (supports concurrent execution)
      const toolSpan = getSpanParent(this.tracingContext, this.config.id).span({
        name: spanName,
        input: args, // Tool arguments as input
        metadata: {
          toolName: toolCall.name,
          agentId: this.config.id,
          debateId: context?.tracingContext?.trace?.id || 'unknown',
        },
      });

      // Store the count before execution to find the result we just added
      const resultCountBefore = toolResultsForThisIteration.length;
      
      // Execute tool using base class implementation
      super.executeTool(tool, args, toolCall, context, state, toolResultsForThisIteration, allToolResults);
      
      // Get the result that was just added
      const result = toolResultsForThisIteration[resultCountBefore];
      
      if (result) {
        try {
          // Parse the result content to check if it's an error
          const resultContent = JSON.parse(result.content);
          
          if (resultContent.status === TOOL_RESULT_STATUS.ERROR) {
            // End span with error
            toolSpan.end({
              level: SPAN_LEVEL.ERROR,
              statusMessage: resultContent.error || 'Tool execution failed',
            });
          } else {
            // End span with success
            toolSpan.end({
              output: result.content,
            });
          }
        } catch (parseError: any) {
          // If we can't parse, just end the span with the raw content
          toolSpan.end({
            output: result.content,
          });
        }
      } else {
        // No result added (shouldn't happen, but handle gracefully)
        toolSpan.end();
      }
    } catch (tracingError: any) {
      // If tracing fails, log warning and continue with tool execution
      logWarning(`Langfuse tracing failed for tool execution: ${tracingError.message}`);
      
      // Fall back to base class behavior - call super.executeTool
      super.executeTool(tool, args, toolCall, context, state, toolResultsForThisIteration, allToolResults);
    }
  }

  /**
   * Helper method to execute a function within a tracing span.
   * Resets the iteration counter on the wrapped provider before execution
   * to ensure each agent method starts with a fresh counter for its tool-calling loop.
   */
  private async executeWithSpan<T>(
    spanName: string,
    context: DebateContext,
    fn: () => Promise<T>
  ): Promise<T> {
    // Reset iteration counter on the wrapped provider before executing the method
    // This ensures each agent method (propose, critique, refine, etc.) starts
    // with iteration 0 for its tool-calling loop
    const provider = (this.wrappedAgent as any).provider;
    if (provider instanceof TracingLLMProvider) {
      provider.resetIterationCount();
    }

    try {
      const span = this.tracingContext.trace.span({
        name: spanName,
        metadata: {
          agentName: this.config.name,
          agentRole: this.config.role,
          agentId: this.config.id,
          debateId: context.tracingContext?.trace?.id || 'unknown',
          roundNumber: this.extractRoundNumber(context),
        },
      });

      // Set current span for this agent so TracingLLMProvider can create generations within this span
      // Use agent ID as key to support concurrent agent execution
      const previousSpan = this.tracingContext.currentSpans.get(this.config.id);
      this.tracingContext.currentSpans.set(this.config.id, span);

      try {
        const result = await fn();
        span.end();
        return result;
      } catch (error: any) {
        span.end({
          level: SPAN_LEVEL.ERROR,
          statusMessage: error.message,
        });
        throw error;
      } finally {
        // Restore previous span for this agent (or remove if there wasn't one)
        if (previousSpan !== undefined) {
          this.tracingContext.currentSpans.set(this.config.id, previousSpan);
        } else {
          this.tracingContext.currentSpans.delete(this.config.id);
        }
      }
    } catch (tracingError: any) {
      // If tracing fails, log warning and continue with original operation
      logWarning(`Langfuse tracing failed for ${spanName}: ${tracingError.message}`);
      return await fn();
    }
  }

  /**
   * Extracts round number from context if available.
   */
  private extractRoundNumber(context: DebateContext): number | undefined {
    // Round number is not directly in DebateContext, but could be inferred from history
    if (context.history && context.history.length > 0) {
      return context.history[context.history.length - 1]?.roundNumber;
    }
    return undefined;
  }
}
