/**
 * Simple minimal test for agent system without requiring AI API calls
 * Tests core agent structure, state management, and user intervention
 */

import {
  agent,
  getAgentTree,
  getAgent,
  userIntervention,
  setQueryUserHandler,
} from "./ai";

function logSection(title: string) {
  console.log("\n" + "=".repeat(80));
  console.log(`  ${title}`);
  console.log("=".repeat(80) + "\n");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// TEST 1: Basic Agent State Management
// ============================================================================

async function testBasicStateManagement() {
  logSection("TEST 1: Basic Agent State Management");

  let queryCalls = 0;

  setQueryUserHandler(async (agentId, prompt) => {
    queryCalls++;
    console.log(`[Query #${queryCalls}]: ${prompt.slice(0, 60)}...`);
    // Return null to skip clarification and proceed
    return null;
  });

  console.log("Creating agent with simple prompt...\n");

  const stream = agent({
    prompt: "Simple test prompt without AI",
  });

  let chunkCount = 0;
  let stateUpdates = 0;

  for await (const chunk of stream) {
    chunkCount++;
    
    if (chunk.type === "agent-state") {
      stateUpdates++;
      console.log(`State Update ${stateUpdates}: status=${chunk.state.status}`);
      console.log(`  - agentId: ${chunk.state.agentId.slice(0, 8)}`);
      console.log(`  - parentId: ${chunk.state.parentId}`);
      console.log(`  - userContent: ${chunk.state.userContent.slice(0, 40)}...`);
      console.log(`  - subagents: ${chunk.state.subagents.length}`);
    }
  }

  console.log(`\nTotal chunks: ${chunkCount}`);
  console.log(`Total state updates: ${stateUpdates}`);
  console.log(`Total query calls: ${queryCalls}`);

  const tree = getAgentTree();
  console.log(`\nAgents remaining in tree: ${Object.keys(tree).length}`);

  console.log("\n✓ Basic state management test completed");
}

// ============================================================================
// TEST 2: Agent Tree Registration
// ============================================================================

async function testAgentTreeRegistration() {
  logSection("TEST 2: Agent Tree Registration");

  setQueryUserHandler(async (agentId, prompt) => {
    console.log(`[Query for ${agentId.slice(0, 8)}]: ${prompt.slice(0, 40)}...`);
    return null; // Skip queries
  });

  console.log("Starting agent and monitoring tree...\n");

  const stream = agent({
    prompt: "Test agent tree tracking",
  });

  // Monitor tree while agent runs
  const monitorInterval = setInterval(() => {
    const tree = getAgentTree();
    const count = Object.keys(tree).length;
    
    if (count > 0) {
      console.log(`[Tree Monitor] Active agents: ${count}`);
      for (const [id, state] of Object.entries(tree)) {
        console.log(`  - ${id.slice(0, 8)}: ${state.status} (${state.subagents.length} subagents)`);
      }
    }
  }, 500);

  // Consume stream
  for await (const chunk of stream) {
    if (chunk.type === "agent-state") {
      console.log(`Agent ${chunk.agentId.slice(0, 8)} state: ${chunk.state.status}`);
    }
  }

  clearInterval(monitorInterval);

  const finalTree = getAgentTree();
  console.log(`\nFinal tree size: ${Object.keys(finalTree).length}`);
  console.log("✓ Agent tree registration test completed");
}

// ============================================================================
// TEST 3: User Intervention
// ============================================================================

async function testUserIntervention() {
  logSection("TEST 3: User Intervention");

  setQueryUserHandler(async (agentId, prompt) => {
    console.log(`[Query]: ${prompt.slice(0, 50)}...`);
    await delay(200);
    return "User response";
  });

  console.log("Starting agent, will intervene after 1 second...\n");

  const stream = agent({
    prompt: "Agent to be modified",
  });

  const streamConsumer = (async () => {
    let targetAgentId: string | null = null;

    for await (const chunk of stream) {
      if (chunk.type === "agent-state" && !targetAgentId) {
        targetAgentId = chunk.agentId;
        console.log(`Target agent: ${targetAgentId.slice(0, 8)}`);
      }

      if (chunk.type === "agent-state") {
        console.log(`Status: ${chunk.state.status}, Comment: ${chunk.state.userComment}`);
      }
    }
  })();

  // Wait then intervene
  await delay(1000);

  const tree = getAgentTree();
  const agents = Object.keys(tree);

  if (agents.length > 0) {
    const targetId = agents[0];
    console.log(`\n[INTERVENTION] Modifying agent ${targetId.slice(0, 8)}...`);

    const success = await userIntervention(targetId, {
      userComment: "User added comment",
      userContent: "Modified content",
    });

    console.log(`Intervention successful: ${success}`);

    const modifiedAgent = getAgent(targetId);
    if (modifiedAgent) {
      console.log(`New userComment: ${modifiedAgent.userComment}`);
      console.log(`New userContent: ${modifiedAgent.userContent.slice(0, 40)}...`);
    }
  } else {
    console.log("No agents in tree to intervene on (already completed)");
  }

  await streamConsumer;

  console.log("\n✓ User intervention test completed");
}

// ============================================================================
// TEST 4: Agent Deletion
// ============================================================================

async function testAgentDeletion() {
  logSection("TEST 4: Agent Deletion");

  setQueryUserHandler(async (agentId, prompt) => {
    console.log(`[Query]: ${prompt.slice(0, 50)}...`);
    await delay(300);
    return "Proceed";
  });

  console.log("Starting agent, will delete after 800ms...\n");

  const stream = agent({
    prompt: "Agent to be deleted",
  });

  const streamConsumer = (async () => {
    for await (const chunk of stream) {
      if (chunk.type === "agent-state") {
        console.log(`Agent status: ${chunk.state.status}, result: ${chunk.state.result?.slice(0, 40) || "null"}`);
      }
    }
  })();

  await delay(800);

  const tree = getAgentTree();
  const agents = Object.keys(tree);

  if (agents.length > 0) {
    const targetId = agents[0];
    console.log(`\n[DELETION] Deleting agent ${targetId.slice(0, 8)}...`);

    const success = await userIntervention(targetId, {
      userComment: "delete",
    });

    console.log(`Deletion marked: ${success}`);
  } else {
    console.log("Agent already completed before deletion could occur");
  }

  await streamConsumer;

  console.log("\n✓ Agent deletion test completed");
}

// ============================================================================
// TEST 5: Multiple Agents
// ============================================================================

async function testMultipleAgents() {
  logSection("TEST 5: Multiple Concurrent Agents");

  setQueryUserHandler(async (agentId, prompt) => {
    console.log(`[Query ${agentId.slice(0, 8)}]: ${prompt.slice(0, 40)}...`);
    return null;
  });

  console.log("Starting 3 agents concurrently...\n");

  const streams = [
    agent({ prompt: "Agent 1" }),
    agent({ prompt: "Agent 2" }),
    agent({ prompt: "Agent 3" }),
  ];

  const consumers = streams.map(async (stream, index) => {
    console.log(`Agent ${index + 1} started`);
    for await (const chunk of stream) {
      if (chunk.type === "agent-state") {
        console.log(`  Agent ${index + 1}: ${chunk.state.status}`);
      }
    }
    console.log(`Agent ${index + 1} completed`);
  });

  // Monitor tree
  const monitorInterval = setInterval(() => {
    const tree = getAgentTree();
    console.log(`[Tree] Active agents: ${Object.keys(tree).length}`);
  }, 300);

  await Promise.all(consumers);
  clearInterval(monitorInterval);

  const finalTree = getAgentTree();
  console.log(`\nFinal active agents: ${Object.keys(finalTree).length}`);
  console.log("✓ Multiple agents test completed");
}

// ============================================================================
// TEST 6: getAgent Function
// ============================================================================

async function testGetAgent() {
  logSection("TEST 6: getAgent Function");

  setQueryUserHandler(async () => null);

  console.log("Starting agent to test getAgent()...\n");

  let capturedAgentId: string | null = null;

  const stream = agent({
    prompt: "Test getAgent function",
  });

  for await (const chunk of stream) {
    if (chunk.type === "agent-state" && !capturedAgentId) {
      capturedAgentId = chunk.agentId;
      console.log(`Captured agent ID: ${capturedAgentId.slice(0, 8)}`);

      // Test getAgent while agent is running
      const agentState = getAgent(capturedAgentId);
      
      if (agentState) {
        console.log("\nAgent state retrieved:");
        console.log(`  - Status: ${agentState.status}`);
        console.log(`  - UserContent: ${agentState.userContent.slice(0, 40)}...`);
        console.log(`  - Messages: ${agentState.messages.length}`);
        console.log(`  - Created: ${new Date(agentState.createdAt).toISOString()}`);
      } else {
        console.log("ERROR: Could not retrieve agent state");
      }
    }
  }

  // Try to get agent after completion (should be removed from tree)
  if (capturedAgentId) {
    const afterCompletion = getAgent(capturedAgentId);
    console.log(`\nAgent in tree after completion: ${afterCompletion !== undefined}`);
  }

  console.log("\n✓ getAgent function test completed");
}

// ============================================================================
// SIMPLE TEST RUNNER
// ============================================================================

const tests = [
  { name: "Basic State Management", fn: testBasicStateManagement },
  { name: "Agent Tree Registration", fn: testAgentTreeRegistration },
  { name: "User Intervention", fn: testUserIntervention },
  { name: "Agent Deletion", fn: testAgentDeletion },
  { name: "Multiple Agents", fn: testMultipleAgents },
  { name: "getAgent Function", fn: testGetAgent },
];

async function main() {
  const args = process.argv.slice(2);

  console.log("\n╔════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                    AGENT SYSTEM SIMPLE TEST SUITE                         ║");
  console.log("║  (Without AI API calls - tests structure and state management only)       ║");
  console.log("╚════════════════════════════════════════════════════════════════════════════╝");

  if (args.includes("--list")) {
    console.log("\nAvailable Tests:");
    tests.forEach((test, i) => {
      console.log(`  ${i + 1}. ${test.name}`);
    });
    console.log("\nUsage:");
    console.log("  bun run src/ai.simple-test.ts           # Run all tests");
    console.log("  bun run src/ai.simple-test.ts N         # Run test N");
    console.log("  bun run src/ai.simple-test.ts --list    # List tests");
    return;
  }

  let testsToRun = tests;

  if (args.length > 0) {
    const testNum = parseInt(args[0], 10);
    if (testNum >= 1 && testNum <= tests.length) {
      testsToRun = [tests[testNum - 1]];
    } else {
      console.error(`\nError: Test number must be between 1 and ${tests.length}`);
      process.exit(1);
    }
  }

  let passed = 0;
  let failed = 0;

  for (const test of testsToRun) {
    try {
      await test.fn();
      passed++;
      console.log(`✅ ${test.name} PASSED\n`);
    } catch (error: any) {
      failed++;
      console.error(`❌ ${test.name} FAILED: ${error.message}\n`);
      console.error(error.stack);
    }

    // Small delay between tests
    await delay(500);
  }

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total: ${passed + failed}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log("=".repeat(80) + "\n");

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
