# Agent Architecture Documentation

## Overview

The merged agent system combines TypeScript streaming AI with robust Python-inspired state management and human-in-the-loop controls.

## Key Features

### 1. **Global Agent Tree** (`AGENT_TREE`)
- Every agent gets a unique ID and is registered in a global map
- Tracks parent-child relationships for hierarchical agent spawning
- Enables live monitoring and intervention from external systems (e.g., frontend UI)
- Thread-safe operations for concurrent agent execution

### 2. **Human-in-the-Loop Control**

#### User Comment System
Each agent has a `userComment` field with values:
- `"unchanged"` - Normal execution
- `"delete"` - Agent stops and reports deletion
- `"modify"` - Agent content/behavior modified by user
- Custom text - User-provided annotations

#### User Intervention API
```typescript
await userIntervention(agentId, {
  userComment: "delete",
  userContent: "new instructions",
  status: "running"
});
```

### 3. **Robust 6-Step Workflow**

#### Step 1: Clarification Check
- AI determines if user input is ambiguous
- Blocks until user clarifies if needed
- Agent status: `"awaiting_user"`

#### Step 2: Synced (Blocking) Questions
- AI decides if critical information is missing
- Asks blocking questions before proceeding
- Maximum 3 iterations to prevent infinite loops
- User can decline to answer (agent completes gracefully)

#### Step 3: Async Subquestion Generation
- AI generates 0-4 independent subquestions
- Subquestions explored in parallel
- Each spawned as a child agent

#### Step 4: Parallel Execution
- Main agent executes with Python tool access
- Subagents run concurrently
- All agents have `fork()` and `wait()` capabilities

#### Step 5: User Intervention Check
- Continuously monitors `userComment` field
- Handles deletion, modification requests
- Non-blocking for normal operation

#### Step 6: Summary & Resolution
- Collects main answer + subagent results
- AI determines if more user input needed
- Final blocking question if uncertainties remain
- Comprehensive result with metadata

### 4. **Agent States**

```typescript
type AgentStatus = 
  | "running"        // Actively executing
  | "completed"      // Finished successfully
  | "deleted"        // User deleted
  | "modified"       // User modified
  | "error"          // Error occurred
  | "awaiting_user"; // Waiting for user input
```

### 5. **Fork/Wait System**

Preserved from original implementation:
- `fork(prompt)` spawns parallel agent, returns handle
- `wait(handle)` blocks until forked agent completes
- Accessible from Python code via agent tool

### 6. **Streaming Architecture**

All chunks yielded to caller:
- `{ type: "text-delta", textDelta: string }` - Incremental text
- `{ type: "agent-state", agentId, state }` - State updates
- `{ type: "tool-call", ... }` - Tool invocations
- Plus all standard AI SDK chunks

## API Reference

### Core Functions

#### `agent(input)`
Main agent generator function.

**Input:**
```typescript
{
  prompt?: string;           // Initial user prompt
  messages?: CoreMessage[];  // Or existing message history
  agentId?: string;          // Optional agent ID (auto-generated if omitted)
  parentId?: string | null;  // Parent agent ID for subagents
}
```

**Yields:** Stream of chunks including text deltas, tool calls, and agent state updates

**Returns:** Final result string

#### `getAgentTree()`
Returns snapshot of all active agents (without message history).

```typescript
const tree = getAgentTree();
// { 
//   "agent-123": { 
//     agentId, parentId, userContent, status, subagents, ... 
//   },
//   ...
// }
```

#### `getAgent(agentId)`
Get specific agent state including full message history.

#### `userIntervention(agentId, overrides)`
Modify agent state during execution.

```typescript
await userIntervention("agent-123", {
  userComment: "delete",      // Mark for deletion
  userContent: "new content", // Update content
  status: "modified"          // Change status
});
```

#### `setQueryUserHandler(handler)`
Register callback for user queries.

```typescript
setQueryUserHandler(async (agentId, prompt) => {
  // Display prompt to user in UI
  // Return user's response or null
  return await getUserInput(prompt);
});
```

## Usage Examples

### Basic Agent with User Interaction

```typescript
import { agent, setQueryUserHandler } from "./ai";

// Set up user interaction
setQueryUserHandler(async (agentId, prompt) => {
  console.log(`User Query: ${prompt}`);
  return "User's response";
});

// Run agent
const stream = agent({
  prompt: "Plan my birthday party"
});

for await (const chunk of stream) {
  if (chunk.type === "text-delta") {
    process.stdout.write(chunk.textDelta);
  }
}
```

### Live Agent Monitoring

```typescript
import { agent, getAgentTree } from "./ai";

// Start agent
const agentStream = agent({ prompt: "Complex task" });

// Monitor in parallel
setInterval(() => {
  const tree = getAgentTree();
  console.log("Active agents:", Object.keys(tree).length);
  
  for (const [id, state] of Object.entries(tree)) {
    console.log(`${id}: ${state.status} - ${state.userContent.slice(0, 50)}`);
  }
}, 1000);

// Consume stream
for await (const chunk of agentStream) {
  // Process chunks
}
```

### User Intervention During Execution

```typescript
import { agent, userIntervention, getAgentTree } from "./ai";

const stream = agent({ prompt: "Long running task" });

// User decides to delete a subagent after 5 seconds
setTimeout(async () => {
  const tree = getAgentTree();
  const subagents = Object.values(tree).filter(a => a.parentId);
  
  if (subagents.length > 0) {
    await userIntervention(subagents[0].agentId, {
      userComment: "delete"
    });
    console.log(`Deleted subagent ${subagents[0].agentId}`);
  }
}, 5000);

for await (const chunk of stream) {
  // Process chunks
}
```

### Python Fork/Wait Example

```typescript
const stream = agent({
  prompt: `Use Python to explore options:
  
  fork() - Create parallel exploration
  wait() - Get results
  
  Example:
  handles = [fork("Option A"), fork("Option B")]
  results = [wait(h) for h in handles]
  `
});
```

## Design Principles Implemented

### 1. Robustness
- ✅ Global state registry prevents lost agents
- ✅ Explicit error handling at each step
- ✅ Graceful degradation when user doesn't respond
- ✅ Maximum iteration limits prevent infinite loops
- ✅ Cleanup on completion/error

### 2. Human-in-the-Loop
- ✅ Multiple query points in workflow
- ✅ User can intervene at any time via `userIntervention()`
- ✅ Agent pauses with `"awaiting_user"` status
- ✅ User can delete/modify agents mid-execution
- ✅ Non-blocking queries don't freeze other agents

### 3. Flexibility
- ✅ Preserved original fork/wait system
- ✅ Streaming architecture for real-time updates
- ✅ Subagent spawning for parallel exploration
- ✅ Customizable user query handler
- ✅ Metadata tracking for custom extensions

## Integration with Frontend

The backend exposes these endpoints (to be implemented in `index.ts`):

```typescript
// WebSocket or SSE endpoint
app.get("/agent/stream", (req, res) => {
  const stream = agent({ prompt: req.query.prompt });
  // Stream chunks to client
});

// REST endpoints
app.get("/agent/tree", (req, res) => {
  res.json(getAgentTree());
});

app.post("/agent/:id/intervene", async (req, res) => {
  const success = await userIntervention(req.params.id, req.body);
  res.json({ success });
});

app.get("/agent/:id", (req, res) => {
  const agent = getAgent(req.params.id);
  res.json(agent || { error: "Not found" });
});
```

## Testing Strategy

1. **Unit Tests**: Test each decision function independently
2. **Integration Tests**: Test full 6-step workflow
3. **Concurrency Tests**: Spawn multiple agents simultaneously
4. **Intervention Tests**: Test user intervention during execution
5. **Error Recovery Tests**: Simulate failures at each step

## Future Enhancements

- [ ] Persistent agent storage (database)
- [ ] Agent execution history/replay
- [ ] Advanced user permission system
- [ ] Agent templates/presets
- [ ] Performance metrics and monitoring
- [ ] Rate limiting and resource management
- [ ] Agent-to-agent communication beyond fork/wait
