import { streamText, tool } from "ai";
import type { CoreMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import python from "./python";
import { randomUUID } from "crypto";
import * as browser from "./browser";

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

async function decideNeedsClarification(content: string): Promise<string | null> {
  const result = await streamText({
    model: anthropic(AI_MODEL),
    messages: [
      {
        role: "user",
        content: `Before proceeding with: "${content}"

Do you need to ask the user a question that must be answered before you can continue? 
Only do this when the question is critical and very necessary in order to proceed and solve the entire problem.
You should only ask the user this question if it is an CLARIFICATION.
Your response must be exact as it's parsed by a program.
If yes, respond with exactly the question.
If no, respond with: NO`,
      },
    ],
  });

  let response = "";
  for await (const chunk of result.textStream) {
    response += chunk;
  }

  response = response.trim();
  if (response === "NO") {
    return null;
  }
  return response;
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

Do you need to ask a BLOCKING question that must be answered before you can continue? 
Only do this when the question is very necessary in order to proceed and solve the entire problem.
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
Only ask question that help you reach an answer to this question
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

  const needsMoreInfo = response.toLowerCase().includes("NEEDS_MORE_INFO: yes");
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
  masterPrompt?: string | null;
}): AsyncGenerator<any, string, undefined> {
  // Initialize agent state
  const agentId = input.agentId || randomUUID();
  const parentId = input.parentId || null;
  const initialMessages: CoreMessage[] = input.messages || [];

  // Log agent creation with full context
  const firstMessage = initialMessages.length > 0 ? initialMessages[0] : null;
  const initialMessage =
    input.prompt ?? (firstMessage && typeof firstMessage.content === 'string' ? firstMessage.content : "(no initial message)");

  console.log("\n========================================");
  console.log("[Agent Created]");
  console.log("  Agent ID:", agentId.substring(0, 8));
  console.log("  Parent ID:", parentId ? parentId.substring(0, 8) : "none (root)");
  console.log("  Initial Message:", initialMessage.substring(0, 100) + (initialMessage.length > 100 ? "..." : ""));
  console.log("  Message History Length:", initialMessages.length);
  if (initialMessages.length > 0) {
    console.log("  Context from parent:");
    initialMessages.forEach((msg, idx) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      console.log(`    [${idx}] ${msg.role}: ${content.substring(0, 80)}${content.length > 80 ? '...' : ''}`);
    });
  }
  console.log("========================================\n");

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
  // Check if prompt is related to masterPrompt
  if (input.masterPrompt && input.prompt) {
    const relevanceCheck = await streamText({
      model: anthropic(AI_MODEL),
      messages: [
        {
          role: "user",
          content: `Master prompt: "${input.masterPrompt}"
  Current prompt: "${input.prompt}"

  Is the current prompt even remotely related to the master prompt?
  Answer with ONLY 'RELATED' or 'UNRELATED'.
  Your response must be exact as it's parsed by a program.`,
        },
      ],
    });

    let relevanceResponse = "";
    for await (const chunk of relevanceCheck.textStream) {
      relevanceResponse += chunk;
    }

    if (relevanceResponse.trim() === "UNRELATED") {
      state.status = "deleted";
      state.result = "Agent deleted: prompt unrelated to master prompt";
      yield { type: "agent-state", agentId, state: { ...state, messages: undefined } };
      AGENT_TREE.delete(agentId);
      return state.result;
    }
  }

  try {
    // Yield initial state
    yield {
      type: "agent-state",
      agentId,
      state: { ...state, messages: undefined },
    };

    // STEP 1: Check if clarification needed
    if (input.prompt && await decideNeedsClarification(input.prompt)) {
      const userquestion = await decideNeedsClarification(input.prompt)
      if (userquestion) {
        const clarification = await queryUser(agentId, `Please clarify: ${userquestion}`);
      
        if (clarification) {
          state.userContent = clarification;
          state.messages.push({
            role: "user",
            content: clarification,
          });
        }


        
      } else if (input.prompt) {
        state.messages.push({
          role: "user",
          content: input.prompt,
        });
      }
    }
    if (state.userComment === "delete") {
        state.status = "deleted";
        state.result = "Agent deleted by user";
        yield { type: "agent-state", agentId, state: { ...state, messages: undefined } };
        AGENT_TREE.delete(agentId);
        return state.result;
      }
    // STEP 2: Handle synced (blocking) questions
    let maxSyncedQuestions = 3;
    while (maxSyncedQuestions > 0) {
      const syncQuestion = await decideSyncedQuestion(state.userContent, state.messages);
      
      if (!syncQuestion) break;

      const syncAnswer = await queryUser(agentId, syncQuestion);
      
      if (syncAnswer) {
        state.userContent += `\n[User answered: ${syncAnswer}]`;
        state.messages.push({
          role: "user",
          content: syncAnswer,
        });
      }

      

      maxSyncedQuestions--;
    }

    // STEP 3: Generate async subquestions
    const subquestions = await generateAsyncSubquestions(state.userContent, state.messages);
    if (state.userComment === "delete") {
        state.status = "deleted";
        state.result = "Agent deleted by user";
        yield { type: "agent-state", agentId, state: { ...state, messages: undefined } };
        AGENT_TREE.delete(agentId);
        return state.result;
      }

    // Track whether we've spawned subagents yet
    let subagentsSpawned = false;
    let hasUsedBrowserTools = false;
    const subagentGenerators: AsyncGenerator<any, string, undefined>[] = [];
    const subagentIds: string[] = [];

    // Add initial prompt to messages if provided
    if (input.prompt) {
      state.messages.push({
        role: "user",
        content: input.prompt,
      });
    }

    // Run main agent with Python tool
    const mainAgentGenerator = runMainAgent(state);
    
    // Interleave main agent and subagent chunks

    for await (const chunk of mainAgentGenerator) {
      // STEP 4: Check for user intervention
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

      // Detect browser tool usage (Phase 2 trigger)
      if (!hasUsedBrowserTools && typeof chunk === 'object' && chunk.type === 'tool-result') {
        const toolName = chunk.toolName;
        if (toolName?.startsWith('browser_')) {
          hasUsedBrowserTools = true;
          console.log(`\n[Agent ${agentId.substring(0, 8)}] Browser tool detected: ${toolName}`);
        }
      }

      // STEP 5: Phase 2 - Once browser context is gathered, spawn subagents with enriched context
      if (hasUsedBrowserTools && !subagentsSpawned) {
        subagentsSpawned = true;

        console.log(`\n[Agent ${agentId.substring(0, 8)}] Phase 2: Browser context gathered, generating subquestions`);

        // Generate subquestions based on enriched message history (now includes browser results)
        const subquestions = await generateAsyncSubquestions(state.userContent, state.messages);

        console.log(`[Agent ${agentId.substring(0, 8)}] Generated ${subquestions.length} subquestions with enriched context`);
        subquestions.forEach((sq, idx) => {
          console.log(`  Subquestion ${idx + 1}: ${sq.substring(0, 100)}${sq.length > 100 ? '...' : ''}`);
        });

        // Spawn subagents with enriched context
        for (const subq of subquestions) {
          const subagentId = randomUUID();
          state.subagents.push(subagentId);
          subagentIds.push(subagentId);

          // Pass parent's ENRICHED message history (including browser results)
          const subagentMessages: CoreMessage[] = [
            ...state.messages,
            {
              role: "user",
              content: subq,
            },
          ];

          console.log(`\n[Agent ${agentId.substring(0, 8)}] Spawning subagent ${subagentId.substring(0, 8)} with enriched context`);
          console.log(`  Passing ${subagentMessages.length} messages (includes browser results)`);

          const stream = agent({
            messages: subagentMessages,
            agentId: subagentId,
            parentId: agentId,
          });

          subagentGenerators.push(stream);
        }
      }
    }

    // Process subagent streams (if any were spawned)
    if (subagentGenerators.length > 0) {
      console.log(`\n[Agent ${agentId.substring(0, 8)}] Processing ${subagentGenerators.length} subagent streams`);
      for (const subgen of subagentGenerators) {
        for await (const chunk of subgen) {
          yield chunk;
        }
      }
    } else {
      console.log(`\n[Agent ${agentId.substring(0, 8)}] No subagents spawned (no browser tools used)`);
    }

    // STEP 6: Collect and summarize results
    console.log(`\n[Agent ${agentId.substring(0, 8)}] Collecting results from ${subagentIds.length} subagents`);

    const subResults = subagentIds.map(id => {
      const subState = AGENT_TREE.get(id);
      const result = subState?.result || null;
      const status = subState?.status || "completed" as AgentStatus;

      console.log(`  Subagent ${id.substring(0, 8)}: ${status}`);
      if (result) {
        console.log(`    Result: ${result.substring(0, 100)}${result.length > 100 ? '...' : ''}`);
      }

      return {
        agentId: id,
        result,
        status,
      };
    });

    const mainAnswer = state.result || "";
    console.log(`\n[Agent ${agentId.substring(0, 8)}] Main answer: ${mainAnswer.substring(0, 150)}${mainAnswer.length > 150 ? '...' : ''}`);
    console.log(`[Agent ${agentId.substring(0, 8)}] Generating summary...`);

    const { summary, needsMoreInfo } = await summarizeWithAI(mainAnswer, subResults);

    console.log(`[Agent ${agentId.substring(0, 8)}] Summary: ${summary.substring(0, 150)}${summary.length > 150 ? '...' : ''}`);
    console.log(`[Agent ${agentId.substring(0, 8)}] Needs more info: ${needsMoreInfo}`);

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

    // Capture final screenshot before completing (so modal doesn't show black screen)
    console.log(`\n[Agent ${agentId.substring(0, 8)}] Capturing final browser screenshot...`);
    await browser.captureFinalScreenshot();

    state.result = summary;
    state.status = "completed";
    state.metadata.subagents = subResults;

    console.log(`\n========================================`);
    console.log(`[Agent Completed]`);
    console.log(`  Agent ID: ${agentId.substring(0, 8)}`);
    console.log(`  Parent ID: ${parentId ? parentId.substring(0, 8) : 'none (root)'}`);
    console.log(`  Final Result: ${state.result.substring(0, 200)}${state.result.length > 200 ? '...' : ''}`);
    console.log(`  Subagents: ${subResults.length}`);
    console.log(`========================================\n`);

    yield {
      type: "agent-state",
      agentId,
      state: { ...state, messages: undefined },
    };

    AGENT_TREE.delete(agentId);
    return state.result || "";

  } catch (error: any) {
    console.log(`\n[Agent ${agentId.substring(0, 8)}] ERROR: ${error.message}`);

    // Capture final screenshot even on error
    await browser.captureFinalScreenshot().catch(err => {
      console.log(`[Agent ${agentId.substring(0, 8)}] Failed to capture error screenshot:`, err.message);
    });

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

  // Track browser tool usage for multi-page browsing
  let browserToolCallCount = 0;

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
    system: `You are a research agent with web browsing capabilities. Your goal is to thoroughly research the user's question by exploring multiple web pages.

IMPORTANT BROWSING INSTRUCTIONS:
- You can and SHOULD use browser tools MULTIPLE times to gather comprehensive information
- Start by navigating to a search engine or relevant website using browser_navigate
- Use browser_click_link to follow interesting links and explore multiple pages
- Visit several different sources to get a complete picture
- Each time you navigate or click a link, you'll get new page content with new links to explore
- Continue browsing until you have gathered enough information to answer the question thoroughly

WORKFLOW:
1. Navigate to a search engine (e.g., google.com) or directly to a relevant site
2. Click on promising links using their link IDs (e.g., 'link-3', 'link-7')
3. Extract information from multiple pages
4. If needed, navigate to new URLs or click more links to explore deeper
5. Synthesize findings from all the pages you visited

Remember: Using browser tools multiple times is expected and encouraged. Don't stop after just one page!`,
    messages: state.messages,
    maxSteps: 20, // Allow up to 20 tool calls for thorough research
    tools: {
      python: tool({
        description:
          "Execute Python code. The last expression will be returned to you. You have access to fork(prompt: str) -> int and wait(handle: int) -> str. fork() creates a parallel version of yourself where the current Python code returns `prompt`, allowing you to explore multiple paths. wait() retrieves a fork's final output.",
        inputSchema: z.object({
          code: z.string().describe("Python code to execute"),
        }),
        execute: async ({ code }: { code: string }) => {
          console.log(`\n[Agent ${state.agentId.substring(0, 8)}] Tool: python`);
          console.log(`  Code: ${code.substring(0, 150)}${code.length > 150 ? '...' : ''}`);
          const output = await executePython(code);
          console.log(`  Output: ${output.substring(0, 150)}${output.length > 150 ? '...' : ''}`);
          return output;
        },
      }),
      browser_navigate: tool({
        description:
          "Navigate the browser to a URL and automatically extract page content. Opens a visual browser window in the interface. Use this for web searches or to view websites. Returns the page title, URL, text content, and clickable links with IDs.",
        inputSchema: z.object({
          url: z.string().describe("URL to navigate to (e.g., 'google.com' or 'https://example.com')"),
        }),
        execute: async ({ url }: { url: string }) => {
          browserToolCallCount++;
          console.log(`\n[Agent ${state.agentId.substring(0, 8)}] Tool: browser_navigate [Call #${browserToolCallCount}]`);
          console.log(`  URL: ${url}`);

          const finalUrl = await browser.navigateToUrl(url);
          console.log(`  Final URL: ${finalUrl}`);

          // Automatically extract page text and links after navigation
          const data = await browser.extractPageText();
          console.log(`  Page Title: ${data.title}`);
          console.log(`  Text Length: ${data.text.length} chars`);
          console.log(`  Links Found: ${data.links.length}`);

          // Log detailed scraped text
          console.log(`\n  ========== SCRAPED TEXT (first 1000 chars) ==========`);
          console.log(data.text.substring(0, 1000));
          if (data.text.length > 1000) {
            console.log(`  ... (${data.text.length - 1000} more characters)`);
          }
          console.log(`  ======================================================\n`);

          // Log detailed links
          console.log(`  ========== SCRAPED LINKS (first 30) ==========`);
          data.links.slice(0, 30).forEach((link, idx) => {
            console.log(`    [${idx}] ${link.id}: "${link.text}" -> ${link.url}`);
          });
          if (data.links.length > 30) {
            console.log(`    ... and ${data.links.length - 30} more links`);
          }
          console.log(`  ==============================================\n`);

          const linksList = data.links.slice(0, 20).map(l => `[${l.id}] ${l.text} -> ${l.url}`).join('\n');
          const hasMore = data.links.length > 20 ? `\n... and ${data.links.length - 20} more links` : '';

          return `Navigated to: ${finalUrl}\n\nTitle: ${data.title}\n\nText (${data.text.length} chars):\n${data.text.substring(0, 2000)}${data.text.length > 2000 ? '...' : ''}\n\nClickable Links (showing first 20):\n${linksList}${hasMore}`;
        },
      }),
      browser_extract_text: tool({
        description:
          "Extract all text and links from the current browser page. Returns the page title, URL, full text content, and a list of clickable links with IDs.",
        inputSchema: z.object({}),
        execute: async () => {
          browserToolCallCount++;
          console.log(`\n[Agent ${state.agentId.substring(0, 8)}] Tool: browser_extract_text [Call #${browserToolCallCount}]`);
          const data = await browser.extractPageText();
          console.log(`  Page: ${data.title}`);
          console.log(`  Text Length: ${data.text.length} chars`);
          console.log(`  Links: ${data.links.length}`);

          // Log detailed scraped text
          console.log(`\n  ========== SCRAPED TEXT (first 1000 chars) ==========`);
          console.log(data.text.substring(0, 1000));
          if (data.text.length > 1000) {
            console.log(`  ... (${data.text.length - 1000} more characters)`);
          }
          console.log(`  ======================================================\n`);

          // Log detailed links
          console.log(`  ========== SCRAPED LINKS (first 30) ==========`);
          data.links.slice(0, 30).forEach((link, idx) => {
            console.log(`    [${idx}] ${link.id}: "${link.text}" -> ${link.url}`);
          });
          if (data.links.length > 30) {
            console.log(`    ... and ${data.links.length - 30} more links`);
          }
          console.log(`  ==============================================\n`);

          const linksList = data.links.slice(0, 20).map(l => `[${l.id}] ${l.text} -> ${l.url}`).join('\n');
          const hasMore = data.links.length > 20 ? `\n... and ${data.links.length - 20} more links` : '';
          return `Title: ${data.title}\nURL: ${data.url}\n\nText (${data.text.length} chars):\n${data.text.substring(0, 2000)}${data.text.length > 2000 ? '...' : ''}\n\nLinks (showing first 20):\n${linksList}${hasMore}`;
        },
      }),
      browser_click_link: tool({
        description:
          "Click a link on the current browser page by its ID and automatically extract the new page content. Link IDs are in the format 'link-0', 'link-1', etc. and are provided by browser_navigate or browser_extract_text. Returns the new page title, text content, and clickable links.",
        inputSchema: z.object({
          linkId: z.string().describe("Link ID to click (e.g., 'link-5')"),
        }),
        execute: async ({ linkId }: { linkId: string }) => {
          browserToolCallCount++;
          console.log(`\n[Agent ${state.agentId.substring(0, 8)}] Tool: browser_click_link [Call #${browserToolCallCount}]`);
          console.log(`  Link ID: ${linkId}`);

          await browser.clickElement(linkId);

          // Wait a bit for navigation to complete
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Automatically extract the new page content
          const data = await browser.extractPageText();
          console.log(`  Navigated to: ${data.url}`);
          console.log(`  Page Title: ${data.title}`);
          console.log(`  Text Length: ${data.text.length} chars`);
          console.log(`  Links Found: ${data.links.length}`);

          // Log detailed scraped text
          console.log(`\n  ========== SCRAPED TEXT (first 1000 chars) ==========`);
          console.log(data.text.substring(0, 1000));
          if (data.text.length > 1000) {
            console.log(`  ... (${data.text.length - 1000} more characters)`);
          }
          console.log(`  ======================================================\n`);

          // Log detailed links
          console.log(`  ========== SCRAPED LINKS (first 30) ==========`);
          data.links.slice(0, 30).forEach((link, idx) => {
            console.log(`    [${idx}] ${link.id}: "${link.text}" -> ${link.url}`);
          });
          if (data.links.length > 30) {
            console.log(`    ... and ${data.links.length - 30} more links`);
          }
          console.log(`  ==============================================\n`);

          const linksList = data.links.slice(0, 20).map(l => `[${l.id}] ${l.text} -> ${l.url}`).join('\n');
          const hasMore = data.links.length > 20 ? `\n... and ${data.links.length - 20} more links` : '';

          return `Clicked ${linkId} and navigated to: ${data.url}\n\nTitle: ${data.title}\n\nText (${data.text.length} chars):\n${data.text.substring(0, 2000)}${data.text.length > 2000 ? '...' : ''}\n\nClickable Links (showing first 20):\n${linksList}${hasMore}`;
        },
      }),
      browser_scroll: tool({
        description:
          "Scroll the browser page to a specific position and automatically extract the page content. Useful for viewing content further down the page. Returns the updated page text and links.",
        inputSchema: z.object({
          x: z.number().describe("Horizontal scroll position (pixels)"),
          y: z.number().describe("Vertical scroll position (pixels)"),
        }),
        execute: async ({ x, y }: { x: number; y: number }) => {
          browserToolCallCount++;
          console.log(`\n[Agent ${state.agentId.substring(0, 8)}] Tool: browser_scroll [Call #${browserToolCallCount}]`);
          console.log(`  Position: (${x}, ${y})`);

          await browser.scrollTo(x, y);

          // Wait a bit for any lazy-loaded content
          await new Promise(resolve => setTimeout(resolve, 500));

          // Automatically extract the page content after scrolling
          const data = await browser.extractPageText();
          console.log(`  Text Length: ${data.text.length} chars`);
          console.log(`  Links: ${data.links.length}`);

          // Log detailed scraped text
          console.log(`\n  ========== SCRAPED TEXT (first 1000 chars) ==========`);
          console.log(data.text.substring(0, 1000));
          if (data.text.length > 1000) {
            console.log(`  ... (${data.text.length - 1000} more characters)`);
          }
          console.log(`  ======================================================\n`);

          // Log detailed links
          console.log(`  ========== SCRAPED LINKS (first 30) ==========`);
          data.links.slice(0, 30).forEach((link, idx) => {
            console.log(`    [${idx}] ${link.id}: "${link.text}" -> ${link.url}`);
          });
          if (data.links.length > 30) {
            console.log(`    ... and ${data.links.length - 30} more links`);
          }
          console.log(`  ==============================================\n`);

          const linksList = data.links.slice(0, 20).map(l => `[${l.id}] ${l.text} -> ${l.url}`).join('\n');
          const hasMore = data.links.length > 20 ? `\n... and ${data.links.length - 20} more links` : '';

          return `Scrolled to position (${x}, ${y})\n\nTitle: ${data.title}\n\nText (${data.text.length} chars):\n${data.text.substring(0, 2000)}${data.text.length > 2000 ? '...' : ''}\n\nClickable Links (showing first 20):\n${linksList}${hasMore}`;
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

  console.log(`\n[Agent ${state.agentId.substring(0, 8)}] Starting text generation...`);

  let textResult = "";
  for await (const chunk of stream) {
    if (chunk.type === "text-delta") {
      textResult += chunk.delta;
    }

    // Attach agentId to all chunks for routing
    (chunk as any).agentId = state.agentId;

    yield chunk;
  }

  console.log(`[Agent ${state.agentId.substring(0, 8)}] Text generation complete (${textResult.length} chars)`);
  console.log(`[Agent ${state.agentId.substring(0, 8)}] Total browser tool calls: ${browserToolCallCount}`);
  if (textResult.length > 0) {
    console.log(`[Agent ${state.agentId.substring(0, 8)}] Generated text: ${textResult.substring(0, 200)}${textResult.length > 200 ? '...' : ''}`);
  }

  if (!state.result) {
    state.result = textResult;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { agent };
