# Thread - AI Agent System with Real-time Visualization

A full-stack application that combines an intelligent AI agent backend with a real-time visualization frontend. Watch as AI agents spawn, execute tasks, and collaborate to solve complex problems.

## 🌟 Features

- **Real-time Agent Visualization**: See your AI agents work in a beautiful tree structure
- **Multi-Agent System**: Agents can spawn sub-agents to explore parallel solutions
- **Human-in-the-Loop**: Agents can ask for clarification when needed
- **Python Tool Integration**: Agents can execute Python code with fork/wait capabilities
- **WebSocket Communication**: Instant updates as agents work
- **Streaming Responses**: See agent thoughts as they're generated

## 🏗️ Architecture

### Backend (Bun + TypeScript)
- WebSocket server on port 3001
- Sophisticated agent system with:
  - Clarification checks
  - Blocking questions when needed
  - Async subquestion generation
  - Python execution environment
  - Fork/wait for parallel agent execution

### Frontend (SolidJS + React Flow)
- Real-time visualization of agent tree
- Interactive node system
- User input handling
- Connection status monitoring

## 🚀 Quick Start

### Prerequisites
- [Bun](https://bun.sh/) (for backend)
- [Node.js](https://nodejs.org/) (for frontend)
- Anthropic API key

### Setup

1. **Clone and navigate to the project**
   ```bash
   cd thread
   ```

2. **Configure backend**
   ```bash
   cd backend
   cp .env.example .env  # If you have one
   # Edit .env and add your ANTHROPIC_API_KEY
   ```

3. **Install dependencies**
   ```bash
   # Backend
   cd backend
   bun install
   
   # Frontend
   cd ../frontend
   npm install
   ```

### Running

#### Option 1: Automated (Recommended)

**Linux/Mac:**
```bash
chmod +x start.sh
./start.sh
```

**Windows:**
```cmd
start.bat
```

#### Option 2: Manual

**Terminal 1 - Backend:**
```bash
cd backend
bun run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

## 📖 Usage

1. Open your browser to the frontend URL (usually `http://localhost:5173`)
2. Check that the connection indicator shows "Connected" (green dot)
3. Enter a prompt in the master node textbox
4. Watch as agents spawn and work on your request
5. If an agent needs input, it will show an orange border with a question
6. Type your response and press Enter
7. The final answer will be highlighted with a special badge

## 🎨 Visual Guide

### Node Status Colors
- 🔵 **Blue** - Running: Agent is actively working
- 🟢 **Green** - Completed: Agent finished successfully
- 🔴 **Red** - Error: Something went wrong
- 🟠 **Orange** - Awaiting User: Agent needs your input
- ⚪ **Gray** - Idle: Agent hasn't started yet

### Special Indicators
- **Thick green border + badge** - Final answer from master agent
- **Orange highlight** - Agent is waiting for user response
- **Animated edges** - Active data flow

## 🔧 Configuration

### Backend Environment Variables
```env
AI_MODEL=claude-3-5-haiku-20241022
ANTHROPIC_API_KEY=your_key_here
```

### Ports
- Backend WebSocket: `3001`
- Frontend Dev Server: Default Vite port (usually `5173`)

## 📡 Communication Protocol

See [INTEGRATION.md](./INTEGRATION.md) for detailed WebSocket message specifications.

### Key Message Types

**Frontend → Backend:**
- `start-agent` - Begin new agent with prompt
- `user-response` - Answer to agent's question
- `user-intervention` - Modify/delete agent

**Backend → Frontend:**
- `agent-state` - Agent status update
- `text-delta` - Streaming text chunk
- `user-query` - Agent asking for input
- `agent-completed` - All work finished

## 🛠️ Development

### Project Structure
```
thread/
├── backend/
│   ├── src/
│   │   ├── index.ts        # WebSocket server
│   │   ├── ai.ts           # Agent system
│   │   ├── agent.ts        # Simple agent
│   │   └── python.ts       # Python execution
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx         # Main app + WebSocket client
│   │   ├── components/
│   │   │   ├── AgentNode.tsx
│   │   │   ├── MasterNode.tsx
│   │   │   └── ReactFlowWrapper.tsx
│   │   └── types/
│   │       └── Node.ts
│   ├── package.json
│   └── vite.config.ts
├── INTEGRATION.md          # Technical integration docs
└── README.md               # This file
```

### Key Technologies
- **Backend**: Bun, TypeScript, Anthropic AI SDK, Zod
- **Frontend**: SolidJS, React Flow, TypeScript
- **Communication**: WebSocket (native Bun WebSocket)

## 🐛 Troubleshooting

### "WebSocket not connected"
- Ensure backend is running on port 3001
- Check for firewall/antivirus blocking WebSocket
- Verify `.env` has valid API key

### Agents not appearing
- Open browser DevTools console
- Check for WebSocket messages
- Verify backend logs show agent creation

### Text not streaming
- Confirm `text-delta` messages include `agentId`
- Check backend is properly forwarding chunks
- Verify frontend is handling messages

## 🤝 Contributing

This is a demonstration project showcasing real-time AI agent visualization. Feel free to:
- Report issues
- Suggest features
- Submit pull requests
- Fork and experiment

## 📝 License

See LICENSE file for details.

## 🙏 Acknowledgments

- Built with [Anthropic Claude](https://www.anthropic.com/)
- Visualization powered by [React Flow](https://reactflow.dev/)
- UI framework: [SolidJS](https://www.solidjs.com/)
- Runtime: [Bun](https://bun.sh/)

## 📚 Further Reading

- [INTEGRATION.md](./INTEGRATION.md) - Detailed WebSocket protocol
- [backend/AGENT_ARCHITECTURE.md](./backend/AGENT_ARCHITECTURE.md) - Agent system design
- [React Flow Docs](https://reactflow.dev/learn) - Visualization library
- [Anthropic AI SDK](https://github.com/anthropics/anthropic-sdk-typescript) - AI integration

---

**Built with ❤️ for exploring AI agent systems**
