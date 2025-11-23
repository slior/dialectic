import { AgentConfig, Proposal, Critique, ContributionMetadata, DEFAULT_TOOL_CALL_LIMIT } from '../types/agent.types';
import { DebateContext, ContextPreparationResult, ClarificationQuestionsResponse } from '../types/debate.types';
import { LLMProvider, ChatMessage, CHAT_ROLES, CompletionRequest } from '../providers/llm-provider';
import { CompletionResponse, CompletionUsage } from '../providers/llm-provider';
import { ToolRegistry } from '../tools/tool-registry';
import { ToolCall, ToolResult, TOOL_RESULT_STATUS, ToolSchema } from '../types/tool.types';
import { writeStderr } from '../utils/console';
import { createToolResult, ToolImplementation } from '../tools/tool-implementation';

/**
 * Optional logger callback for agent messages.
 * @param message - The message to log
 * @param onlyVerbose - If true, message should only be logged in verbose mode
 */
export type AgentLogger = (message: string, onlyVerbose?: boolean) => void;

/**
 * Abstract base class representing an AI agent in the multi-agent debate system.
 *
 * Agents are responsible for generating proposals, critiquing other agents' proposals,
 * and refining their own proposals based on received critiques. Each agent is configured
 * with a specific role, LLM model, and provider, and interacts with an LLMProvider to
 * generate its outputs.
 *
 * Additionally, agents manage context summarization to handle large debate histories.
 *
 * Subclasses must implement the core debate methods:
 *  - propose: Generate a solution proposal for a given problem.
 *  - critique: Critique another agent's proposal.
 *  - refine: Refine an original proposal by incorporating critiques.
 *  - shouldSummarize: Determine if context summarization is needed.
 *  - prepareContext: Prepare and potentially summarize the debate context.
 *
 * The base class provides a utility method, callLLM, to standardize LLM interactions,
 * capturing latency and usage metadata.
 */
export abstract class Agent {
  protected toolRegistry: ToolRegistry | undefined;
  protected toolCallLimit: number;
  protected logger: AgentLogger | undefined;

  /**
   * Constructs an Agent.
   * @param config - The agent's configuration, including model, role, and prompts.
   * @param provider - The LLMProvider instance used for LLM interactions.
   * @param toolRegistry - Optional tool registry for tool calling functionality.
   * @param toolCallLimit - Optional tool call limit per phase (defaults to DEFAULT_TOOL_CALL_LIMIT).
   * @param logger - Optional logger callback for agent messages.
   */
  constructor(
    public config: AgentConfig, protected provider: LLMProvider,
    toolRegistry?: ToolRegistry, toolCallLimit?: number, logger?: AgentLogger
  ) {
    this.toolRegistry = toolRegistry;
    this.toolCallLimit = toolCallLimit ?? config.toolCallLimit ?? DEFAULT_TOOL_CALL_LIMIT;
    this.logger = logger;
  }

  /**
   * Generates a proposal for the given problem.
   * @param problem - The software design problem to solve.
   * @param context - The current debate context, including history and state.
   * @returns A Promise resolving to a Proposal object containing the agent's solution and metadata.
   */
  abstract propose(problem: string, context: DebateContext): Promise<Proposal>;

  /**
   * Critiques a given proposal from another agent.
   * @param proposal - The proposal to critique.
   * @param context - The current debate context.
   * @returns A Promise resolving to a Critique object containing the agent's review and metadata.
   */
  abstract critique(proposal: Proposal, context: DebateContext): Promise<Critique>;

  /**
   * Refines the agent's original proposal by addressing critiques and incorporating suggestions.
   * @param originalProposal - The original proposal to refine.
   * @param critiques - Array of critiques to address.
   * @param context - The current debate context.
   * @returns A Promise resolving to a new Proposal object with the refined solution and metadata.
   */
  abstract refine(originalProposal: Proposal, critiques: Critique[], context: DebateContext): Promise<Proposal>;

  /**
   * Determines whether the debate context should be summarized based on configured thresholds.
   * 
   * @param context - The current debate context to evaluate.
   * @returns True if summarization should occur, false otherwise.
   */
  abstract shouldSummarize(context: DebateContext): boolean;

  /**
   * Prepares the debate context for the agent, potentially summarizing it if needed.
   * 
   * This method evaluates whether summarization is necessary and, if so, generates
   * a concise summary of the debate history from the agent's perspective.
   * 
   * @param context - The current debate context.
   * @param roundNumber - The current round number (1-indexed).
   * @returns A promise resolving to the context preparation result.
   */
  abstract prepareContext( context: DebateContext, roundNumber: number ): Promise<ContextPreparationResult>;

  /**
   * Requests role-specific clarifying questions before the debate starts.
   * Implementations should return ONLY structured questions; zero or more items are allowed.
   *
   * @param problem - The software design problem to clarify.
   * @param context - The current debate context.
   */
  abstract askClarifyingQuestions(problem: string, context: DebateContext): Promise<ClarificationQuestionsResponse>;

  /**
   * Template method for generating proposals.
   * Subclasses should call this method from their `propose` implementation after preparing prompts.
   *
   * @final
   * @param context - The current debate context (passed to tools if needed).
   * @param systemPrompt - The system prompt to use for the LLM.
   * @param userPrompt - The user prompt to use for the LLM.
   * @returns A Promise resolving to a Proposal object containing the agent's solution and metadata.
   */
  protected async proposeImpl( context: DebateContext, systemPrompt: string, userPrompt: string ): Promise<Proposal> {
    const { text, usage, latencyMs, toolCalls, toolResults, toolCallIterations } = await this.callLLM(systemPrompt, userPrompt, context);
    const metadata: ContributionMetadata = { latencyMs, model: this.config.model };
    if (usage?.totalTokens != null) metadata.tokensUsed = usage.totalTokens;
    if (toolCalls) metadata.toolCalls = toolCalls;
    if (toolResults) metadata.toolResults = toolResults;
    if (toolCallIterations !== undefined) metadata.toolCallIterations = toolCallIterations;
    return { content: text, metadata };
  }

  /**
   * Template method for generating critiques.
   * Subclasses should call this method from their `critique` implementation after preparing prompts.
   *
   * Note: The proposal content should be embedded in the userPrompt by the subclass before calling this method.
   *
   * @final
   * @param context - The current debate context (passed to tools if needed).
   * @param systemPrompt - The system prompt to use for the LLM.
   * @param userPrompt - The user prompt to use for the LLM. Should contain the proposal content to critique.
   * @returns A Promise resolving to a Critique object containing the agent's review and metadata.
   */
  protected async critiqueImpl( context: DebateContext, systemPrompt: string, userPrompt: string ): Promise<Critique> {
    const { text, usage, latencyMs, toolCalls, toolResults, toolCallIterations } = await this.callLLM(systemPrompt, userPrompt, context);
    const metadata: ContributionMetadata = { latencyMs, model: this.config.model };
    if (usage?.totalTokens != null) metadata.tokensUsed = usage.totalTokens;
    if (toolCalls) metadata.toolCalls = toolCalls;
    if (toolResults) metadata.toolResults = toolResults;
    if (toolCallIterations !== undefined) metadata.toolCallIterations = toolCallIterations;
    return { content: text, metadata };
  }

  /**
   * Template method for refining proposals.
   * Subclasses should call this method from their `refine` implementation after preparing prompts.
   *
   * Note: The original proposal content and critiques should be embedded in the userPrompt by the subclass before calling this method.
   *
   * @final
   * @param context - The current debate context (passed to tools if needed).
   * @param systemPrompt - The system prompt to use for the LLM.
   * @param userPrompt - The user prompt to use for the LLM. Should contain the original proposal content and critiques to address.
   * @returns A Promise resolving to a refined Proposal object with updated content and metadata.
   */
  protected async refineImpl( context: DebateContext, systemPrompt: string, userPrompt: string ): Promise<Proposal> {
    const { text, usage, latencyMs, toolCalls, toolResults, toolCallIterations } = await this.callLLM(systemPrompt, userPrompt, context);
    const metadata: ContributionMetadata = { latencyMs, model: this.config.model };
    if (usage?.totalTokens != null) metadata.tokensUsed = usage.totalTokens;
    if (toolCalls) metadata.toolCalls = toolCalls;
    if (toolResults) metadata.toolResults = toolResults;
    if (toolCallIterations !== undefined) metadata.toolCallIterations = toolCallIterations;
    return { content: text, metadata };
  }

  /**
   * Helper method to call the underlying LLM provider without tools.
   * Makes a single LLM call and returns the response with latency and usage metadata.
   *
   * @param systemPrompt - The system prompt to prime the LLM.
   * @param userPrompt - The user prompt representing the agent's request.
   * @param started - Timestamp when the call started (for latency calculation).
   * @returns A Promise resolving to an AgentLLMResponse containing text, usage metadata, and latency.
   */
  private async callLLMWithoutTools(
    systemPrompt: string,
    userPrompt: string,
    started: number
  ): Promise<AgentLLMResponse> {
    const res: CompletionResponse = await this.provider.complete({
      model: this.config.model, temperature: this.config.temperature, 
      systemPrompt, userPrompt,
    });
    const latencyMs = Date.now() - started;
    const response: AgentLLMResponse = { text: res.text, latencyMs };
    if (res.usage) response.usage = res.usage;
    return response;
  }

  /**
   * Creates and records a tool error result.
   * Adds the error result to both the current iteration's results and the overall results collection.
   * This is a stateless helper method used during tool calling loops.
   *
   * @param toolCallId - The ID of the tool call that failed.
   * @param errorMessage - The error message describing what went wrong.
   * @param toolResultsForThisIteration - Array to add the error result to for the current iteration.
   * @param allToolResults - Array to add the error result to for the overall collection.
   */
  private addToolErrorResult(
    toolCallId: string,
    errorMessage: string,
    toolResultsForThisIteration: ToolResult[],
    allToolResults: ToolResult[]
  ): void {
    const errorResult = createToolResult(
      toolCallId,
      TOOL_RESULT_STATUS.ERROR,
      undefined,
      errorMessage
    );
    toolResultsForThisIteration.push(errorResult);
    allToolResults.push(errorResult);
  }

  /**
   * Logs a message using the logger callback if available, otherwise writes to stderr.
   * This is a helper method to centralize the logging pattern used throughout the class.
   * 
   * Messages should not include trailing newlines - they are added automatically:
   * - Logger path: progressUI.log() adds newline via formatMessage()
   * - Direct path: writeStderr() adds newline here
   *
   * @param message - The message to log (should not include trailing newline).
   * @param onlyVerbose - If true, message should only be logged in verbose mode (only used when logger is available).
   */
  private logMessage(message: string, onlyVerbose?: boolean): void {
    if (this.logger) {
      this.logger(message, onlyVerbose);
    } else {
      writeStderr(message + '\n');
    }
  }

  /**
   * Parses tool call arguments from JSON string.
   * Handles parse errors by logging warnings and recording error results.
   * This is a stateless helper method used during tool calling loops.
   *
   * @param toolCall - The tool call containing the arguments string to parse.
   * @param toolResultsForThisIteration - Array to add error result to for the current iteration if parsing fails.
   * @param allToolResults - Array to add error result to for the overall collection if parsing fails.
   * @returns Parsed arguments as Record<string, unknown>, or null if parsing failed.
   */
  private parseToolArguments(
    toolCall: ToolCall,
    toolResultsForThisIteration: ToolResult[],
    allToolResults: ToolResult[]
  ): Record<string, unknown> | null {
    try {
      // JSON.parse returns any, but we use Record<string, unknown> to indicate it's an object
      return JSON.parse(toolCall.arguments) as Record<string, unknown>;
    } catch (parseError: any) {
      this.logMessage(`Warning: [${this.config.name}] Tool "${toolCall.name}" arguments are invalid JSON: ${parseError.message}. Skipping.`, false);
      this.addToolErrorResult(toolCall.id, `Invalid arguments JSON: ${parseError.message}`, toolResultsForThisIteration, allToolResults);
      return null;
    }
  }

  /**
   * Processes a single tool call: retrieves the tool, parses arguments, and executes it.
   * Handles all error cases (tool not found, invalid arguments, execution errors) by recording error results.
   * This is a stateless helper method used during tool calling loops.
   *
   * @param toolCall - The tool call to process.
   * @param context - Optional debate context passed to the tool.
   * @param toolResultsForThisIteration - Array to add results to for the current iteration.
   * @param allToolResults - Array to add results to for the overall collection.
   */
  private processToolCall(
    toolCall: ToolCall,
    context: DebateContext | undefined,
    toolResultsForThisIteration: ToolResult[],
    allToolResults: ToolResult[]
  ): void {
    this.logMessage(`[${this.config.name}] Executing tool: ${toolCall.name} with arguments: ${toolCall.arguments}`, false);

    try {
      // Get tool from registry
      const tool = this.toolRegistry!.get(toolCall.name);
      
      if (!tool) {
        // Tool not found
        this.logMessage(`Warning: [${this.config.name}] Tool "${toolCall.name}" not found. Skipping.`, false);
        this.addToolErrorResult(toolCall.id, 'Tool not found', toolResultsForThisIteration, allToolResults);
        return;
      }

      // Parse arguments
      const args = this.parseToolArguments(toolCall, toolResultsForThisIteration, allToolResults);
      if (args === null) {
        return;
      }

      // Execute tool
      this.executeTool(tool, args, toolCall, context, toolResultsForThisIteration, allToolResults);
    } catch (error: any) {
      this.logMessage(`Warning: [${this.config.name}] Error processing tool call "${toolCall.name}": ${error.message}`, false);
      this.addToolErrorResult(toolCall.id, error.message, toolResultsForThisIteration, allToolResults);
    }
  }

  /**
   * Processes a single iteration of the tool calling loop.
   * Makes an LLM call, handles tool calls if present, and updates the conversation state.
   * This is a stateless helper method used during tool calling loops.
   *
   * @param systemPrompt - The system prompt to prime the LLM.
   * @param userPrompt - The user prompt representing the agent's request.
   * @param toolSchemas - Array of tool schemas available for function calling.
   * @param messages - The conversation history (modified in place).
   * @param context - Optional debate context passed to tools.
   * @param iterationCount - Current iteration count (will be incremented if tool calls are processed).
   * @param allToolCalls - Array to add tool calls to (modified in place).
   * @param allToolResults - Array to add tool results to (modified in place).
   * @returns Object containing shouldContinue flag, finalText, and updated iterationCount.
   */
  private async processToolCallIteration(
    systemPrompt: string,
    userPrompt: string,
    toolSchemas: ToolSchema[],
    messages: ChatMessage[],
    context: DebateContext | undefined,
    iterationCount: number,
    allToolCalls: ToolCall[],
    allToolResults: ToolResult[]
  ): Promise<{ shouldContinue: boolean; finalText: string; iterationCount: number }> {
    // Make LLM call with current messages
    const request = this.buildCompletionRequest(systemPrompt, userPrompt, toolSchemas, messages);
    const res: CompletionResponse = await this.provider.complete(request);

    const toolCalls = res.toolCalls;
    let finalText = '';
    let shouldContinue = false;

    if (!toolCalls || toolCalls.length === 0) {
      finalText = res.text;
      shouldContinue = false; // No tool calls - we're done
    } else {
      // Execute each tool call
      const toolResultsForThisIteration: ToolResult[] = [];
      for (const toolCall of toolCalls) {
        this.processToolCall(toolCall, context, toolResultsForThisIteration, allToolResults);
      }

      allToolCalls.push(...toolCalls); // Add tool calls to collection
      this.buildMessagesForNextIteration(messages, res.text, toolCalls, toolResultsForThisIteration);
      iterationCount++;
      shouldContinue = iterationCount < this.toolCallLimit;

      if (!shouldContinue) { // If we hit the limit and still have tool calls, use the last response text
        finalText = res.text;
      }
    }

    return { shouldContinue, finalText, iterationCount };
  }

  /**
   * Builds a completion request for the LLM provider with tool calling support.
   * Creates a request object that includes the model, temperature, prompts, tool schemas, and conversation messages.
   * This is a stateless helper method used during tool calling loops.
   *
   * @param systemPrompt - The system prompt to prime the LLM.
   * @param userPrompt - The user prompt representing the agent's request.
   * @param toolSchemas - Array of tool schemas available for function calling.
   * @param messages - The conversation history (messages array takes precedence over systemPrompt/userPrompt when provided).
   * @returns A CompletionRequest object ready to be sent to the LLM provider.
   */
  private buildCompletionRequest( systemPrompt: string, userPrompt: string,
                                  toolSchemas: ToolSchema[], messages: ChatMessage[] ): CompletionRequest {
    return {
      model: this.config.model,
      temperature: this.config.temperature,
      systemPrompt: systemPrompt, // Required by interface, but messages takes precedence when provided
      userPrompt: userPrompt, // Required by interface, but messages takes precedence when provided
      tools: toolSchemas,
      messages: messages, // Use messages array for tool calling (takes precedence over systemPrompt/userPrompt)
    };
  }

  /**
   * Builds messages for the next iteration of the tool calling loop.
   * Adds the assistant's message with tool calls and all tool result messages to the conversation history.
   * This is a stateless helper method used during tool calling loops.
   *
   * @param messages - The messages array to modify (conversation history).
   * @param assistantText - The assistant's text response from the LLM.
   * @param toolCalls - Array of tool calls that were requested.
   * @param toolResultsForThisIteration - Array of tool results from this iteration.
   */
  private buildMessagesForNextIteration(
    messages: ChatMessage[], assistantText: string,
    toolCalls: ToolCall[], toolResultsForThisIteration: ToolResult[] ): void {
    messages.push({
      role: CHAT_ROLES.ASSISTANT,
      content: assistantText,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: tc.arguments,
        },
      })),
    });

    // Add tool result messages
    for (const toolResult of toolResultsForThisIteration) {
      messages.push({
        role: CHAT_ROLES.TOOL,
        content: toolResult.content,
        tool_call_id: toolResult.tool_call_id,
      });
    }
  }

  /**
   * Executes a tool and records the result.
   * Creates a tool result in OpenAI format and adds it to both the current iteration's results
   * and the overall results collection. Handles execution errors by recording error results.
   * This is a stateless helper method used during tool calling loops.
   *
   * @param tool - The tool implementation to execute.
   * @param args - Parsed arguments for the tool.
   * @param toolCall - The tool call metadata (used for ID and name).
   * @param context - Optional debate context passed to the tool.
   * @param toolResultsForThisIteration - Array to add the result to for the current iteration.
   * @param allToolResults - Array to add the result to for the overall collection.
   */
  private executeTool(
    tool: ToolImplementation,
    args: Record<string, unknown>,
    toolCall: ToolCall,
    context: DebateContext | undefined,
    toolResultsForThisIteration: ToolResult[],
    allToolResults: ToolResult[]
  ): void {
    try {
      const resultJson = tool.execute(args, context);
      
      this.logMessage(`[${this.config.name}] Tool "${toolCall.name}" execution result: ${resultJson}`, true);
      // Create tool result in OpenAI format
      const toolResult: ToolResult = {
        tool_call_id: toolCall.id,
        role: CHAT_ROLES.TOOL,
        content: resultJson,
      };
      
      toolResultsForThisIteration.push(toolResult);
      allToolResults.push(toolResult);
    } catch (execError: any) {
      this.logMessage(`Warning: [${this.config.name}] Tool "${toolCall.name}" execution failed: ${execError.message}`, false);
      this.addToolErrorResult(toolCall.id, execError.message, toolResultsForThisIteration, allToolResults);
    }
  }

  /**
   * Helper method to call the underlying LLM provider with the specified prompts.
   * Measures latency and returns the generated text, usage statistics, and latency.
   * 
   * If tools are available, implements a tool calling loop that:
   * - Detects tool calls from LLM responses
   * - Executes tools and collects results
   * - Makes subsequent LLM calls with tool results
   * - Continues until no tool calls or limit reached
   *
   * @param systemPrompt - The system prompt to prime the LLM.
   * @param userPrompt - The user prompt representing the agent's request.
   * @param context - Optional debate context (needed for tools like context search).
   * @returns A Promise resolving to an AgentLLMResponse containing text, usage metadata, latency, and tool metadata.
   */
  protected async callLLM(systemPrompt: string, userPrompt: string, context?: DebateContext): Promise<AgentLLMResponse> {
    const started = Date.now();
    
    // Check if tools are available
    const hasTools = this.toolRegistry && this.toolRegistry.hasTools();
    
    if (!hasTools) {
      // No tools - use simple single-call logic
      return this.callLLMWithoutTools(systemPrompt, userPrompt, started);
    }

    // Tools available - implement tool calling loop
    const toolSchemas = this.toolRegistry!.getAllSchemas();
    let iterationCount = 0;
    let finalText = '';
    const allToolCalls: ToolCall[] = [];
    const allToolResults: ToolResult[] = [];
    const messages: ChatMessage[] = [
      { role: CHAT_ROLES.SYSTEM, content: systemPrompt },
      { role: CHAT_ROLES.USER, content: userPrompt },
    ];

    let shouldContinue = iterationCount < this.toolCallLimit;
    while (shouldContinue) {
      const result = await this.processToolCallIteration( systemPrompt, userPrompt, toolSchemas, messages,
                                                          context, iterationCount, allToolCalls, allToolResults );
      
      shouldContinue = result.shouldContinue;
      finalText = result.finalText;
      iterationCount = result.iterationCount;
    }

    const latencyMs = Date.now() - started;
    const response: AgentLLMResponse = {
      text: finalText,
      latencyMs,
      toolCallIterations: iterationCount, // Always include when tools are available
      ...(allToolCalls.length > 0 && { toolCalls: allToolCalls }),
      ...(allToolResults.length > 0 && { toolResults: allToolResults }),
    };

    return response;
  }
}


/**
 * Represents the response from an LLM call made by an agent.
 *
 * @property text - The main textual output generated by the LLM.
 * @property usage - (Optional) Token usage statistics for the LLM call.
 * @property latencyMs - The time taken (in milliseconds) to complete the LLM call.
 * @property toolCalls - (Optional) Array of tool calls made during this LLM interaction.
 * @property toolResults - (Optional) Array of tool results received during this LLM interaction.
 * @property toolCallIterations - (Optional) Number of tool call iterations performed.
 */
export interface AgentLLMResponse {
  text: string;
  usage?: CompletionUsage;
  latencyMs: number;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  toolCallIterations?: number;
}