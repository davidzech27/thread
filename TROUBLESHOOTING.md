# Troubleshooting Guide

## Common Issues and Solutions

### 🔴 WebSocket Connection Issues

#### "WebSocket not connected" or red indicator

**Symptoms:**
- Red dot next to "Disconnected" in master node
- No agents appearing when you submit prompts
- Console error: `WebSocket connection failed`

**Solutions:**
1. **Check backend is running**
   ```bash
   # You should see: "WebSocket server running on ws://localhost:3001"
   cd backend
   bun run dev
   ```

2. **Check port 3001 is available**
   ```bash
   # Linux/Mac
   lsof -i :3001
   
   # Windows
   netstat -ano | findstr :3001
   ```

3. **Check firewall/antivirus**
   - Temporarily disable to test
   - Add exception for port 3001

4. **Check WebSocket URL**
   - Frontend should connect to `ws://localhost:3001`
   - If backend is on different machine, update URL

---

### 🤖 Agent Not Appearing

#### Prompt submitted but no nodes show up

**Symptoms:**
- Master node accepts input
- No agent nodes appear
- Nothing in the tree

**Solutions:**
1. **Check browser console (F12)**
   - Look for incoming WebSocket messages
   - Should see `agent-state` messages

2. **Check backend logs**
   - Should see "Client connected"
   - Should see agent creation logs

3. **Check API key**
   ```bash
   # In backend/.env
   ANTHROPIC_API_KEY=sk-ant-...
   ```

4. **Restart both services**
   ```bash
   # Kill both and restart
   ./start.sh  # or start.bat
   ```

---

### 📝 Text Not Streaming

#### Agent node appears but no content

**Symptoms:**
- Node shows "running" status
- No text appears in content area
- Status never changes

**Solutions:**
1. **Check for text-delta messages**
   - Open DevTools → Network → WS
   - Should see messages with `type: "text-delta"`

2. **Check agentId is present**
   - text-delta messages must have `agentId` field
   - Backend should attach this automatically

3. **Check backend AI model**
   - Ensure `AI_MODEL` is set correctly
   - Default: `claude-3-5-haiku-20241022`

4. **Check API quota**
   - You might have hit rate limits
   - Check Anthropic dashboard

---

### ⏳ Agent Stuck "Awaiting User"

#### Orange node won't proceed

**Symptoms:**
- Node turns orange
- Shows input prompt
- Never proceeds even after input

**Solutions:**
1. **Check response is sent**
   - Open DevTools → Network → WS
   - Send a response and look for `user-response` message

2. **Check agentId matches**
   - Response must have correct agentId
   - Should match the waiting agent

3. **Try clicking in node first**
   - Ensures focus is correct
   - Then type and press Enter

4. **Refresh page and retry**
   - Last resort
   - Will lose current session

---

### 💥 Backend Crashes

#### Backend terminal shows errors and exits

**Common Errors:**

#### "Cannot find module"
```bash
cd backend
bun install
```

#### "ANTHROPIC_API_KEY not set"
```bash
# Create/edit backend/.env
echo "ANTHROPIC_API_KEY=your_key_here" > .env
```

#### "Port 3001 already in use"
```bash
# Linux/Mac
lsof -i :3001
kill -9 <PID>

# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

#### "Python execution failed"
- Python tool requires Python installed
- Check `python3` or `python` is in PATH
- Install if missing

---

### 🎨 Frontend Issues

#### Frontend won't start

**Symptoms:**
- `npm run dev` fails
- Build errors

**Solutions:**
1. **Install dependencies**
   ```bash
   cd frontend
   rm -rf node_modules
   npm install
   ```

2. **Check Node version**
   ```bash
   node --version  # Should be 16+
   ```

3. **Clear Vite cache**
   ```bash
   rm -rf node_modules/.vite
   npm run dev
   ```

#### Nodes not displaying correctly

**Solutions:**
1. **Hard refresh browser**
   - Ctrl+Shift+R (Windows/Linux)
   - Cmd+Shift+R (Mac)

2. **Clear browser cache**

3. **Check browser console for errors**

4. **Try different browser**
   - Chrome/Edge recommended
   - Firefox should work
   - Safari may have issues

---

### 🔄 Changes Not Reflecting

#### Code changes don't appear

**Backend:**
- Bun should hot-reload automatically
- If not, restart: `bun run dev`

**Frontend:**
- Vite should hot-reload automatically
- If not, restart: `npm run dev`
- Hard refresh browser

---

### 📊 Performance Issues

#### Slow or laggy UI

**Solutions:**
1. **Limit agent depth**
   - Deep trees (10+ levels) can slow rendering
   - Consider simpler prompts

2. **Clear old nodes**
   - Submit new prompt to clear tree
   - Refresh page

3. **Check system resources**
   - Backend can use significant CPU during AI calls
   - Monitor with `top` or Task Manager

4. **Reduce concurrent agents**
   - Subquestion generation creates multiple agents
   - May overwhelm system

---

### 🐛 Debugging Tips

#### Enable verbose logging

**Backend:**
Add console logs in `backend/src/index.ts`:
```typescript
websocket: {
  message(ws, message) {
    console.log('Received:', message);
    // ... rest of code
  }
}
```

**Frontend:**
Check DevTools console, should see:
- "Connected to WebSocket server"
- "Received: ..." for each message

#### Monitor WebSocket

1. Open DevTools (F12)
2. Go to Network tab
3. Filter by "WS" (WebSocket)
4. Click on connection
5. View "Messages" tab
6. See all messages in real-time

#### Test Backend Independently

```bash
# Install wscat
npm install -g wscat

# Connect to backend
wscat -c ws://localhost:3001

# Send test message
> {"type":"start-agent","prompt":"Hello"}

# Should see responses streaming
```

---

### 🆘 Still Having Issues?

1. **Collect information:**
   - Browser console errors (F12)
   - Backend terminal output
   - WebSocket messages (DevTools → Network → WS)
   - Your environment (OS, Node version, Bun version)

2. **Try minimal test:**
   ```bash
   # Fresh start
   cd backend
   rm -rf node_modules
   bun install
   bun run dev
   
   # New terminal
   cd frontend
   rm -rf node_modules
   npm install
   npm run dev
   ```

3. **Check requirements:**
   - Bun installed and working
   - Node.js 16+ installed
   - Valid Anthropic API key
   - Stable internet connection
   - No VPN/proxy issues

4. **Last resort:**
   - Clone fresh copy of repo
   - Follow setup instructions exactly
   - Try on different machine

---

## Getting Help

When reporting issues, include:
- ✅ What you expected to happen
- ✅ What actually happened
- ✅ Browser console errors
- ✅ Backend terminal output
- ✅ Steps to reproduce
- ✅ Your environment details

## Quick Health Check

Run this checklist:
- [ ] Backend starts without errors
- [ ] Frontend starts without errors
- [ ] Browser shows "Connected" (green)
- [ ] WebSocket messages visible in DevTools
- [ ] Submitting prompt creates agent nodes
- [ ] Text appears in agent nodes
- [ ] Can respond to user queries
- [ ] Final answer displays correctly

If all checked, system is working correctly! ✅
