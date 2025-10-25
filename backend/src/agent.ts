import { stepCountIs, streamText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import python from "./python";

export function agent(prompt: string) {
  // Isolated Python instance for this agent run
  let py: ReturnType<typeof python> | null = null;

  // Closure: executePython is scoped to this agent run
  async function executePython(code: string): Promise<string> {
    // Clean up old instance if exists
    if (py) {
      py.close();
    }

    // Create new Python instance with fetch available
    py = python(code, {
      // Expose fetch to Python
      async fetch(url: string, options: any = {}) {
        const response = await fetch(url, options);
        const text = await response.text();
        return text;
      },
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
    prompt,
    tools: {
      python: tool({
        description:
          "Execute Python code. The last expression will be returned to you. You have access to the fetch() function which can make HTTP requests and returns a string.",
        inputSchema: z.object({
          code: z.string().describe("Python code to execute"),
        }),
        execute: async ({ code }) => {
          const output = await executePython(code);
          return output;
        },
      }),
    },
    stopWhen: stepCountIs(9999),
    onFinish: () => {
      // Cleanup when agent finishes
      if (py) {
        py.close();
      }
    },
  });

  return result.toUIMessageStream();
}

