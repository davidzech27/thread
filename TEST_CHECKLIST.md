# Integration Test Checklist

Use this checklist to verify the frontend-backend integration is working correctly.

## Prerequisites
- [ ] Backend is running on port 3001
- [ ] Frontend is running (usually port 5173)
- [ ] Browser is open to frontend URL
- [ ] DevTools open (F12) for debugging

## Test 1: Connection ✅

**Steps:**
1. Open the frontend in browser
2. Look at the master node (top center)
3. Check connection indicator (top right of node)

**Expected:**
- [ ] Green dot visible
- [ ] Text says "Connected"
- [ ] Console shows: "Connected to WebSocket server"

**If failed:**
- Check backend is running
- Check WebSocket URL is correct
- Check browser console for errors

---

## Test 2: Simple Agent Execution ✅

**Steps:**
1. Type in master node: "Hello, who are you?"
2. Press Enter or click Submit
3. Watch the tree area

**Expected:**
- [ ] Agent node appears below master
- [ ] Node shows "RUNNING" status (blue border)
- [ ] Text starts appearing in the node
- [ ] Text streams word by word (not all at once)
- [ ] Node eventually turns green (COMPLETED)
- [ ] "✓ FINAL ANSWER" badge appears

**If failed:**
- Check browser console for messages
- Check DevTools → Network → WS for messages
- Check backend terminal for errors

---

## Test 3: User Query Handling ✅

**Steps:**
1. Type: "What's the weather like?" (intentionally vague)
2. Submit and wait for agent to ask for clarification
3. Node should turn orange
4. Input field should appear with question

**Expected:**
- [ ] Node turns orange border
- [ ] Status shows "AWAITING_USER"
- [ ] Question appears in node
- [ ] Input field is visible
- [ ] Can type in input field

**Steps to continue:**
5. Type: "Paris" in the input
6. Press Enter or click Send

**Expected:**
- [ ] Node turns blue again (RUNNING)
- [ ] Input field disappears
- [ ] Agent continues execution
- [ ] More text appears
- [ ] Eventually completes

**If failed:**
- Check user-query message in WebSocket
- Check user-response is sent
- Check agentId matches

---

## Test 4: Multiple Agents (Parallel Execution) ✅

**Steps:**
1. Type: "Compare Python and JavaScript for web development"
2. Submit and watch

**Expected:**
- [ ] Main agent node appears
- [ ] Text starts streaming
- [ ] Multiple child nodes may appear (subagents)
- [ ] Each node has its own content
- [ ] Parent-child relationships visible (arrows)
- [ ] All nodes eventually complete
- [ ] Final answer in main agent

**If failed:**
- Subagents may not spawn for all queries
- This is normal - AI decides when needed
- Try more complex queries

---

## Test 5: Error Handling ✅

**Steps:**
1. Stop the backend (Ctrl+C)
2. Try to submit a prompt
3. Watch connection indicator

**Expected:**
- [ ] Connection indicator turns red
- [ ] Text says "Disconnected"
- [ ] Submit doesn't work
- [ ] Console shows connection error

**Steps to continue:**
4. Restart backend
5. Refresh frontend page

**Expected:**
- [ ] Reconnects automatically (if implemented)
- [ ] OR shows "Disconnected" until refresh
- [ ] After refresh, green indicator returns

---

## Test 6: Complex Multi-Step Query ✅

**Steps:**
1. Type: "Help me plan a 3-day trip to Tokyo"
2. Submit and observe

**Expected:**
- [ ] Agent may ask clarifying questions
  - When are you going?
  - What's your budget?
  - What interests you?
- [ ] Each question appears in orange node
- [ ] Can respond to each question
- [ ] Agent may spawn subagents for:
  - Hotel recommendations
  - Restaurant suggestions
  - Activity planning
- [ ] Multiple nodes in tree
- [ ] All eventually complete
- [ ] Final comprehensive answer

---

## Test 7: Text Streaming Performance ✅

**Steps:**
1. Type: "Write a 500-word essay about AI"
2. Submit and observe text appearing

**Expected:**
- [ ] Text appears smoothly
- [ ] Not all at once (should stream)
- [ ] No lag or freezing
- [ ] Content area scrolls if needed
- [ ] UI remains responsive

**Performance:**
- Streaming should be visible (not instantaneous)
- Each chunk should appear within 100ms
- Total time depends on AI response time

---

## Test 8: Node Interaction ✅

**Steps:**
1. Submit any prompt
2. Wait for agent to appear
3. Click on the agent node
4. Observe visual changes

**Expected:**
- [ ] Node can be selected (visual feedback)
- [ ] Node content is readable
- [ ] Status is clear
- [ ] Can scroll content if long

---

## Test 9: Final Answer Display ✅

**Steps:**
1. Submit: "What is 2+2?"
2. Wait for completion
3. Observe final state

**Expected:**
- [ ] Node has green background
- [ ] Thicker border (4px vs 2px)
- [ ] "✓ FINAL ANSWER" badge visible
- [ ] Badge in top-right corner
- [ ] Green badge color
- [ ] Text says "4" or similar

---

## Test 10: Rapid Requests ✅

**Steps:**
1. Submit: "Hello"
2. Immediately after completion, submit: "What's your name?"
3. Then submit: "Tell me a joke"

**Expected:**
- [ ] Each request clears previous nodes
- [ ] New agent tree starts each time
- [ ] No overlap or confusion
- [ ] Each completes independently
- [ ] Final answer only on most recent

---

## Developer Checks ✅

### Backend Terminal
Look for these logs:
- [ ] "WebSocket server running on ws://localhost:3001"
- [ ] "Client connected" (when frontend connects)
- [ ] No error messages
- [ ] Agent creation logs

### Browser Console
Look for these messages:
- [ ] "Connected to WebSocket server"
- [ ] "Received: ..." for each message
- [ ] No error messages
- [ ] WebSocket connection active

### DevTools Network → WS
Click on the WebSocket connection:
- [ ] Status: 101 Switching Protocols
- [ ] Messages tab shows traffic
- [ ] Can see sent messages (green)
- [ ] Can see received messages (white)
- [ ] JSON is properly formatted

---

## Performance Benchmarks

Record these times for your system:

| Test | Expected | Actual |
|------|----------|--------|
| Connection time | < 1s | ___ |
| First agent appears | < 2s | ___ |
| Text starts streaming | < 3s | ___ |
| Simple query completion | 5-10s | ___ |
| Complex query completion | 15-30s | ___ |
| User query response time | < 1s | ___ |

---

## Troubleshooting Quick Reference

| Problem | Quick Fix |
|---------|-----------|
| Red connection indicator | Restart backend |
| No nodes appearing | Check browser console |
| Text not streaming | Check WebSocket messages |
| Stuck on orange | Try responding again |
| Backend crash | Check API key in .env |
| Frontend blank | Hard refresh (Ctrl+Shift+R) |

---

## Success Criteria ✅

All tests passing means:
- [x] WebSocket connection works
- [x] Agent creation works
- [x] Text streaming works
- [x] User queries work
- [x] Final answers display correctly
- [x] Multiple agents work
- [x] Error handling works

**Status: Ready for use! 🎉**

---

## Next Steps

Once all tests pass:
1. Try your own queries
2. Test edge cases
3. Experiment with complex prompts
4. Monitor performance
5. Provide feedback

## Known Issues

Document any issues you find:
- Issue: _______________
- Reproducible: Yes / No
- Workaround: _______________

---

**Last tested:** _______________
**Tested by:** _______________
**System:** _______________
**Result:** Pass / Fail
