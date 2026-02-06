import { Agent, AgentLogger } from '../core/agent';
import { JudgeAgent } from '../core/judge';
import { OrchestratorHooks } from '../core/orchestrator';
import { StateManager } from '../core/state-manager';
import { DebateConfig, AgentClarifications, DebateState, ExecutionResult, EXECUTION_STATUS, SUSPEND_REASON } from '../types/debate.types';
import { TracingContext } from '../types/tracing.types';

import { DEBATE_EVENTS } from './events';
import { TransitionGraph } from './graph';
import { DebateNode, NodeContext } from './node';
import { ClarificationInputNode } from './nodes/clarification-input-node';
import { ClarificationNode } from './nodes/clarification-node';
import { CritiqueNode } from './nodes/critique-node';
import { EvaluationNode } from './nodes/evaluation-node';
import { InitializationNode } from './nodes/initialization-node';
import { ProposalNode } from './nodes/proposal-node';
import { RefinementNode } from './nodes/refinement-node';
import { RoundManagerNode } from './nodes/round-manager-node';
import { SummarizationNode } from './nodes/summarization-node';
import { SynthesisNode } from './nodes/synthesis-node';
import { NODE_TYPES, NodeType } from './types';

/**
 * State machine-based orchestrator that coordinates multi-round debates using an event-driven architecture.
 * 
 * This orchestrator maintains the same API as DebateOrchestrator for backward compatibility,
 * but uses a state machine architecture internally for more flexible flow control.
 */
export class StateMachineOrchestrator {
  private graph: TransitionGraph;
  private nodes: Map<NodeType, DebateNode>;
  private tracingContext?: TracingContext;
  private contextDirectory?: string;

  constructor(
    private agents: Agent[],
    private judge: JudgeAgent,
    private stateManager: StateManager,
    private config: DebateConfig,
    private hooks?: OrchestratorHooks,
    tracingContext?: TracingContext,
    contextDirectory?: string,
    logger?: AgentLogger
  ) {
    this.graph = new TransitionGraph(undefined, logger);
    this.nodes = this.createNodes();
    if (tracingContext !== undefined) {
      this.tracingContext = tracingContext;
    }
    if (contextDirectory !== undefined) {
      this.contextDirectory = contextDirectory;
    }
  }

  /**
   * Creates all node instances for the state machine.
   */
  private createNodes(): Map<NodeType, DebateNode> {
    const nodes = new Map<NodeType, DebateNode>();
    nodes.set(NODE_TYPES.INITIALIZATION, new InitializationNode());
    nodes.set(NODE_TYPES.CLARIFICATION, new ClarificationNode());
    nodes.set(NODE_TYPES.CLARIFICATION_INPUT, new ClarificationInputNode());
    nodes.set(NODE_TYPES.ROUND_MANAGER, new RoundManagerNode(this.hooks));
    nodes.set(NODE_TYPES.SUMMARIZATION, new SummarizationNode(this.hooks));
    nodes.set(NODE_TYPES.PROPOSAL, new ProposalNode(this.hooks));
    nodes.set(NODE_TYPES.CRITIQUE, new CritiqueNode(this.hooks));
    nodes.set(NODE_TYPES.REFINEMENT, new RefinementNode(this.hooks));
    nodes.set(NODE_TYPES.EVALUATION, new EvaluationNode());
    nodes.set(NODE_TYPES.SYNTHESIS, new SynthesisNode(this.hooks));
    return nodes;
  }

  /**
   * Creates a NodeContext from the given state and instance properties.
   * 
   * @param state - The debate state to include in the context.
   * @returns A NodeContext object with all required properties.
   */
  private createNodeContext(state: DebateState): NodeContext {
    return {
      state,
      config: this.config,
      agents: this.agents,
      judge: this.judge,
      stateManager: this.stateManager,
      ...(this.tracingContext !== undefined && { tracingContext: this.tracingContext }),
      ...(this.contextDirectory !== undefined && { contextDirectory: this.contextDirectory }),
    };
  }


  /**
   * Verifies that a node is present in the graph for the given node type.
   *
   * @param node - The node from the graph (may be undefined if not registered).
   * @param nodeType - The node type key, used in the error message when node is missing.
   * @returns The same node, narrowed to non-null `DebateNode`.
   * @throws {Error} If `node` is null or undefined.
   */
  private verifyNode(node: DebateNode | undefined, nodeType: NodeType): DebateNode {
    if (!node) {
      throw new Error(`Node not found: ${nodeType}`);
    }
    return node;
  }

  /**
   * Verifies that a debate state is present. Use after loading state from the state manager.
   *
   * @param state - The state to verify (may be null or undefined if not found).
   * @param debateId - The debate ID, used in the error message when state is missing.
   * @param messageSuffix - Optional suffix for the error message (e.g. `' after suspend'`).
   * @returns The same state, narrowed to non-null `DebateState`.
   * @throws {Error} If `state` is null or undefined.
   */
  private verifyState( state: DebateState | null | undefined, debateId: string, messageSuffix?: string ): DebateState {
    if (!state) {
      throw new Error(`Debate ${debateId} not found${messageSuffix ?? ''}`);
    }
    return state;
  }

  /**
   * Validates the final debate state after completion.
   * Ensures the state exists and has a final solution.
   * 
   * @param debateId - The ID of the debate to validate.
   * @returns The validated DebateState with a final solution.
   * @throws {Error} If the debate state is not found or missing a final solution.
   */
  private async validateFinalState(debateId: string): Promise<DebateState> {
    const finalState = this.verifyState(
      await this.stateManager.getDebate(debateId),
      debateId,
      ' after completion'
    );

    if (!finalState.finalSolution) {
      throw new Error(`Debate ${debateId} completed without final solution`);
    }

    return finalState;
  }

  /**
   * Runs the debate, potentially suspending for human input.
   * 
   * @param problem - The problem statement to debate.
   * @param context - Optional additional context for agents and judge.
   * @param clarifications - Optional clarifications collected before the debate.
   * @param debateId - Optional debate ID. If provided, uses this ID instead of generating a new one.
   * @returns ExecutionResult that may be completed or suspended.
   */
  async runDebate(
    problem: string,
    context?: string,
    clarifications?: AgentClarifications[],
    debateId?: string
  ): Promise<ExecutionResult> {
    // Create initial debate state
    const state = await this.stateManager.createDebate(problem, context, debateId);
    // Only set clarifications if they exist and are non-empty
    // Empty array means no clarifications needed, same as undefined
    if (clarifications && clarifications.length > 0 && clarifications.some(c => c.items.length > 0)) {
      await this.stateManager.setClarifications(state.id, clarifications);
    }

    return this.executeFromNode(state.id, NODE_TYPES.INITIALIZATION);
  }

  /**
   * Resumes a suspended debate with provided answers.
   * 
   * @param debateId - The ID of the suspended debate.
   * @param answers - The clarification answers provided by the user.
   * @returns ExecutionResult that may be completed or suspended again.
   * @throws {Error} If the debate is not found or not suspended.
   */
  async resume( debateId: string, answers: AgentClarifications[] ): Promise<ExecutionResult> {
    const state = this.verifyState(await this.stateManager.getDebate(debateId), debateId);

    if (!state.suspendedAtNode) {
      throw new Error(`Debate ${debateId} is not suspended`);
    }

    await this.stateManager.setClarifications(debateId, answers);
    
    const nodeToResume = state.suspendedAtNode as NodeType;
    await this.stateManager.clearSuspendState(debateId);

    //TODO: is it better to emit an event to the graph instead of calling executeFromNode directly?
    return this.executeFromNode(debateId, nodeToResume); // Resume from the suspended node (ClarificationInputNode)
  }

  /**
   * Core execution loop - runs until terminal, suspended, or error.
   * 
   * @param debateId - The ID of the debate to execute.
   * @param startNode - The node type to start execution from.
   * @returns ExecutionResult indicating completion or suspension.
   */
  private async executeFromNode( debateId: string, startNode: NodeType ): Promise<ExecutionResult> 
  {
    let state = this.verifyState(await this.stateManager.getDebate(debateId), debateId);

    let nodeContext = this.createNodeContext(state);
    let currentNode: NodeType | null = startNode;

    while (currentNode !== null) {
      const node = this.verifyNode(this.nodes.get(currentNode), currentNode);

      const result = await node.execute(nodeContext);

      // Check for suspend event
      if (result.event.type === DEBATE_EVENTS.WAITING_FOR_INPUT) {
        // Persist suspend state
        await this.stateManager.setSuspendState(debateId, currentNode, new Date());
        
        // Refresh state to get updated clarifications
        const updatedState = this.verifyState(
          await this.stateManager.getDebate(debateId),
          debateId,
          ' after suspend'
        );

        return {
          status: EXECUTION_STATUS.SUSPENDED,
          suspendReason: SUSPEND_REASON.WAITING_FOR_INPUT,
          suspendPayload: {
            debateId: updatedState.id,
            questions: updatedState.clarifications ?? [],
            iteration: updatedState.clarificationIterations ?? 1,
          },
        };
      }

      // Update context
      nodeContext = result.applyToContext(nodeContext);
      
      // Refresh state from manager
      const updatedState = await this.stateManager.getDebate(debateId);
      if (updatedState) {
        nodeContext.state = updatedState;
        state = updatedState;
      }

      // Transition to next node
      const nextNode = this.graph.getNextNode(currentNode, result.event, nodeContext);
      
      // If we're transitioning to terminal (null), this means synthesis completed
      // Refresh state one more time to ensure we have the latest with finalSolution
      if (nextNode === null) {
        const terminalState = await this.stateManager.getDebate(debateId);
        if (terminalState && terminalState.finalSolution) {
          state = terminalState;
        }
      }
      
      currentNode = nextNode;
    }

    // Terminal state reached - validate that we have a final solution
    const finalState = await this.validateFinalState(debateId);
    
    return {
      status: EXECUTION_STATUS.COMPLETED,
      result: {
        debateId: finalState.id,
        solution: finalState.finalSolution!,
        rounds: finalState.rounds,
        metadata: {
          totalRounds: finalState.rounds.length,
          durationMs: Date.now() - finalState.createdAt.getTime(),
        },
      },
    };
  }
}
