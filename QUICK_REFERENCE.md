# Quick Reference Card

## 🚀 Starting the System

```bash
# Option 1: Automated
./start.sh          # Linux/Mac
start.bat           # Windows

# Option 2: Manual (2 terminals)
# Terminal 1
cd backend && bun run dev

# Terminal 2  
cd frontend && npm run dev
```

## 🔗 URLs

- **Backend WebSocket:** `ws://localhost:3001`
- **Frontend:** `http://localhost:5173` (or shown in terminal)

## 📡 WebSocket Messages

### Send from Frontend

```javascript
// Start new agent
ws.send(JSON.stringify({
  type: "start-agent",
  prompt: "Your question here"
}));

// Respond to agent query
ws.send(JSON.stringify({
  type: "user-response",
  agentId: "agent-uuid",
  response: "Your answer"
}));

// Intervene in agent
ws.send(JSON.stringify({
  type: "user-intervention",
  agentId: "agent-uuid",
  userComment: "delete", // or "modify"
  userContent: "new content",
  status: "running"
}));
```

### Receive in Frontend

```javascript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  // Agent state update
  if (data.type === "agent-state") {
    // data.agentId, data.state
  }
  
  // Text streaming
  if (data.type === "text-delta") {
    // data.agentId, data.delta
  }
  
  // Agent needs input
  if (data.type === "user-query") {
    // data.agentId, data.prompt
  }
  
  // All done
  if (data.type === "agent-completed") {
    // Mark final answer
  }
  
  // Error occurred
  if (data.type === "error") {
    // data.error
  }
};
```

## 🎨 Status Colors

| Status | Color | Meaning |
|--------|-------|---------|
| `idle` | Gray | Not started |
| `running` | Blue | Actively working |
| `completed` | Green | Finished successfully |
| `error` | Red | Something went wrong |
| `awaiting_user` | Orange | Waiting for input |

## 🔧 Environment Variables

### Backend `.env`

```bash
AI_MODEL=claude-3-5-haiku-20241022
ANTHROPIC_API_KEY=sk-ant-api03-...
```

## 📁 Key Files

### Backend
- `src/index.ts` - WebSocket server
- `src/ai.ts` - Agent system
- `src/agent.ts` - Simple agent
- `src/python.ts` - Python executor

### Frontend
- `src/App.tsx` - Main app + WebSocket
- `src/components/MasterNode.tsx` - Input
- `src/components/AgentNode.tsx` - Display
- `src/types/Node.ts` - Type definitions

## 🐛 Debug Commands

```bash
# Check port availability
lsof -i :3001           # Mac/Linux
netstat -ano | findstr :3001  # Windows

# Test WebSocket manually
npm install -g wscat
wscat -c ws://localhost:3001

# View backend logs
cd backend
bun run dev
# Watch for "Client connected"

# View frontend logs
# Open browser DevTools (F12)
# Check Console and Network → WS tabs
```

## 🎯 Common Tasks

### Add New Message Type

**Backend (index.ts):**
```typescript
if (data.type === "your-new-type") {
  // Handle message
  ws.send(JSON.stringify({
    type: "response",
    data: "..."
  }));
}
```

**Frontend (App.tsx):**
```typescript
if (data.type === "response") {
  // Handle response
}
```

### Modify Agent Behavior

**Backend (ai.ts):**
- Change `AI_MODEL` constant
- Modify step functions (clarification, questions, etc.)
- Adjust `maxSteps` in streamText calls
- Add new tools

### Style Changes

**Frontend (AgentNode.tsx):**
- Update `statusColors` object
- Modify node styles (border, padding, colors)
- Change badge appearance

**Frontend (MasterNode.tsx):**
- Adjust input styling
- Modify connection indicator

## 📊 Agent State Structure

```typescript
// Backend
interface AgentState {
  agentId: string;
  parentId: string | null;
  status: AgentStatus;
  userContent: string;
  userComment: UserComment;
  subagents: string[];
  messages: CoreMessage[];
  result: string | null;
  metadata: Record<string, any>;
  createdAt: number;
}

// Frontend
interface Node {
  id: string;
  title: string;
  status: NodeStatus;
  parentId?: string;
  content?: string;
  userPrompt?: string;
  isFinalAnswer?: boolean;
  isSelected: boolean;
  isExpanded?: boolean;
  children?: Node[];
}
```

## 🔄 Workflow Steps

1. **User Input** → Master node
2. **start-agent** → Backend
3. **agent-state** → Frontend (node created)
4. **text-delta** × N → Frontend (text streams)
5. **user-query** → Frontend (if needed)
6. **user-response** → Backend (if prompted)
7. **agent-state** → Frontend (status updates)
8. **agent-completed** → Frontend (final)

## 🎛️ Configuration Options

### Agent Behavior (ai.ts)
```typescript
// Model selection
const AI_MODEL = "claude-3-5-haiku-20241022";

// Max blocking questions
let maxSyncedQuestions = 3;

// Max subquestions
.slice(0, 4); // in generateAsyncSubquestions
```

### UI Layout (App.tsx)
```typescript
// Node spacing
const levelWidth = 350;  // horizontal
const levelHeight = 250; // vertical

// Master node position
position: { x: -170, y: -200 }
```

## 🧪 Test Commands

```bash
# Test backend only
cd backend
bun test

# Test frontend only  
cd frontend
npm test

# Manual WebSocket test
wscat -c ws://localhost:3001
> {"type":"start-agent","prompt":"test"}
```

## 📈 Performance Tips

1. **Reduce AI calls** - Cache responses when possible
2. **Limit subagents** - Adjust `slice(0, 4)` to lower number
3. **Optimize rendering** - Limit visible nodes
4. **Use faster model** - Switch to haiku for speed
5. **Batch updates** - Debounce frequent state changes

## 🔐 Security Checklist

- [ ] Never commit `.env` file
- [ ] Validate all user inputs
- [ ] Sanitize displayed content
- [ ] Use WSS in production
- [ ] Add authentication
- [ ] Implement rate limiting
- [ ] Use environment variables for secrets

## 🚨 Emergency Fixes

### Backend won't start
```bash
cd backend
rm -rf node_modules
bun install
```

### Frontend won't start
```bash
cd frontend
rm -rf node_modules node_modules/.vite
npm install
```

### Port in use
```bash
# Kill process on port 3001
lsof -i :3001 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

### WebSocket won't connect
1. Check backend is running
2. Check URL is `ws://localhost:3001`
3. Clear browser cache
4. Restart both services

## 📞 Support Resources

- **Integration Guide:** `INTEGRATION.md`
- **Architecture:** `ARCHITECTURE.md`
- **Troubleshooting:** `TROUBLESHOOTING.md`
- **Test Checklist:** `TEST_CHECKLIST.md`
- **Agent Docs:** `backend/AGENT_ARCHITECTURE.md`

## 💡 Pro Tips

1. Keep DevTools open while developing
2. Monitor WebSocket messages tab
3. Use `console.log` liberally
4. Test with simple prompts first
5. Watch backend terminal for errors
6. Hard refresh (Ctrl+Shift+R) often
7. Clear state between tests

## 🎓 Learning Path

1. ✅ Start both services
2. ✅ Submit simple prompt
3. ✅ Watch WebSocket messages
4. ✅ Trace code execution
5. ✅ Modify simple things
6. ✅ Add new features
7. ✅ Optimize performance
8. ✅ Deploy to production

---

**Keep this card handy!** 📌

Print it, bookmark it, or keep it open while developing.
