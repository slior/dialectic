# Context Summarization - Design Documentation

## Overview

The context summarization feature manages debate history length by allowing agents to condense their perspective-based history when it grows large. This prevents context window limitations while preserving critical insights for multi-round debates. The judge agent also supports summarization during synthesis to manage the final round's content size.

### Purpose

As debates progress through multiple rounds, the conversation history grows. Without summarization:
- Agents would eventually hit LLM context window limits
- Token costs would increase unnecessarily
- Irrelevant historical details would clutter the context

Context summarization solves this by letting each agent create concise summaries of their relevant history, reducing context size while preserving key information.

---

## Core Behavior

### What Gets Summarized

Each agent summarizes **only their perspective** of the debate:
- **Their proposals**: All proposals made by this agent across rounds
- **Critiques they received**: Only critiques targeting this agent's proposals (not critiques of other agents)
- **Their refinements**: All refinements made by this agent in response to feedback

This perspective-based filtering ensures agents summarize only information relevant to their future contributions.

### When Summarization Occurs

Summarization happens **at the beginning of each round**, before the proposal phase:

1. **Evaluation**: Each agent calculates the total character count of their perspective-based history
2. **Decision**: If the count exceeds the configured threshold (default: 5000 characters), summarization is triggered
3. **Generation**: The agent calls an LLM to create a concise summary (max length: 2500 characters by default)
4. **Storage**: The summary and metadata are persisted in the debate state
5. **Usage**: The agent uses the summary instead of full history for subsequent debate phases in this round

**Judge Summarization**: The judge also performs summarization during the synthesis phase if the final round's proposals and refinements exceed the threshold. This provides a focused view of the most recent solution attempts for synthesis.

### How It Works

```
Round N starts
↓
For each agent:
  └─> Calculate character count of agent's perspective
      ├─> Below threshold? → Use full history (no summarization)
      └─> Above threshold? → Generate summary
          ├─> Filter history to agent's perspective
          ├─> Call LLM with summarization prompt
          ├─> Store summary with metadata
          └─> Use summary for this round's debate phases

Synthesis phase starts
↓
Judge:
  └─> Calculate character count of final round's proposals and refinements
      ├─> Below threshold? → Use full history for synthesis
      └─> Above threshold? → Generate summary
          ├─> Filter to final round's proposals and refinements
          ├─> Call LLM with judge-specific summarization prompt
          ├─> Store summary in DebateState.judgeSummary
          └─> Use summary for synthesis prompt
```

---

## Architecture & Design Decisions

### Design Choice 1: Hybrid Architecture

**Decision**: Combine centralized summarization strategies with agent-owned decision-making.

**Rationale**:
- **Agent Autonomy**: Each agent decides independently when to summarize based on their own history and thresholds
- **Centralized Strategy**: Summarization logic is implemented via a pluggable `ContextSummarizer` interface, allowing different strategies to be swapped in
- **Best of Both**: Agents control "when" and "what" to summarize; strategies control "how" to summarize

**Implementation**:
- `ContextSummarizer` interface defines the contract for summarization strategies
- `LengthBasedSummarizer` is the current implementation (triggers on character count threshold)
- Future strategies (semantic, hierarchical, RAG-based) can be added without changing agent code

### Design Choice 2: Per-Round Fresh Summaries

**Decision**: Recalculate summaries from full history each round, rather than maintaining incremental summaries.

**Rationale**:
- **Simplicity**: No need to manage running summary state or handle incremental updates
- **Accuracy**: Each summary is fresh and comprehensive, avoiding accumulation of errors or omissions
- **Flexibility**: Changing summary parameters or prompts affects all future summaries immediately
- **Debugging**: Easier to understand and debug since each summary is independent

**Trade-off**: Slight redundancy in LLM calls (re-summarizing some content), but the simplicity and accuracy gains outweigh the cost.

### Design Choice 3: Perspective-Based Filtering

**Decision**: Each agent filters history to their own perspective before summarizing.

**Rationale**:
- **Relevance**: Agents only need information relevant to their future contributions
- **Efficiency**: Smaller input to summarization LLM = faster and cheaper
- **Privacy**: Agents don't need to see critiques of other agents
- **Scalability**: Character count grows linearly with agent's own activity, not with total debate size

**Example**: In a debate with 3 agents and 5 rounds, the architect agent would summarize:
- Their 5 proposals
- Critiques they received (not critiques of performance or security agents)
- Their 5 refinements

### Design Choice 4: Two-Level Configuration

**Decision**: Support both system-wide and per-agent configuration, with agent settings overriding system settings.

**Rationale**:
- **Convenience**: System-wide defaults apply to all agents (DRY principle)
- **Flexibility**: Individual agents can override with custom settings
- **Use Cases**:
  - Architect might need higher threshold (longer context for design decisions)
  - Security might need lower threshold (focus on recent threats)
  - Some agents can disable summarization entirely

**Implementation**:
```json
{
  "debate": {
    "summarization": {
      "enabled": true,
      "threshold": 5000,
      "maxLength": 2500,
      "method": "length-based"
    }
  },
  "agents": [
    {
      "id": "agent-architect",
      "summarization": {
        "threshold": 8000  // Override: architect gets more context
      }
    }
  ]
}
```

### Design Choice 5: Storage in Debate Rounds and State

**Decision**: Store agent summaries as a `Record<string, DebateSummary>` within each `DebateRound`, keyed by agent ID. Store judge summaries separately in `DebateState.judgeSummary`.

**Rationale**:
- **Auditability**: Full history of what was summarized, when, and by whom
- **Debugging**: Can trace exactly what context each agent saw in each round
- **Reproducibility**: Complete debate state includes all summarization decisions
- **Metadata**: Capture timing, token usage, and compression ratios for analysis
- **Agent Isolation**: Each agent's summary is easily accessible by their ID without mixing data
- **Efficient Lookup**: O(1) access to an agent's summary in any round
- **Judge Separation**: Judge summaries are stored separately since they're used for synthesis, not per-round context

**Structure**:
```typescript
interface DebateRound {
  roundNumber: number;
  contributions: Contribution[];
  summaries?: Record<string, DebateSummary>;  // Keyed by agentId
  timestamp: Date;
}

interface DebateState {
  id: string;
  problem: string;
  context?: string;
  status: DebateStatus;
  currentRound: number;
  rounds: DebateRound[];
  finalSolution?: Solution;
  judgeSummary?: DebateSummary;  // Judge's synthesis summary
  createdAt: Date;
  updatedAt: Date;
  promptSources?: {
    agents: AgentPromptMetadata[];
    judge: JudgePromptMetadata;
  };
}

interface DebateSummary {
  agentId: string;
  agentRole: AgentRole;
  summary: string;  // The actual summary text sent to LLM
  metadata: {
    beforeChars: number;
    afterChars: number;
    method: string;
    timestamp: Date;
    latencyMs?: number;
    tokensUsed?: number;
  };
}
```

**Usage Example**:
```typescript
// Storing an agent summary
round.summaries = {};
round.summaries[agent.id] = summary;

// Storing a judge summary
state.judgeSummary = summary;

// Retrieving an agent summary
const agentSummary = round.summaries?.[agentId];

// Retrieving a judge summary
const judgeSummary = state.judgeSummary;
```

---

## System Components

### Component Interaction

```
┌─────────────────────────────────────────────────────────┐
│                    DebateOrchestrator                   │
│  - Coordinates debate flow                              │
│  - Calls summarizationPhase() before proposal phase     │
│  - Calls judge.prepareContext() before synthesis        │
│  - Passes prepared contexts to debate phases            │
└────────────┬────────────────────────────┬───────────────┘
             │                            │
             ▼                            ▼
    ┌────────────────┐          ┌─────────────────┐
    │  RoleBasedAgent│          │  StateManager   │
    │  - shouldSummarize()      │  - addSummary() │
    │  - prepareContext()       │  - addJudgeSummary() │
    └────────┬───────┘          └─────────────────┘
             │
             ▼
    ┌─────────────────────────┐
    │  ContextSummarizer      │
    │  (Strategy Interface)   │
    └────────┬────────────────┘
             │
             ▼
    ┌─────────────────────────┐
    │ LengthBasedSummarizer   │
    │  - summarize()          │
    │  - Calls LLM            │
    └─────────────────────────┘
             ▲
             │
    ┌─────────────────────────┐
    │      JudgeAgent         │
    │  - shouldSummarize()    │
    │  - prepareContext()     │
    │  - getFinalRoundRelevantContent() │
    └─────────────────────────┘
```

### 1. Orchestrator (`src/core/orchestrator.ts`)

**Responsibilities**:
- Coordinate debate flow across rounds
- Execute summarization phase before each proposal phase
- Call judge context preparation before synthesis phase
- Pass prepared contexts (with or without summaries) to agents

**Key Methods**: 

`summarizationPhase(state: DebateState, roundNumber: number)`
```typescript
// Simplified implementation
async summarizationPhase(state, roundNumber) {
  const baseContext = this.buildContext(state);
  const preparedContexts = new Map();
  
  for (const agent of this.agents) {
    // Let agent decide and prepare context
    const result = await agent.prepareContext(baseContext, roundNumber);
    
    if (result.summary) {
      // Store summary in debate state (keyed by agentId)
      await this.stateManager.addSummary(state.id, result.summary);
      // Notify progress UI
      this.hooks?.onSummarizationComplete?.(/*...*/);
    }
    
    // Note: prepareContext returns the same context (no modification)
    // Summaries are looked up later when formatting prompts
    preparedContexts.set(agent.config.id, result.context);
  }
  
  return preparedContexts;
}
```

`synthesisPhase(state: DebateState)`
```typescript
// Simplified implementation
async synthesisPhase(state) {
  // Prepare judge context with potential summarization
  const result = await this.judge.prepareContext(state.rounds);
  
  // Store judge summary if one was created
  if (result.summary) {
    await this.stateManager.addJudgeSummary(state.id, result.summary);
  }
  
  const ctx = this.buildContext(state);
  const solution = await this.judge.synthesize(state.problem, state.rounds, ctx);
  return solution;
}
```

**Design Rationale**: The orchestrator doesn't make summarization decisions—it just coordinates the process. This keeps agent autonomy while ensuring consistent execution order.

### 2. RoleBasedAgent (`src/agents/role-based-agent.ts`)

**Responsibilities**:
- Decide when to summarize based on threshold
- Filter history to agent's perspective
- Generate summaries via `ContextSummarizer`
- Manage summarization configuration

**Key Methods**:

**`shouldSummarize(context: DebateContext): boolean`**
```typescript
// Simplified implementation
shouldSummarize(context) {
  if (!this.summaryConfig.enabled) return false;
  if (!context.history) return false;
  
  // Calculate character count of agent's perspective
  let totalChars = 0;
  for (const round of context.history) {
    for (const contribution of round.contributions) {
      if (this.isRelevantToMe(contribution)) {
        totalChars += contribution.content.length;
      }
    }
  }
  
  return totalChars >= this.summaryConfig.threshold;
}
```

**`prepareContext(context: DebateContext, roundNumber: number)`**
```typescript
// Simplified implementation
async prepareContext(context, roundNumber) {
  // Should we summarize?
  if (!this.shouldSummarize(context)) {
    return { context };  // Return original context unchanged
  }
  
  // Filter history to my perspective
  const myHistory = this.filterToMyPerspective(context.history);
  
  // Generate summary
  const result = await this.summarizer.summarize(
    myHistory,
    this.config.role,
    this.summaryConfig,
    this.resolvedSystemPrompt,
    this.resolvedSummaryPrompt
  );
  
  // Build summary object for storage
  const summary = {
    agentId: this.config.id,
    agentRole: this.config.role,
    summary: result.summary,  // The actual text
    metadata: result.metadata
  };
  
  // Return original context + summary for persistence
  // Summary will be looked up from rounds when formatting prompts
  return { context, summary };
}
```

**Design Rationale**: The agent encapsulates all summarization logic—the orchestrator just calls `prepareContext()` and handles the result. The context is not modified; summaries are stored separately and retrieved when needed for prompt formatting. This prevents data mixing between agents.

### 3. JudgeAgent (`src/core/judge.ts`)

**Responsibilities**:
- Decide when to summarize final round content for synthesis
- Filter final round to proposals and refinements only
- Generate summaries using judge-specific prompts
- Use summaries in synthesis prompt building

**Key Methods**:

**`shouldSummarize(rounds: DebateRound[]): boolean`**
```typescript
// Simplified implementation
shouldSummarize(rounds) {
  if (!this.summaryConfig.enabled) return false;
  if (!rounds || rounds.length === 0) return false;
  
  const finalRound = rounds[rounds.length - 1];
  const relevantContent = this.getFinalRoundRelevantContent(rounds);
  
  return relevantContent.length >= this.summaryConfig.threshold;
}
```

**`getFinalRoundRelevantContent(rounds: DebateRound[]): string`**
```typescript
// Simplified implementation
getFinalRoundRelevantContent(rounds) {
  const finalRound = rounds[rounds.length - 1];
  if (!finalRound) return '';
  
  const relevantContributions = finalRound.contributions.filter(c => 
    c.type === 'proposal' || c.type === 'refinement'
  );
  
  return relevantContributions.map(c => c.content).join('\n\n');
}
```

**`prepareContext(rounds: DebateRound[]): Promise<ContextPreparationResult>`**
```typescript
// Simplified implementation
async prepareContext(rounds) {
  if (!this.shouldSummarize(rounds)) {
    return { context: { problem: '', history: rounds } };
  }
  
  try {
    const relevantContent = this.getFinalRoundRelevantContent(rounds);
    const summaryPrompt = this.buildSummaryPrompt(relevantContent);
    
    const result = await this.summarizer.summarize(
      relevantContent,
      'generalist', // Judge role
      this.summaryConfig,
      this.systemPrompt,
      summaryPrompt
    );
    
    const summary = {
      agentId: this.config.id,
      agentRole: 'generalist',
      summary: result.summary,
      metadata: result.metadata
    };
    
    return { context: { problem: '', history: rounds }, summary };
  } catch (error) {
    console.error('Judge summarization failed:', error);
    return { context: { problem: '', history: rounds } };
  }
}
```

**Design Rationale**: The judge uses the same summarization infrastructure as agents but focuses specifically on final round content. This provides a focused view of the most recent solution attempts for synthesis while maintaining consistency with the overall summarization architecture.

### 4. ContextSummarizer (`src/utils/context-summarizer.ts`)

**Responsibilities**:
- Define interface for summarization strategies
- Implement length-based summarization
- Call LLM with appropriate prompts
- Measure and return metadata

**Interface**:
```typescript
interface ContextSummarizer {
  summarize(
    content: string,
    role: AgentRole,
    config: SummarizationConfig,
    systemPrompt: string,
    summaryPrompt: string
  ): Promise<SummarizationResult>;
}
```

**Current Implementation**: `LengthBasedSummarizer`
- Uses LLM to generate summaries when content exceeds threshold
- Truncates to `maxLength` if needed
- Captures timing and token usage metadata

**Design Rationale**: The interface separates "what to summarize" (agent's responsibility) from "how to summarize" (strategy's responsibility). This makes it easy to add new strategies.

### 5. StateManager (`src/core/state-manager.ts`)

**Responsibilities**:
- Persist summaries to disk as part of debate state
- Maintain summary history per round (keyed by agent ID)
- Ensure atomic saves

**Key Methods**: 

`addSummary(debateId: string, summary: DebateSummary)`
```typescript
async addSummary(debateId, summary) {
  const state = this.debates.get(debateId);
  const round = state.rounds[state.currentRound - 1];
  
  // Initialize summaries Record if needed
  if (!round.summaries) {
    round.summaries = {};
  }
  
  // Store summary by agentId
  round.summaries[summary.agentId] = summary;
  await this.save(state);
}
```

`addJudgeSummary(debateId: string, summary: DebateSummary)`
```typescript
async addJudgeSummary(debateId, summary) {
  const state = this.debates.get(debateId);
  if (!state) throw new Error(`Debate ${debateId} not found`);

  state.judgeSummary = summary;
  state.updatedAt = new Date();
  await this.save(state);
}
```

**Design Rationale**: Storing summaries in rounds (not agents) provides a complete audit trail and enables debugging/analysis of summarization behavior over time. Keying by agent ID provides efficient, isolated access to each agent's summary.

### 6. Context Formatter (`src/utils/context-formatter.ts`)

**Responsibilities**:
- Format debate context for inclusion in LLM prompts
- Retrieve agent-specific summaries from debate history
- Fall back to full history if no summary exists

**Key Function**: `formatContextSection(context: DebateContext, agentId: string)`
```typescript
// Simplified implementation
function formatContextSection(context, agentId) {
  if (!context?.history || context.history.length === 0) {
    return '';  // No history
  }
  
  // Search backwards through rounds to find this agent's most recent summary
  for (let i = context.history.length - 1; i >= 0; i--) {
    const round = context.history[i];
    const agentSummary = round.summaries?.[agentId];
    
    if (agentSummary) {
      // Found summary - format it for prompt
      return `=== Previous Debate Context ===\n\n` +
             `[SUMMARY from Round ${round.roundNumber}]\n` +
             `${agentSummary.summary}\n\n` +
             `===================================\n\n`;
    }
  }
  
  // No summary found - fall back to full history
  return `=== Previous Debate Rounds ===\n\n` +
         `${formatHistory(context.history)}\n\n` +
         `===================================\n\n`;
}
```

**Usage in Prompts**:
```typescript
// In role prompt implementations
proposePrompt: (problem: string, context?: DebateContext, agentId?: string) => {
  const basePrompt = `Problem to solve:\n${problem}\n\n...`;
  return prependContext(basePrompt, context, agentId);
}
```

**Design Rationale**: 
- **Backward Search**: Looking from most recent round backwards ensures we get the freshest summary
- **Isolation**: Each agent only sees their own summary, preventing data mixing
- **Graceful Fallback**: If no summary exists, full history is used automatically
- **Transparent**: Role prompt implementations don't need to know about summary logic

---

## Configuration & Customization

### Configuration Levels

1. **System-Wide** (`debate.summarization` in config file):
   - Default settings for all agents
   - Applied unless overridden

2. **Per-Agent** (`AgentConfig.summarization`):
   - Agent-specific overrides
   - Merged with system-wide settings

### Configuration Fields

```typescript
interface SummarizationConfig {
  enabled: boolean;      // Enable/disable summarization
  threshold: number;     // Character count threshold
  maxLength: number;     // Max summary length
  method: string;        // Summarization method
  promptPath?: string;   // Optional custom prompt file
}
```

**Defaults**:
- `enabled: true`
- `threshold: 5000` characters
- `maxLength: 2500` characters
- `method: 'length-based'`

### Custom Summary Prompts

**Per-Agent Prompt** (`AgentConfig.summaryPromptPath`):
```json
{
  "agents": [
    {
      "id": "agent-architect",
      "summaryPromptPath": "./prompts/architect-summary.md"
    }
  ]
}
```

**System-Wide Prompt** (`debate.summarization.promptPath`):
```json
{
  "debate": {
    "summarization": {
      "promptPath": "./prompts/generic-summary.md"
    }
  }
}
```

**Fallback Behavior**:
1. Use `summaryPromptPath` if specified (per-agent)
2. Fall back to `summarization.promptPath` if specified (system-wide)
3. Fall back to role-specific built-in prompt
4. If file read fails, warn user and use built-in prompt

**Prompt Resolution**: Follows same pattern as `systemPromptPath` (see `src/utils/prompt-loader.ts`)

---

## Extension Points & Future Strategies

### Current Strategy: Length-Based

**Trigger**: Character count exceeds threshold  
**Method**: LLM-based summarization with role-specific prompts  
**Output**: Concise summary within max length

### Future Strategy 1: Semantic Summarization

**Concept**: Summarize based on semantic similarity rather than raw length.

**Design**:
```typescript
class SemanticSummarizer implements ContextSummarizer {
  async summarize(content, role, config, systemPrompt, summaryPrompt) {
    // 1. Embed contributions using embedding model
    // 2. Cluster by semantic similarity
    // 3. Identify representative contributions per cluster
    // 4. Summarize cluster representatives
    // 5. Return hierarchical summary
  }
}
```

**Configuration**:
```json
{
  "summarization": {
    "method": "semantic",
    "semanticThreshold": 0.8,  // Similarity threshold
    "embeddingModel": "text-embedding-ada-002"
  }
}
```

### Future Strategy 2: Hierarchical Summarization

**Concept**: Multi-level summaries (contribution → round → phase → overall).

**Design**:
```typescript
class HierarchicalSummarizer implements ContextSummarizer {
  async summarize(content, role, config, systemPrompt, summaryPrompt) {
    // 1. Summarize individual contributions
    // 2. Summarize round-level (combine contribution summaries)
    // 3. Summarize phase-level (proposals, critiques, refinements)
    // 4. Create overall summary from phase summaries
  }
}
```

**Benefits**:
- Granular summaries at different levels
- Can query specific round/phase summaries
- Better preservation of chronological structure

### Future Strategy 3: RAG-Based Summarization

**Concept**: Store full history in vector database, retrieve relevant context on-demand.

**Design**:
```typescript
class RAGSummarizer implements ContextSummarizer {
  async summarize(content, role, config, systemPrompt, summaryPrompt) {
    // 1. Store contributions in vector DB
    // 2. When needed, query DB for relevant contributions
    // 3. Return retrieved context as "summary"
  }
}
```

**Benefits**:
- No information loss (full history preserved)
- Dynamic retrieval based on current context
- Can adjust retrieval criteria per query

### Extensibility Pattern

**Adding a New Strategy**:

1. **Implement Interface**:
```typescript
class MyCustomSummarizer implements ContextSummarizer {
  constructor(private provider: LLMProvider, private customConfig: any) {}
  
  async summarize(
    content: string,
    role: AgentRole,
    config: SummarizationConfig,
    systemPrompt: string,
    summaryPrompt: string
  ): Promise<SummarizationResult> {
    // Your custom logic
  }
}
```

2. **Update Agent Factory** (`RoleBasedAgent.create()`):
```typescript
if (summaryConfig.enabled) {
  if (summaryConfig.method === 'length-based') {
    this.summarizer = new LengthBasedSummarizer(provider);
  } else if (summaryConfig.method === 'semantic') {
    this.summarizer = new SemanticSummarizer(provider, semanticConfig);
  } else if (summaryConfig.method === 'my-custom') {
    this.summarizer = new MyCustomSummarizer(provider, customConfig);
  }
}
```

3. **Add Configuration**:
```typescript
// In src/types/debate.types.ts
export const SUMMARIZATION_METHODS = {
  LENGTH_BASED: 'length-based',
  SEMANTIC: 'semantic',
  MY_CUSTOM: 'my-custom',
} as const;
```

**No Changes Needed To**:
- Orchestrator (it just calls `agent.prepareContext()`)
- StateManager (it just stores results)
- CLI (it just passes configuration)

---

## Implementation Details

### Data Flow

```
1. Orchestrator.summarizationPhase()
   └─> For each agent:
       └─> Agent.prepareContext(baseContext, roundNumber)
           ├─> Agent.shouldSummarize(baseContext)
           │   └─> Calculate character count
           │   └─> Compare to threshold
           │   └─> Return true/false
           │
           ├─> If false: return { context: baseContext }
           │
           └─> If true:
               ├─> Filter history to perspective
               ├─> Join into text
               ├─> ContextSummarizer.summarize(text, ...)
               │   └─> Call LLM
               │   └─> Capture metadata
               │   └─> Return summary + metadata
               ├─> Build DebateSummary object (agentId + summary text + metadata)
               ├─> Return { context: baseContext, summary: debateSummary }
               │   (Note: context is NOT modified)
               │
2. Orchestrator receives result
   ├─> If summary exists: StateManager.addSummary(summary)
   │   └─> StateManager: round.summaries[agentId] = summary
   ├─> Store prepared context (unmodified)
   │
3. Orchestrator.proposalPhase()
   └─> For each agent:
       └─> Agent.propose(problem, context)
           └─> rolePrompts.proposePrompt(problem, context, agentId)
               └─> prependContext(basePrompt, context, agentId)
                   └─> formatContextSection(context, agentId)
                       └─> Search backwards in context.history
                           └─> Find round.summaries[agentId]
                               ├─> Found? Prepend summary to prompt
                               └─> Not found? Prepend full history (or nothing)
           └─> Send formatted prompt to LLM

4. Orchestrator.critiquePhase() / refinementPhase()
   └─> Same pattern: context + agentId → backward search → agent's summary

5. Orchestrator.synthesisPhase()
   └─> Judge.prepareContext(rounds)
       ├─> Judge.shouldSummarize(rounds)
       │   └─> Calculate character count of final round proposals/refinements
       │   └─> Compare to threshold
       │   └─> Return true/false
       │
       ├─> If false: return { context: { problem: '', history: rounds } }
       │
       └─> If true:
           ├─> Judge.getFinalRoundRelevantContent(rounds)
           │   └─> Filter final round to proposals and refinements only
           ├─> ContextSummarizer.summarize(relevantContent, ...)
           │   └─> Call LLM with judge-specific summary prompt
           │   └─> Capture metadata
           │   └─> Return summary + metadata
           ├─> Build DebateSummary object (judgeId + summary text + metadata)
           ├─> Return { context: { problem: '', history: rounds }, summary: debateSummary }
           │
   ├─> If judge summary exists: StateManager.addJudgeSummary(summary)
   │   └─> StateManager: state.judgeSummary = summary
   │
   └─> Judge.synthesize(problem, rounds, context)
       └─> Judge.buildSynthesisPrompt(problem, rounds)
           └─> If summarization was used: include only final round's key contributions
           └─> If no summarization: include all rounds with full history
       └─> Send formatted prompt to LLM
```

### Character Count Calculation

**For Agents**: The agent counts characters from:
- **Own proposals**: `contribution.type === 'proposal' && contribution.agentId === this.config.id`
- **Received critiques**: `contribution.type === 'critique' && contribution.targetAgentId === this.config.id`
- **Own refinements**: `contribution.type === 'refinement' && contribution.agentId === this.config.id`

**For Judge**: The judge counts characters from:
- **Final round proposals**: `contribution.type === 'proposal'` from the last round
- **Final round refinements**: `contribution.type === 'refinement'` from the last round
- **Excludes critiques**: Judge does not include critiques in its summarization

**Why character count?**
- Simple and deterministic
- Works across all LLM providers
- Easy to configure and understand
- Good proxy for context size

**Alternative considered**: Token count
- **Rejected because**: Token counting is provider-specific and requires tokenizer overhead
- **Future option**: Could add token-based thresholds as an alternative method

### Error Handling

**Summarization Failure**:
```typescript
try {
  const result = await this.summarizer.summarize(/*...*/);
  const summary = { agentId, agentRole, summary: result.summary, metadata };
  return { context, summary };  // context unchanged
} catch (error) {
  // Log warning to stderr
  process.stderr.write(`Warning: Summarization failed. Falling back to full history.\n`);
  // Return original context (graceful degradation)
  return { context };
}
```

**Missing Summarizer**:
```typescript
if (!this.summarizer) {
  process.stderr.write(`Warning: Summarization enabled but no summarizer available.\n`);
  return { context };
}
```

**Design Rationale**: Summarization is an optimization, not a requirement. Failures should never break the debate—always fall back to full history.

---

## Trade-offs & Design Rationale

### Trade-off 1: Fresh Summaries vs. Incremental Updates

**Choice**: Fresh summaries each round

**Pros**:
- Simpler implementation (no state management)
- No accumulation of errors
- Easy to change summary parameters
- Easier debugging

**Cons**:
- Redundant LLM calls (re-summarizing some content)
- Slightly higher token cost

**Rationale**: Simplicity and accuracy are more valuable than marginal token savings. Most debates are short (3-5 rounds), so redundancy is minimal.

### Trade-off 2: Perspective-Based vs. Full History

**Choice**: Each agent summarizes only their perspective

**Pros**:
- More relevant summaries
- Smaller input to LLM (faster, cheaper)
- Better privacy/separation
- Scales better (O(agent activity) not O(total activity))

**Cons**:
- Agents might miss broader context
- More complex filtering logic

**Rationale**: Agents work best when focused on their role-specific context. Full history would dilute relevant information with irrelevant critiques of other agents.

### Trade-off 3: Round Storage vs. Agent Storage

**Choice**: Store summaries in `DebateRound.summaries[]`

**Pros**:
- Complete audit trail
- Easy to debug (see exactly what each agent saw when)
- Reproducible (can replay debate with same contexts)
- Enables analysis (compression ratios, effectiveness)

**Cons**:
- Larger state files
- More data to persist each round

**Rationale**: Debugging and auditability are critical for a debate system. The extra storage cost is minimal compared to the value of complete provenance.

### Trade-off 4: Configuration Flexibility vs. Simplicity

**Choice**: Two-level configuration (system + agent)

**Pros**:
- Flexible (customize per agent or use defaults)
- DRY (define once, apply everywhere)
- Gradual adoption (enable for some agents first)

**Cons**:
- More complex configuration
- Merging logic required

**Rationale**: Real-world usage demands flexibility. Different agents have different context needs—architect needs more context than security. Two-level config supports both simple and advanced use cases.

---

## References

### Code

- **Orchestrator**: `src/core/orchestrator.ts` (lines 179-217: `summarizationPhase()`, lines 219-235: `synthesisPhase()`)
- **Agent**: `src/agents/role-based-agent.ts` (lines 210-338: `shouldSummarize()`, `prepareContext()`)
- **Judge**: `src/core/judge.ts` (lines 45-120: `shouldSummarize()`, `prepareContext()`, `getFinalRoundRelevantContent()`)
- **Summarizer**: `src/utils/context-summarizer.ts` (lines 49-99: `LengthBasedSummarizer`)
- **State Manager**: `src/core/state-manager.ts` (lines 261-275: `addSummary()`, lines 277-285: `addJudgeSummary()`)
- **Judge Prompts**: `src/agents/prompts/judge-prompts.ts` (judge-specific summary prompts)
- **CLI Integration**: `src/cli/commands/debate.ts` (lines 152-211: agent factory with summarization, judge creation with summarization)

### Documentation

- **User Guide**: `README.md` (lines 207-213: Context Summarization section)
- **Configuration**: `docs/configuration.md` (lines 301-520: Context Summarization Configuration)
- **Flow Diagram**: `docs/debate_flow.md` (lines 130-200: Summarization phase sequence)

### Tests

- **Summarizer Tests**: `tests/context-summarizer.spec.ts`
- **Agent Tests**: `tests/role-based-agent-summary.spec.ts`
- **Orchestrator Tests**: `tests/orchestrator-summary.spec.ts`
- **State Tests**: `tests/state-manager.spec.ts` (summarization section)
- **Config Tests**: `tests/config-loading.spec.ts` (summarization section)
- **Prompt Tests**: `tests/summary-prompts.spec.ts`
- **Judge Tests**: `tests/orchestrator.spec.ts` (updated with judge summarization)

---

## Summary

The context summarization feature provides **automatic, configurable, and extensible** management of debate history:

- **Automatic**: Agents and judge decide when to summarize based on thresholds
- **Configurable**: Two-level configuration (system + agent) with custom prompts
- **Extensible**: Pluggable strategies via `ContextSummarizer` interface

**Key Design Principles**:
1. **Agent Autonomy**: Agents control their own summarization decisions
2. **Judge Integration**: Judge uses same summarization infrastructure for synthesis
3. **Graceful Degradation**: Failures fall back to full history (never break debate)
4. **Complete Provenance**: All summaries persisted with metadata for debugging
5. **Simple First**: Start with length-based, design for future strategies
6. **Separation of Concerns**: "When/what" (agent/judge) vs "how" (strategy) vs "coordination" (orchestrator)

**Judge-Specific Features**:
- Summarizes only final round's proposals and refinements (excludes critiques)
- Uses judge-specific summary prompts for synthesis-focused summarization
- Stores summaries separately in `DebateState.judgeSummary` for synthesis context
- Integrates seamlessly with existing summarization infrastructure

The architecture balances simplicity for current needs with extensibility for future enhancements, ensuring the feature can evolve as new summarization techniques emerge.

