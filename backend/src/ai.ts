import { CoreMessage, streamText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import python from "./python";

// Helper: consume an agent stream to extract final text output
async function consumeAgentToText(
  stream: AsyncIterable<any>
): Promise<string> {
  let text = "";
  for await (const chunk of stream) {
    if (chunk.type === "text-delta") {
      text += chunk.textDelta;
    }
  }
  return text;
}

async function* agent(input: { prompt: string } | { messages: CoreMessage[] }) {
  // Message history tracking
  const messages: CoreMessage[] = "messages" in input ? input.messages : [];
  let currentToolCallId: string | null = null;

  // Fork management
  const forks = new Map<number, Promise<string>>();
  let nextHandle = 1;

  // Isolated Python instance for this agent run
  let py: ReturnType<typeof python> | null = null;

  // Closure: executePython is scoped to this agent run
  async function executePython(code: string): Promise<string> {
    // Clean up old instance if exists
    if (py) {
      py.close();
    }

    // fork: create parallel agent with modified history
    function fork(prompt: string): number {
      const handle = nextHandle++;

      // Clone messages and add tool result with fork's prompt
      const forkedMessages: CoreMessage[] = [
        ...messages,
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: currentToolCallId!,
              toolName: "python",
              result: prompt,
            },
          ],
        },
      ];

      // Start forked agent and capture its text output
      const forkPromise = consumeAgentToText(
        agent({ messages: forkedMessages })
      );
      forks.set(handle, forkPromise);
      return handle;
    }

    // wait: block until fork completes, return its output
    async function wait(handle: number): Promise<string> {
      const forkPromise = forks.get(handle);
      if (!forkPromise) {
        throw new Error(`No fork with handle ${handle}`);
      }
      return await forkPromise;
    }

    // Create new Python instance with fork/wait available
    py = python(code, {
      fork,
      wait,
    });

    // Collect stderr output (logs)
    const logs: string[] = [];
    (async () => {
      for await (const line of py!.stderr) {
        console.log(`[Python stderr]: ${line}`);
        logs.push(line);
      }
    })();

    try {
      // Wait for the result from Python
      const result = await py.result;

      // Format the result
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
      // Include error and any logs
      let output = "";
      if (logs.length > 0) {
        output += `Logs:\n${logs.join("\n")}\n\n`;
      }
      output += `Error: ${error.message}`;
      return output;
    }
  }

  const result = streamText({
    model: anthropic("claude-sonnet-4-5-20250929"),
    ...("prompt" in input ? { prompt: input.prompt } : { messages }),
    tools: {
      python: tool({
        description:
          "Execute Python code. The last expression will be returned to you. You have access to fork(prompt: str) -> int and wait(handle: int) -> str. fork() creates a parallel version of yourself where the current Python code returns `prompt`, allowing you to explore multiple paths. wait() retrieves a fork's final output.",
        inputSchema: z.object({
          code: z.string().describe("Python code to execute"),
        }),
        execute: async ({ code }, { toolCallId }) => {
          currentToolCallId = toolCallId;
          const output = await executePython(code);
          return output;
        },
      }),
    },
    maxSteps: 100,
    onFinish: () => {
      // Cleanup when agent finishes
      if (py) {
        py.close();
      }
    },
  });

  const stream = result.toUIMessageStream();

  // Consume stream, track messages, re-yield chunks
  for await (const chunk of stream) {
    // Track message history from chunks
    if (chunk.type === "message") {
      messages.push(...chunk.messages);
    }

    yield chunk;
  }
}

async function main() {
  const stream = agent({
    prompt: "Use fork and wait to explore two different approaches to solving: What's 15 * 23? Fork should try different calculation strategies.",
  });

  for await (const chunk of stream) {
    console.log(JSON.stringify(chunk, null, 2));
  }
}

main().catch(console.error);
