# System Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Frontend (SolidJS + React Flow)            │ │
│  │                                                          │ │
│  │  ┌─────────────┐    ┌──────────────┐   ┌────────────┐ │ │
│  │  │ MasterNode  │───▶│   App.tsx    │──▶│ AgentNode  │ │ │
│  │  │  (Input)    │    │ (WebSocket)  │   │ (Display)  │ │ │
│  │  └─────────────┘    └──────┬───────┘   └────────────┘ │ │
│  │                             │                           │ │
│  └─────────────────────────────┼───────────────────────────┘ │
└─────────────────────────────────┼─────────────────────────────┘
                                  │ WebSocket
                                  │ ws://localhost:3001
                                  │
┌─────────────────────────────────┼─────────────────────────────┐
│                         Backend (Bun)                         │
│  ┌─────────────────────────────┼───────────────────────────┐ │
│  │              index.ts (WebSocket Server)                 │ │
│  │                             │                            │ │
│  │    ┌────────────────────────┼──────────────────────┐    │ │
│  │    │        Message Router                         │    │ │
│  │    │  • start-agent                                │    │ │
│  │    │  • user-response                              │    │ │
│  │    │  • user-intervention                          │    │ │
│  │    └───────────────────┬────────────────────────────┘    │ │
│  │                        │                                 │ │
│  └────────────────────────┼─────────────────────────────────┘ │
│                           │                                   │
│  ┌────────────────────────┼─────────────────────────────────┐ │
│  │              ai.ts (Agent System)                        │ │
│  │                        │                                 │ │
│  │    ┌───────────────────▼────────────────────┐           │ │
│  │    │          agent() Generator             │           │ │
│  │    │                                         │           │ │
│  │    │  Step 1: Clarification Check           │           │ │
│  │    │  Step 2: Blocking Questions            │           │ │
│  │    │  Step 3: Generate Subquestions         │           │ │
│  │    │  Step 4: Spawn Subagents (parallel)    │           │ │
│  │    │  Step 5: Execute Main Agent            │           │ │
│  │    │  Step 6: Summarize & Complete          │           │ │
│  │    │                                         │           │ │
│  │    └───────────────────┬─────────────────────┘           │ │
│  │                        │                                 │ │
│  │    ┌───────────────────▼─────────────────────┐           │ │
│  │    │       runMainAgent() Executor           │           │ │
│  │    │                                         │           │ │
│  │    │  • Python tool (python.ts)             │           │ │
│  │    │  • Fork/Wait system                    │           │ │
│  │    │  • Stream text chunks                  │           │ │
│  │    │                                         │           │ │
│  │    └───────────────────┬─────────────────────┘           │ │
│  └────────────────────────┼─────────────────────────────────┘ │
│                           │                                   │
│  ┌────────────────────────▼─────────────────────────────────┐ │
│  │              Anthropic Claude API                        │ │
│  │         (claude-3-5-haiku-20241022)                      │ │
│  └──────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. User Initiates Request

```
User types in MasterNode
        │
        ▼
Frontend (App.tsx)
  - Captures prompt
  - Clears existing nodes
        │
        ▼
WebSocket.send()
  {
    type: "start-agent",
    prompt: "..."
  }
```

### 2. Backend Processes Request

```
Backend (index.ts) receives message
        │
        ▼
Calls agent({ prompt })
        │
        ▼
ai.ts creates AgentState
  - Generates UUID
  - Registers in AGENT_TREE
  - Initializes messages
        │
        ▼
Yields agent-state chunk
  {
    type: "agent-state",
    agentId: "...",
    state: { status: "running", ... }
  }
        │
        ▼
WebSocket.send() to frontend
```

### 3. Agent Execution

```
agent() generator runs through steps
        │
        ├─▶ Step 1: Clarification?
        │   │  Yes → queryUser() → user-query message
        │   │         ↓
        │   │    Frontend shows input
        │   │         ↓
        │   │    User responds
        │   │         ↓
        │   │    user-response message
        │   │         ↓
        │   │    Agent continues
        │   └─ No → Continue
        │
        ├─▶ Step 2: Blocking Question?
        │   │  (Same flow as clarification)
        │   └─ Continue
        │
        ├─▶ Step 3: Generate Subquestions
        │   │  AI decides if parallel exploration needed
        │   └─ Returns 0-4 subquestions
        │
        ├─▶ Step 4: Spawn Subagents
        │   │  For each subquestion:
        │   │    - Create new agent() with parentId
        │   │    - Runs independently
        │   │    - Yields own chunks
        │   └─ Main agent continues in parallel
        │
        ├─▶ Step 5: Execute Main Agent
        │   │  runMainAgent(state)
        │   │    - Python tool available
        │   │    - Fork/wait for nested agents
        │   │    - Streams text-delta chunks
        │   │         │
        │   │         ▼
        │   │    Each chunk sent to frontend
        │   │         │
        │   │         ▼
        │   │    Frontend appends to node.content
        │   └─ Continues until complete
        │
        └─▶ Step 6: Summarize
            │  Collect subagent results
            │  AI summarizes everything
            │  Final question if needed?
            └─ Mark completed
                  │
                  ▼
            agent-completed message
                  │
                  ▼
            Frontend marks as final answer
```

## Component Interaction

### Frontend Components

```
┌───────────────────────────────────────────────────┐
│                    App.tsx                        │
│                                                   │
│  State:                                           │
│  • nodes: Node[]                                  │
│  • ws: WebSocket                                  │
│  • isConnected: boolean                           │
│                                                   │
│  Functions:                                       │
│  • updateAgentNode()    - Create/update nodes     │
│  • appendTextToAgent()  - Add streaming text      │
│  • handleUserResponse() - Send user input         │
│  • handleMasterSubmit() - Start new agent         │
│                                                   │
└─────────────┬─────────────────────┬───────────────┘
              │                     │
              ▼                     ▼
    ┌─────────────────┐   ┌──────────────────┐
    │   MasterNode    │   │    AgentNode     │
    │                 │   │                  │
    │  • Input field  │   │  • Status color  │
    │  • Submit btn   │   │  • Content area  │
    │  • Connection   │   │  • User prompt   │
    │    indicator    │   │  • Response input│
    └─────────────────┘   └──────────────────┘
```

### Backend Components

```
┌───────────────────────────────────────────────────┐
│                  index.ts                         │
│                                                   │
│  WebSocket Handlers:                              │
│  • open()    - Setup query handler                │
│  • message() - Route messages                     │
│  • close()   - Cleanup                            │
│                                                   │
└─────────────┬─────────────────────────────────────┘
              │
              ▼
┌───────────────────────────────────────────────────┐
│                    ai.ts                          │
│                                                   │
│  Exports:                                         │
│  • agent()               - Main generator         │
│  • setQueryUserHandler() - User input hook        │
│  • getAgentTree()        - State query            │
│  • userIntervention()    - Manual control         │
│                                                   │
│  Internal:                                        │
│  • AGENT_TREE            - Global state map       │
│  • runMainAgent()        - Execution engine       │
│  • decideSyncedQuestion()- AI decision helpers    │
│  • generateSubquestions()                         │
│  • summarizeWithAI()                              │
│                                                   │
└─────────────┬─────────────────────────────────────┘
              │
              ▼
┌───────────────────────────────────────────────────┐
│                  python.ts                        │
│                                                   │
│  Python execution environment:                    │
│  • Runs Python code in isolation                 │
│  • Captures stdout/stderr                        │
│  • Returns results                               │
│  • Supports fork/wait for nested agents          │
│                                                   │
└───────────────────────────────────────────────────┘
```

## Message Types Reference

### Frontend → Backend

| Type | Fields | Purpose |
|------|--------|---------|
| `start-agent` | `prompt` | Begin new agent |
| `user-response` | `agentId`, `response` | Answer question |
| `user-intervention` | `agentId`, `userComment`, `userContent`, `status` | Modify agent |
| `get-agent-tree` | none | Query state |

### Backend → Frontend

| Type | Fields | Purpose |
|------|--------|---------|
| `agent-state` | `agentId`, `state` | State update |
| `text-delta` | `agentId`, `delta` | Text chunk |
| `user-query` | `agentId`, `prompt` | Ask question |
| `agent-completed` | none | All done |
| `error` | `error` | Error occurred |

## State Management

### Backend State (AGENT_TREE)

```typescript
Map<agentId, AgentState>

AgentState:
  - agentId: string
  - parentId: string | null
  - status: AgentStatus
  - userContent: string
  - userComment: UserComment
  - subagents: string[]
  - messages: CoreMessage[]
  - result: string | null
  - metadata: Record<string, any>
  - createdAt: number
```

### Frontend State (nodes)

```typescript
Node[]: Hierarchical tree structure

Node:
  - id: string (matches backend agentId)
  - title: string
  - status: NodeStatus
  - parentId?: string
  - content?: string
  - userPrompt?: string
  - isFinalAnswer?: boolean
  - isSelected: boolean
  - isExpanded?: boolean
  - children?: Node[]
```

## Threading Model

```
Main Thread
    │
    ├─▶ WebSocket Connection (persistent)
    │
    ├─▶ Master Agent (async generator)
    │   │
    │   ├─▶ Subagent 1 (async generator)
    │   │   └─▶ Nested Agent (fork/wait)
    │   │
    │   ├─▶ Subagent 2 (async generator)
    │   │
    │   └─▶ Main Agent Execution
    │       └─▶ Python Tool (subprocess)
    │
    └─▶ Frontend Rendering (reactive)
        └─▶ React Flow Layout Engine
```

## Security Boundaries

```
┌─────────────────────────────────────┐
│           Public Internet           │
└─────────────────┬───────────────────┘
                  │
        ⚠️ No Authentication
        ⚠️ No Encryption (ws://)
                  │
┌─────────────────▼───────────────────┐
│           Frontend (Browser)        │
│  • User input validation needed     │
│  • XSS risks in text display        │
└─────────────────┬───────────────────┘
                  │ WebSocket
┌─────────────────▼───────────────────┐
│        Backend (Localhost)          │
│  • No input sanitization            │
│  • Python execution risks           │
│  • API key exposure in code         │
└─────────────────┬───────────────────┘
                  │ HTTPS
┌─────────────────▼───────────────────┐
│       Anthropic API (Secure)        │
└─────────────────────────────────────┘
```

## Performance Considerations

### Bottlenecks
1. **AI API calls** - Slowest (1-5s per request)
2. **Python execution** - Medium (100ms-1s)
3. **WebSocket transmission** - Fast (<10ms)
4. **Frontend rendering** - Fast (<50ms)

### Optimization Strategies
- Parallel subagent execution
- Streaming responses (perceived speed)
- Efficient tree updates (React Flow)
- WebSocket binary protocol (future)

## Scalability

### Current Limits
- **1 WebSocket** per frontend instance
- **1 backend** process (single-threaded)
- **No load balancing**
- **No horizontal scaling**

### Future Improvements
- Load balancer for multiple backends
- Redis for shared agent state
- Database for persistence
- Cluster mode for Bun
