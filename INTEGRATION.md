# Frontend-Backend Integration Guide

This document describes how the frontend and backend communicate via WebSocket to create a real-time AI agent visualization system.

## Architecture Overview

### Backend (Port 3001)
- WebSocket server built with Bun
- Streams agent states, text chunks, and user queries
- Handles user responses and interventions
- Located in: `backend/src/`

### Frontend (Port default Vite)
- SolidJS + React Flow visualization
- Connects to backend via WebSocket
- Displays agent tree with real-time updates
- Located in: `frontend/src/`

## Running the System

### 1. Start the Backend

```bash
cd backend
bun install
bun run dev
```

The backend will start on `ws://localhost:3001`

### 2. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will start on the default Vite port (usually `http://localhost:5173`)

## Communication Protocol

### Messages from Frontend to Backend

#### Start Agent
```json
{
  "type": "start-agent",
  "prompt": "User's initial prompt"
}
```

#### User Response (when agent asks for input)
```json
{
  "type": "user-response",
  "agentId": "uuid-of-agent",
  "response": "User's answer"
}
```

#### User Intervention
```json
{
  "type": "user-intervention",
  "agentId": "uuid-of-agent",
  "userComment": "delete|modify|custom text",
  "userContent": "optional new content",
  "status": "running|completed|etc"
}
```

### Messages from Backend to Frontend

#### Agent State Update
```json
{
  "type": "agent-state",
  "agentId": "uuid",
  "state": {
    "agentId": "uuid",
    "parentId": "parent-uuid or null",
    "status": "running|completed|awaiting_user|error|deleted|modified",
    "result": "final result text",
    "subagents": ["child-uuid-1", "child-uuid-2"],
    "metadata": {}
  }
}
```

#### Text Delta (streaming text)
```json
{
  "type": "text-delta",
  "agentId": "uuid",
  "delta": "chunk of text"
}
```

#### User Query (agent needs input)
```json
{
  "type": "user-query",
  "agentId": "uuid",
  "prompt": "Question for user"
}
```

#### Agent Completed
```json
{
  "type": "agent-completed"
}
```

## Features

### Real-time Agent Visualization
- Agents appear as nodes in a tree structure
- Status colors:
  - 🔵 Blue: Running
  - 🟢 Green: Completed
  - 🔴 Red: Error
  - 🟠 Orange: Awaiting User Input
  - ⚪ Gray: Idle

### User Input Handling
- When an agent needs input, the node shows an orange border
- A text input appears in the node with the question
- User types response and presses Enter or clicks Send
- Response is sent to backend and agent continues

### Final Answer Display
- When the master agent completes, it's marked with a special badge
- Thicker border and green background
- "✓ FINAL ANSWER" badge in the corner

### Text Streaming
- Agent responses stream in real-time
- Content appears in nodes as it's generated
- Smooth user experience with immediate feedback

## Node Information Display

Each agent node shows:
- **Title**: Agent identifier (first 8 chars of UUID)
- **Status**: Current state (RUNNING, COMPLETED, etc.)
- **Content**: The agent's text output (scrollable)
- **User Prompt**: Question if awaiting user input
- **Final Answer Badge**: If this is the master agent's final result

## Development Notes

### Backend Entry Point
`backend/src/index.ts` - WebSocket server setup

### Frontend Entry Point
`frontend/src/App.tsx` - WebSocket client and state management

### Agent System
`backend/src/ai.ts` - Core agent implementation with:
- Multi-step workflow (clarification, questions, subagents)
- Python tool execution
- Fork/wait system for parallel agents
- User intervention support

### Components
- `MasterNode.tsx` - Initial prompt input with connection indicator
- `AgentNode.tsx` - Individual agent display with user input support
- `ReactFlowWrapper.tsx` - React Flow container

## Environment Variables

### Backend (.env)
```
AI_MODEL=claude-3-5-haiku-20241022
ANTHROPIC_API_KEY=your_key_here
```

## Troubleshooting

### "WebSocket not connected" error
- Ensure backend is running on port 3001
- Check browser console for connection errors
- Verify no firewall blocking WebSocket connections

### Nodes not appearing
- Check browser console for incoming messages
- Verify agent-state messages include all required fields
- Check backend logs for agent creation

### Text not streaming
- Ensure text-delta messages include agentId
- Check that chunks are being forwarded from backend
- Verify frontend is handling text-delta messages

## Future Enhancements

- [ ] Reconnection logic if WebSocket drops
- [ ] Agent intervention UI (delete/modify buttons)
- [ ] Better error handling and display
- [ ] Agent execution history/timeline
- [ ] Export conversation/results
- [ ] Multi-user support
