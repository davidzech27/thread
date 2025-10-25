import { agent } from "./ai";

async function interactiveTest() {
  const prompt = process.argv[2];

  if (!prompt) {
    console.error("Usage: bun run src/interactive-test.ts 'Your prompt here'");
    console.error(
      "\nExample:\n  bun run src/interactive-test.ts 'Calculate 123 * 456 using Python'"
    );
    process.exit(1);
  }

  const stream = agent({ prompt });

  let fullResponse = "";

  for await (const chunk of stream) {
    if (chunk.type === "text-delta" && chunk.textDelta) {
      fullResponse += chunk.textDelta;
    }
  }

  console.log(fullResponse);
}

interactiveTest().catch(console.error);
