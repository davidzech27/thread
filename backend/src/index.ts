import { agent, setQueryUserHandler, getAgentTree, userIntervention } from "./ai";

// WebSocket server
const server = Bun.serve({
  port: 3001,
  
  async fetch(req, server) {
    // Handle CORS
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Upgrade to WebSocket
    if (server.upgrade(req)) {
      return; // Upgraded successfully
    }

    return new Response("Expected WebSocket connection", { status: 400 });
  },
  
  websocket: {
    open(ws) {
      console.log("Client connected");
      
      // Setup query user handler
      setQueryUserHandler(async (agentId: string, prompt: string) => {
        return new Promise((resolve) => {
          // Send query to frontend
          ws.send(JSON.stringify({
            type: "user-query",
            agentId,
            prompt,
          }));

          // Store resolver for this agent
          (ws as any).queryResolvers = (ws as any).queryResolvers || new Map();
          (ws as any).queryResolvers.set(agentId, resolve);
        });
      });
    },

    async message(ws, message) {
      try {
        const data = JSON.parse(message as string);

        if (data.type === "start-agent") {
          // Start a new agent with the given prompt
          const { prompt } = data;
          
          const agentStream = agent({ prompt });
          
          for await (const chunk of agentStream) {
            // Forward all chunks to the client
            ws.send(JSON.stringify(chunk));
          }
          
          // Send completion message
          ws.send(JSON.stringify({
            type: "agent-completed",
          }));
        }
        
        else if (data.type === "user-response") {
          // User responded to a query
          const { agentId, response } = data;
          
          const resolvers = (ws as any).queryResolvers;
          if (resolvers && resolvers.has(agentId)) {
            const resolve = resolvers.get(agentId);
            resolve(response);
            resolvers.delete(agentId);
          }
        }
        
        else if (data.type === "user-intervention") {
          // User wants to intervene in an agent
          const { agentId, userComment, userContent, status } = data;
          
          await userIntervention(agentId, {
            userComment,
            userContent,
            status,
          });
          
          ws.send(JSON.stringify({
            type: "intervention-success",
            agentId,
          }));
        }
        
        else if (data.type === "get-agent-tree") {
          // Send current agent tree state
          const tree = getAgentTree();
          ws.send(JSON.stringify({
            type: "agent-tree",
            tree,
          }));
        }
      } catch (error: any) {
        console.error("WebSocket error:", error);
        ws.send(JSON.stringify({
          type: "error",
          error: error.message,
        }));
      }
    },

    close(ws) {
      console.log("Client disconnected");
      
      // Clean up any pending queries
      const resolvers = (ws as any).queryResolvers;
      if (resolvers) {
        for (const resolve of resolvers.values()) {
          resolve(null); // Cancel pending queries
        }
        resolvers.clear();
      }
    },
  },
});

console.log(`WebSocket server running on ws://localhost:${server.port}`);
