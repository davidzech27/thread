import { streamText, tool } from "ai";
import type { CoreMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import python from "./python";
import { randomUUID } from "crypto";

// ============================================================================
// CONFIGURATION
// ============================================================================

const AI_MODEL = process.env.AI_MODEL || "claude-3-5-haiku-20241022";

// ============================================================================
// TYPES & STATE
// ============================================================================

type AgentStatus = "running" | "completed" | "deleted" | "modified" | "error" | "awaiting_user";
type UserComment = "unchanged" | "delete" | "modify" | string;

interface AgentState {
  agentId: string;
  parentId: string | null;
  userContent: string;
  userComment: UserComment;
  status: AgentStatus;
  subagents: string[];
  messages: CoreMessage[];
  result: string | null;
  metadata: Record<string, any>;
  createdAt: number;
}

interface UserQuery {
  agentId: string;
  prompt: string;
  resolve: (response: string | null) => void;
  reject: (error: Error) => void;
}

// Global agent tree registry
const AGENT_TREE = new Map<string, AgentState>();
const PENDING_USER_QUERIES = new Map<string, UserQuery>();

// ============================================================================
// USER INTERACTION HOOKS (to be implemented by frontend)
// ============================================================================

let queryUserHandler: ((agentId: string, prompt: string) => Promise<string | null>) | null = null;

export function setQueryUserHandler(handler: (agentId: string, prompt: string) => Promise<string | null>) {
  queryUserHandler = handler;
}

async function queryUser(agentId: string, prompt: string): Promise<string | null> {
  if (!queryUserHandler) {
    console.warn(`[queryUser] No handler set for agent ${agentId}, returning null`);
    return null;
  }
  
  const state = AGENT_TREE.get(agentId);
  if (state) {
    state.status = "awaiting_user";
  }
  
  try {
    return await queryUserHandler(agentId, prompt);
  } finally {
    if (state && state.status === "awaiting_user") {
      state.status = "running";
    }
  }
}

// ============================================================================
// AGENT TREE OPERATIONS
// ============================================================================

export function getAgentTree(): Record<string, Omit<AgentState, "messages">> {
  const snapshot: Record<string, any> = {};
  for (const [id, state] of AGENT_TREE.entries()) {
    snapshot[id] = {
      agentId: state.agentId,
      parentId: state.parentId,
      userContent: state.userContent,
      userComment: state.userComment,
      status: state.status,
      subagents: state.subagents,
      result: state.result,
      metadata: state.metadata,
      createdAt: state.createdAt,
    };
  }
  return snapshot;
}

export function getAgent(agentId: string): AgentState | undefined {
  return AGENT_TREE.get(agentId);
}

export async function userIntervention(
  agentId: string,
  overrides: {
    userComment?: UserComment;
    userContent?: string;
    status?: AgentStatus;
  }
): Promise<boolean> {
  const state = AGENT_TREE.get(agentId);
  if (!state) {
    return false;
  }

  if (overrides.userComment !== undefined) {
    state.userComment = overrides.userComment;
  }
  if (overrides.userContent !== undefined) {
    state.userContent = overrides.userContent;
  }
  if (overrides.status !== undefined) {
    state.status = overrides.status;
  }

  return true;
}

// ============================================================================
// AI DECISION HELPERS
// ============================================================================

async function decideNeedsClarification(content: string): Promise<boolean> {
  // Simple heuristic: check for ambiguous language
  const ambiguousMarkers = ["?", "unclear", "not sure", "maybe", "possibly"];
  return ambiguousMarkers.some(marker => content.toLowerCase().includes(marker));
}

async function decideSyncedQuestion(content: string, messages: CoreMessage[]): Promise<string | null> {
  // Use AI to decide if blocking question needed
  const result = await streamText({
    model: anthropic(AI_MODEL),
    messages: [
      ...messages,
      {
        role: "user",
        content: `Before proceeding with: "${content}"
Only do this when the question is blocking and very necessary in order to proceed and solve the entire problem.
Do you need to ask the user a BLOCKING question that must be answered before you can continue? 
If the user's response won't change your answer significantly, don't ask.
Your response must be exact as it's parsed by a program.
If yes, respond with ONLY the question text.
If no, respond with: NO_QUESTION`,
      },
    ],
  });

  let response = "";
  for await (const chunk of result.textStream) {
    response += chunk;
  }

  response = response.trim();
  return response === "NO_QUESTION" ? null : response;
}

async function generateAsyncSubquestions(content: string, messages: CoreMessage[]): Promise<string[]> {
  const result = await streamText({
    model: anthropic(AI_MODEL),
    messages: [
      ...messages,
      {
        role: "user",
        content: `For the request: "${content}"

Generate 0-4 independent subquestions that could be explored in parallel to help answer this request if it requires so
Do not generate any subquestion if there is a clear answer to the question and no further exploration is needed
Each subquestion should be on its own line.
If no subquestions needed, respond with: NONE
Your answer must be exact, as it's parsed by a program`,
      },
    ],
  });

  let response = "";
  for await (const chunk of result.textStream) {
    response += chunk;
  }

  if (response.trim() === "NONE") {
    return [];
  }

  return response
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .slice(0, 4);
}

async function summarizeWithAI(
  mainAnswer: string,
  subResults: Array<{ agentId: string; result: string | null; status: AgentStatus }>
): Promise<{ summary: string; needsMoreInfo: boolean }> {
  const subResultsText = subResults
    .map(r => `[${r.status}] ${r.result || "(no result)"}`)
    .join("\n");

  const result = await streamText({
    model: anthropic(AI_MODEL),
    messages: [
      {
        role: "user",
        content: `Main answer: ${mainAnswer}

Subagent results:
${subResultsText}

Provide a comprehensive summary. At the end, add a line:
NEEDS_MORE_INFO: yes/no
Must be exact, it will be parsed by a program.
Indicate 'yes' if there are contradictions, critical uncertainties, or gaps that require many user input.`,
      },
    ],
  });

  let response = "";
  for await (const chunk of result.textStream) {
    response += chunk;
  }

  const needsMoreInfo = response.toLowerCase().includes("needs_more_info: yes");
  return { summary: response, needsMoreInfo };
}

// ============================================================================
// CORE AGENT IMPLEMENTATION
// ============================================================================

async function* agent(input: {
  prompt?: string;
  messages?: CoreMessage[];
  agentId?: string;
  parentId?: string | null;
}): AsyncGenerator<any, string, undefined> {
  // Initialize agent state
  const agentId = input.agentId || randomUUID();
  const parentId = input.parentId || null;
  const initialMessages: CoreMessage[] = input.messages || [];
  // Log agent id and initial message for debugging
  const firstMessage = initialMessages.length > 0 ? initialMessages[0] : null;
  const initialMessage =
    input.prompt ?? (firstMessage && typeof firstMessage.content === 'string' ? firstMessage.content : "(no initial message)");
  console.log("[agent] agentId=", agentId, "initialMessage=", initialMessage);
  const state: AgentState = {
    agentId,
    parentId,
    userContent: input.prompt || "",
    userComment: "unchanged",
    status: "running",
    subagents: [],
    messages: [...initialMessages],
    result: null,
    metadata: {},
    createdAt: Date.now(),
  };

  AGENT_TREE.set(agentId, state);

  try {
    // Yield initial state
    yield {
      type: "agent-state",
      agentId,
      state: { ...state, messages: undefined },
    };

    // STEP 1: Check if clarification needed
    if (input.prompt && await decideNeedsClarification(input.prompt)) {
      const clarification = await queryUser(agentId, `Please clarify: ${input.prompt}`);
      
      if (!clarification) {
        state.status = "completed";
        state.result = "User did not provide clarification";
        yield { type: "agent-state", agentId, state: { ...state, messages: undefined } };
        return state.result;
      }

      state.userContent = clarification;
      state.messages.push({
        role: "user",
        content: clarification,
      });
    } else if (input.prompt) {
      state.messages.push({
        role: "user",
        content: input.prompt,
      });
    }

    // STEP 2: Handle synced (blocking) questions
    let maxSyncedQuestions = 3;
    while (maxSyncedQuestions > 0) {
      const syncQuestion = await decideSyncedQuestion(state.userContent, state.messages);
      
      if (!syncQuestion) break;

      const syncAnswer = await queryUser(agentId, syncQuestion);
      
      if (!syncAnswer) {
        state.status = "completed";
        state.result = "User did not answer required question";
        yield { type: "agent-state", agentId, state: { ...state, messages: undefined } };
        return state.result;
      }

      state.userContent += `\n[User answered: ${syncAnswer}]`;
      state.messages.push({
        role: "user",
        content: syncAnswer,
      });

      maxSyncedQuestions--;
    }

    // STEP 3: Generate async subquestions
    const subquestions = await generateAsyncSubquestions(state.userContent, state.messages);

    // STEP 4: Spawn subagents
    const subagentGenerators: AsyncGenerator<any, string, undefined>[] = [];
    const subagentIds: string[] = [];
    
    for (const subq of subquestions) {
      const subagentId = randomUUID();
      state.subagents.push(subagentId);
      subagentIds.push(subagentId);
      
      const stream = agent({
        prompt: subq,
        agentId: subagentId,
        parentId: agentId,
      });

      subagentGenerators.push(stream);
    }

    // Run main agent with Python tool
    const mainAgentGenerator = runMainAgent(state);
    
    // Interleave main agent and subagent chunks
    for await (const chunk of mainAgentGenerator) {
      // STEP 5: Check for user intervention
      if (state.userComment === "delete") {
        state.status = "deleted";
        state.result = "Agent deleted by user";
        yield { type: "agent-state", agentId, state: { ...state, messages: undefined } };
        AGENT_TREE.delete(agentId);
        return state.result;
      }

      if (state.userComment === "modify") {
        // User has modified the content, restart with new content
        yield { type: "agent-state", agentId, state: { ...state, messages: undefined } };
        continue;
      }

      yield chunk;
    }
    
    // Now process subagent streams and forward their chunks
    for (const subgen of subagentGenerators) {
      for await (const chunk of subgen) {
        yield chunk;
      }
    }

    // STEP 6: Collect and summarize results
    const subResults = subagentIds.map(id => {
      const subState = AGENT_TREE.get(id);
      return {
        agentId: id,
        result: subState?.result || null,
        status: subState?.status || "completed" as AgentStatus,
      };
    });
    
    const mainAnswer = state.result || "";
    const { summary, needsMoreInfo } = await summarizeWithAI(mainAnswer, subResults);

    if (needsMoreInfo) {
      const finalQuestion = await decideSyncedQuestion(summary, state.messages);
      
      if (finalQuestion) {
        const finalAnswer = await queryUser(agentId, finalQuestion);
        
        if (finalAnswer) {
          state.userContent += `\n[Final user input: ${finalAnswer}]`;
          state.messages.push({
            role: "user",
            content: finalAnswer,
          });
          
          // Get final answer from AI
          const finalStream = runMainAgent(state);
          for await (const chunk of finalStream) {
            yield chunk;
          }
        }
      }
    }

    state.result = summary;
    state.status = "completed";
    state.metadata.subagents = subResults;

    yield {
      type: "agent-state",
      agentId,
      state: { ...state, messages: undefined },
    };

    AGENT_TREE.delete(agentId);
    return state.result || "";

  } catch (error: any) {
    state.status = "error";
    state.result = error.message;
    yield {
      type: "agent-state",
      agentId,
      state: { ...state, messages: undefined },
    };
    AGENT_TREE.delete(agentId);
    return state.result || "";
  }
}

// ============================================================================
// MAIN AGENT EXECUTION WITH TOOLS
// ============================================================================

async function* runMainAgent(state: AgentState): AsyncGenerator<any, void, undefined> {
  let py: ReturnType<typeof python> | null = null;

  // Fork management (nested agents)
  const forks = new Map<number, Promise<string>>();
  let nextHandle = 1;

  async function executePython(code: string): Promise<string> {
    if (py) {
      py.close();
    }

    function fork(prompt: string): number {
      const handle = nextHandle++;

      const forkPromise = (async () => {
        const forkedMessages: CoreMessage[] = [
          ...state.messages,
          {
            role: "user",
            content: prompt,
          },
        ];

        let result = "";
        const stream = agent({
          messages: forkedMessages,
          parentId: state.agentId,
        });

        for await (const chunk of stream) {
          if (typeof chunk === "string") {
            result = chunk;
          }
        }

        return result;
      })();

      forks.set(handle, forkPromise);
      return handle;
    }

    async function wait(handle: number): Promise<string> {
      const forkPromise = forks.get(handle);
      if (!forkPromise) {
        throw new Error(`No fork with handle ${handle}`);
      }
      return await forkPromise;
    }

    py = python(code, { fork, wait });

    const logs: string[] = [];
    (async () => {
      for await (const line of py!.stderr) {
        console.log(`[Python stderr]: ${line}`);
        logs.push(line);
      }
    })();

    try {
      const result = await py.result;

      let output = "";
      if (logs.length > 0) {
        output += `Logs:\n${logs.join("\n")}\n\n`;
      }
      if (result !== null && result !== undefined) {
        output += `Result: ${JSON.stringify(result)}`;
      } else {
        output += "(no return value)";
      }

      return output;
    } catch (error: any) {
      let output = "";
      if (logs.length > 0) {
        output += `Logs:\n${logs.join("\n")}\n\n`;
      }
      output += `Error: ${error.message}`;
      return output;
    }
  }

  const result = streamText({
    model: anthropic(AI_MODEL),
    messages: state.messages,
    tools: {
      python: tool({
        description:
          "Execute Python code. The last expression will be returned to you. You have access to fork(prompt: str) -> int and wait(handle: int) -> str. fork() creates a parallel version of yourself where the current Python code returns `prompt`, allowing you to explore multiple paths. wait() retrieves a fork's final output.",
        inputSchema: z.object({
          code: z.string().describe("Python code to execute"),
        }),
        execute: async ({ code }: { code: string }) => {
          const output = await executePython(code);
          return output;
        },
      }),
    },
    onFinish: () => {
      if (py) {
        py.close();
      }
    },
  });

  const stream = result.toUIMessageStream();

  let textResult = "";
  for await (const chunk of stream) {
    if (chunk.type === "text-delta") {
      textResult += chunk.delta;
    }
    
    // Attach agentId to all chunks for routing
    (chunk as any).agentId = state.agentId;

    yield chunk;
  }

  if (!state.result) {
    state.result = textResult;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { agent };
