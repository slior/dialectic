import { Agent } from '../core/agent';
import { JudgeAgent } from '../core/judge';
import { StateManager } from '../core/state-manager';
import { DebateConfig, DebateContext, DebateState } from '../types/debate.types';
import { TracingContext } from '../types/tracing.types';

import { DebateEvent } from './events';
import { NodeType } from './types';

/**
 * Context passed to nodes during execution.
 * Contains all necessary state and dependencies for node operations.
 */
export interface NodeContext {
  state: DebateState;
  config: DebateConfig;
  agents: Agent[];
  judge: JudgeAgent;
  stateManager: StateManager;
  preparedContexts?: Map<string, DebateContext>;
  tracingContext?: TracingContext;
  contextDirectory?: string;
}

/**
 * Result returned by a node after execution.
 * Contains the event to trigger transitions and optional context updates.
 */
export interface NodeResult {
  event: DebateEvent;
  updatedContext?: Partial<NodeContext>;
  /**
   * Applies the updated context to the given context, returning a new merged context.
   * If no updates are present, returns the original context unchanged.
   * 
   * @param context - The current node context to apply updates to.
   * @returns A new NodeContext with updates applied, or the original context if no updates.
   */
  applyToContext(context: NodeContext): NodeContext;
}

/**
 * Implementation of NodeResult that encapsulates creation logic.
 */
export class NodeResultImpl implements NodeResult {
  event: DebateEvent;
  updatedContext?: Partial<NodeContext>;

  private constructor(event: DebateEvent, updatedContext?: Partial<NodeContext>) {
    this.event = event;
    if (updatedContext !== undefined) {
      this.updatedContext = updatedContext;
    }
  }

  /**
   * Applies the updated context to the given context, returning a new merged context.
   * If no updates are present, returns the original context unchanged.
   * 
   * @param context - The current node context to apply updates to.
   * @returns A new NodeContext with updates applied, or the original context if no updates.
   */
  applyToContext(context: NodeContext): NodeContext {
    if (!this.updatedContext) {
      return context;
    }
    return { ...context, ...this.updatedContext };
  }

  /**
   * Creates a NodeResult instance.
   * 
   * @param event - The debate event to trigger transitions.
   * @param updatedContext - Optional partial context updates to merge into the current context.
   * @returns A NodeResult instance.
   */
  static createResult(event: DebateEvent, updatedContext?: Partial<NodeContext>): NodeResult {
    return new NodeResultImpl(event, updatedContext);
  }
}

/**
 * Base interface for all debate state machine nodes.
 * Each node represents a distinct phase or operation in the debate flow.
 */
export interface DebateNode {
  readonly nodeType: NodeType;
  execute(context: NodeContext): Promise<NodeResult>;
}
