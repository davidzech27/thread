/**
 * Comprehensive test suite for the agent system
 * Tests all features including:
 * - Basic agent execution
 * - User queries and clarifications
 * - Synced (blocking) questions
 * - Async subquestion spawning
 * - User interventions (delete, modify)
 * - Agent tree monitoring
 * - Fork/wait system
 * - Error handling
 * I want to plant tomato in my backyard, give me a cost analysis as of how much that costs. I have the seed, fertilizer.
 */

import {
  agent,
  getAgentTree,
  getAgent,
  userIntervention,
  setQueryUserHandler,
} from "./ai";

// ============================================================================
// TEST UTILITIES
// ============================================================================

interface TestScenario {
  name: string;
  description: string;
  run: () => Promise<void>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logSection(title: string) {
  console.log("\n" + "=".repeat(80));
  console.log(`  ${title}`);
  console.log("=".repeat(80) + "\n");
}

function logSubSection(title: string) {
  console.log("\n" + "-".repeat(60));
  console.log(`  ${title}`);
  console.log("-".repeat(60));
}

// ============================================================================
// TEST 1: Basic Agent Execution
// ============================================================================

async function testBasicExecution() {
  logSection("TEST 1: Basic Agent Execution");

  // Simple auto-responder
  setQueryUserHandler(async (agentId, prompt) => {
    console.log(`[User Query ${agentId}]: ${prompt}`);
    return "I prefer outdoor activities"; // Auto-respond
  });

  console.log("Starting agent with simple prompt...\n");

  const stream = agent({
    prompt: "Suggest 3 weekend activities",
  });

  let textOutput = "";
  let agentStateCount = 0;

  for await (const chunk of stream) {
    if (chunk.type === "text-delta") {
      textOutput += chunk.textDelta;
      process.stdout.write(chunk.textDelta);
    } else if (chunk.type === "agent-state") {
      agentStateCount++;
      console.log(
        `\n[State Update ${agentStateCount}]: Status = ${chunk.state.status}`
      );
    }
  }

  console.log("\n\nFinal output length:", textOutput.length);
  console.log("State updates received:", agentStateCount);
  console.log("✓ Basic execution completed");
}

// ============================================================================
// TEST 2: Clarification Flow
// ============================================================================

async function testClarificationFlow() {
  logSection("TEST 2: Clarification Flow (Ambiguous Input)");

  setQueryUserHandler(async (agentId, prompt) => {
    console.log(`[User Query ${agentId}]: ${prompt}`);
    if (prompt.includes("clarify")) {
      return "I mean a birthday party for my 30th birthday with 20 friends";
    }
    return "Proceed";
  });

  console.log("Starting agent with ambiguous prompt...\n");

  const stream = agent({
    prompt: "Help me plan something? Maybe a party or event?", // Ambiguous
  });

  for await (const chunk of stream) {
    if (chunk.type === "text-delta") {
      process.stdout.write(chunk.textDelta);
    } else if (chunk.type === "agent-state") {
      console.log(
        `\n[State]: ${chunk.state.status} - ${chunk.state.userContent.slice(0, 60)}`
      );
    }
  }

  console.log("\n✓ Clarification flow completed");
}

// ============================================================================
// TEST 3: Synced (Blocking) Questions
// ============================================================================

async function testSyncedQuestions() {
  logSection("TEST 3: Synced (Blocking) Questions");

  let questionCount = 0;

  setQueryUserHandler(async (agentId, prompt) => {
    questionCount++;
    console.log(`\n[Synced Question #${questionCount} for ${agentId}]:`);
    console.log(`  ${prompt}`);

    // Simulate user thinking
    await delay(500);

    if (prompt.includes("budget")) {
      return "$5000";
    } else if (prompt.includes("date")) {
      return "December 15th, 2025";
    } else if (prompt.includes("location")) {
      return "Downtown venue with parking";
    }

    return "Confirmed";
  });

  console.log("Starting agent that requires user confirmation...\n");

  const stream = agent({
    prompt:
      "Plan a corporate event for 50 people. Please confirm: budget, date, and location preferences before proceeding.",
  });

  for await (const chunk of stream) {
    if (chunk.type === "text-delta") {
      process.stdout.write(chunk.textDelta);
    }
  }

  console.log(`\n\nTotal synced questions asked: ${questionCount}`);
  console.log("✓ Synced questions test completed");
}

// ============================================================================
// TEST 4: Async Subquestion Spawning
// ============================================================================

async function testAsyncSubquestions() {
  logSection("TEST 4: Async Subquestion Spawning");

  setQueryUserHandler(async (agentId, prompt) => {
    console.log(`[Query for ${agentId.slice(0, 8)}]: ${prompt}`);
    return "Proceed";
  });

  console.log("Starting agent with complex multi-part request...\n");

  const stream = agent({
    prompt:
      "Research and compare: 1) Best programming languages for web development 2) Cloud hosting options 3) Database choices for startups",
  });

  const seenAgents = new Set<string>();

  for await (const chunk of stream) {
    if (chunk.type === "agent-state") {
      if (!seenAgents.has(chunk.agentId)) {
        seenAgents.add(chunk.agentId);
        console.log(
          `\n[New Agent]: ${chunk.agentId.slice(0, 8)} - ${chunk.state.userContent.slice(0, 60)}...`
        );
      }
    } else if (chunk.type === "text-delta") {
      process.stdout.write(chunk.textDelta);
    }
  }

  console.log(`\n\nTotal agents spawned: ${seenAgents.size}`);

  const tree = getAgentTree();
  console.log("\nAgent tree structure:");
  for (const [id, state] of Object.entries(tree)) {
    console.log(
      `  ${id.slice(0, 8)}: ${state.subagents.length} subagents, status=${state.status}`
    );
  }

  console.log("✓ Async subquestions test completed");
}

// ============================================================================
// TEST 5: User Intervention - Delete Agent
// ============================================================================

async function testUserInterventionDelete() {
  logSection("TEST 5: User Intervention - Delete Agent");

  setQueryUserHandler(async (agentId, prompt) => {
    console.log(`[Query for ${agentId.slice(0, 8)}]: ${prompt}`);
    return "Proceed";
  });

  console.log("Starting agent, will delete after 2 seconds...\n");

  const stream = agent({
    prompt: "Write a detailed analysis of machine learning trends in 2025",
  });

  // Start consuming stream
  const streamConsumer = (async () => {
    let rootAgentId: string | null = null;

    for await (const chunk of stream) {
      if (chunk.type === "agent-state" && !rootAgentId) {
        rootAgentId = chunk.agentId;
      }

      if (chunk.type === "text-delta") {
        process.stdout.write(chunk.textDelta);
      }
    }

    return rootAgentId;
  })();

  // Wait 2 seconds then intervene
  await delay(2000);

  const tree = getAgentTree();
  const agentIds = Object.keys(tree);

  if (agentIds.length > 0) {
    const targetId = agentIds[0];
    console.log(`\n\n[INTERVENTION] Deleting agent ${targetId.slice(0, 8)}...`);

    const success = await userIntervention(targetId, {
      userComment: "delete",
    });

    console.log(`Intervention success: ${success}`);
  }

  await streamConsumer;

  console.log("\n✓ User intervention (delete) test completed");
}

// ============================================================================
// TEST 6: User Intervention - Modify Agent
// ============================================================================

async function testUserInterventionModify() {
  logSection("TEST 6: User Intervention - Modify Agent");

  setQueryUserHandler(async (agentId, prompt) => {
    console.log(`[Query for ${agentId.slice(0, 8)}]: ${prompt}`);
    return "Proceed";
  });

  console.log("Starting agent, will modify after 1.5 seconds...\n");

  const stream = agent({
    prompt: "Suggest healthy breakfast ideas",
  });

  const streamConsumer = (async () => {
    for await (const chunk of stream) {
      if (chunk.type === "text-delta") {
        process.stdout.write(chunk.textDelta);
      } else if (chunk.type === "agent-state") {
        console.log(`\n[State]: ${chunk.state.status}`);
      }
    }
  })();

  await delay(1500);

  const tree = getAgentTree();
  const agentIds = Object.keys(tree);

  if (agentIds.length > 0) {
    const targetId = agentIds[0];
    console.log(
      `\n\n[INTERVENTION] Modifying agent ${targetId.slice(0, 8)}...`
    );

    const success = await userIntervention(targetId, {
      userComment: "modify",
      userContent: "Suggest healthy breakfast ideas suitable for diabetics",
    });

    console.log(`Intervention success: ${success}`);
  }

  await streamConsumer;

  console.log("\n✓ User intervention (modify) test completed");
}

// ============================================================================
// TEST 7: Live Agent Tree Monitoring
// ============================================================================

async function testLiveTreeMonitoring() {
  logSection("TEST 7: Live Agent Tree Monitoring");

  setQueryUserHandler(async (agentId, prompt) => {
    console.log(`[Query]: ${prompt}`);
    await delay(300);
    return "Proceed";
  });

  console.log("Starting complex agent with tree monitoring...\n");

  const stream = agent({
    prompt:
      "Create a comprehensive travel itinerary for Japan: Tokyo activities, Kyoto temples, Osaka food scene, and transportation between cities",
  });

  // Monitor tree every 1 second
  const monitorInterval = setInterval(() => {
    const tree = getAgentTree();
    console.log(`\n[TREE SNAPSHOT - ${new Date().toISOString().slice(11, 19)}]`);

    for (const [id, state] of Object.entries(tree)) {
      const indent = state.parentId ? "  " : "";
      console.log(
        `${indent}${id.slice(0, 8)}: ${state.status} | ${state.subagents.length} subs | ${state.userContent.slice(0, 40)}...`
      );
    }

    if (Object.keys(tree).length === 0) {
      console.log("  (empty - all agents completed)");
      clearInterval(monitorInterval);
    }
  }, 1000);

  // Consume stream
  for await (const chunk of stream) {
    if (chunk.type === "text-delta") {
      process.stdout.write(chunk.textDelta);
    }
  }

  clearInterval(monitorInterval);

  console.log("\n✓ Live tree monitoring test completed");
}

// ============================================================================
// TEST 8: Fork/Wait System with Python
// ============================================================================

async function testForkWaitSystem() {
  logSection("TEST 8: Fork/Wait System with Python");

  setQueryUserHandler(async (agentId, prompt) => {
    console.log(`[Query for ${agentId.slice(0, 8)}]: ${prompt}`);
    return "Proceed";
  });

  console.log("Starting agent with Python fork/wait...\n");

  const stream = agent({
    prompt: `Use Python to explore options using fork() and wait():

Example code:
h1 = fork("What are pros of option A?")
h2 = fork("What are pros of option B?")
result_a = wait(h1)
result_b = wait(h2)
print(f"A: {result_a[:100]}\\nB: {result_b[:100]}")
`,
  });

  for await (const chunk of stream) {
    if (chunk.type === "text-delta") {
      process.stdout.write(chunk.textDelta);
    } else if (chunk.type === "tool-call") {
      console.log(`\n[Tool Call]: ${chunk.toolName}`);
    } else if (chunk.type === "tool-result") {
      console.log(`[Tool Result]: ${chunk.result.slice(0, 100)}...`);
    }
  }

  const tree = getAgentTree();
  console.log(`\n\nRemaining agents in tree: ${Object.keys(tree).length}`);

  console.log("✓ Fork/Wait system test completed");
}

// ============================================================================
// TEST 9: User Declines to Answer
// ============================================================================

async function testUserDeclinesAnswer() {
  logSection("TEST 9: User Declines to Answer");

  setQueryUserHandler(async (agentId, prompt) => {
    console.log(`[Query for ${agentId.slice(0, 8)}]: ${prompt}`);

    if (prompt.includes("clarify")) {
      console.log("  → User declines to clarify");
      return null; // User declines
    }

    return "Proceed";
  });

  console.log("Starting agent with ambiguous prompt, user will decline...\n");

  const stream = agent({
    prompt: "Maybe do something? Not sure what though.", // Very ambiguous
  });

  for await (const chunk of stream) {
    if (chunk.type === "text-delta") {
      process.stdout.write(chunk.textDelta);
    } else if (chunk.type === "agent-state") {
      console.log(`\n[State]: ${chunk.state.status} - ${chunk.state.result}`);
    }
  }

  console.log("\n✓ User declines test completed");
}

// ============================================================================
// TEST 10: Error Handling
// ============================================================================

async function testErrorHandling() {
  logSection("TEST 10: Error Handling");

  setQueryUserHandler(async (agentId, prompt) => {
    console.log(`[Query]: ${prompt}`);
    return "Proceed";
  });

  console.log("Starting agent that will execute Python with error...\n");

  const stream = agent({
    prompt: `Execute Python code that will intentionally fail:
    
raise ValueError("This is a test error")
`,
  });

  for await (const chunk of stream) {
    if (chunk.type === "text-delta") {
      process.stdout.write(chunk.textDelta);
    } else if (chunk.type === "tool-result") {
      console.log(`\n[Tool Result]:\n${chunk.result}`);
    } else if (chunk.type === "agent-state" && chunk.state.status === "error") {
      console.log(`\n[Error State]: ${chunk.state.result}`);
    }
  }

  console.log("\n✓ Error handling test completed");
}

// ============================================================================
// TEST 11: Comprehensive Integration Test
// ============================================================================

async function testComprehensiveIntegration() {
  logSection("TEST 11: Comprehensive Integration Test");

  let queryCount = 0;

  setQueryUserHandler(async (agentId, prompt) => {
    queryCount++;
    console.log(`\n[User Query #${queryCount} for ${agentId.slice(0, 8)}]:`);
    console.log(`  ${prompt}`);

    await delay(200); // Simulate user thinking

    if (prompt.includes("budget")) return "$3000";
    if (prompt.includes("location")) return "San Francisco";
    if (prompt.includes("date")) return "March 2026";
    if (prompt.includes("clarify")) return "A tech conference for 100 people";

    return "Confirmed";
  });

  console.log("Starting comprehensive multi-feature test...\n");

  const stream = agent({
    prompt:
      "Plan a tech conference. unclear about some details? Explore venue options, catering, and speaker lineup in parallel.",
  });

  // Monitor tree in background
  const monitorInterval = setInterval(() => {
    const tree = getAgentTree();
    if (Object.keys(tree).length > 0) {
      console.log(`\n[Tree]: ${Object.keys(tree).length} active agents`);
    }
  }, 2000);

  // Intervene midway
  setTimeout(async () => {
    const tree = getAgentTree();
    const subagents = Object.values(tree).filter((s) => s.parentId);

    if (subagents.length > 0) {
      console.log(
        `\n[INTERVENTION] Adding comment to subagent ${subagents[0].agentId.slice(0, 8)}`
      );
      await userIntervention(subagents[0].agentId, {
        userComment: "User is monitoring this closely",
      });
    }
  }, 3000);

  let finalResult = "";
  for await (const chunk of stream) {
    if (chunk.type === "text-delta") {
      finalResult += chunk.textDelta;
      process.stdout.write(chunk.textDelta);
    }
  }

  clearInterval(monitorInterval);

  console.log(`\n\nFinal result length: ${finalResult.length}`);
  console.log(`Total user queries: ${queryCount}`);

  const finalTree = getAgentTree();
  console.log(`Remaining agents: ${Object.keys(finalTree).length}`);

  console.log("✓ Comprehensive integration test completed");
}

// ============================================================================
// TEST RUNNER
// ============================================================================

const scenarios: TestScenario[] = [
  {
    name: "Basic Execution",
    description: "Simple agent with auto-responder",
    run: testBasicExecution,
  },
  {
    name: "Clarification Flow",
    description: "Test ambiguous input requiring clarification",
    run: testClarificationFlow,
  },
  {
    name: "Synced Questions",
    description: "Test blocking questions workflow",
    run: testSyncedQuestions,
  },
  {
    name: "Async Subquestions",
    description: "Test parallel subagent spawning",
    run: testAsyncSubquestions,
  },
  {
    name: "User Intervention (Delete)",
    description: "Test deleting an agent mid-execution",
    run: testUserInterventionDelete,
  },
  {
    name: "User Intervention (Modify)",
    description: "Test modifying an agent mid-execution",
    run: testUserInterventionModify,
  },
  {
    name: "Live Tree Monitoring",
    description: "Monitor agent tree in real-time",
    run: testLiveTreeMonitoring,
  },
  {
    name: "Fork/Wait System",
    description: "Test Python fork() and wait()",
    run: testForkWaitSystem,
  },
  {
    name: "User Declines",
    description: "Test user declining to answer",
    run: testUserDeclinesAnswer,
  },
  {
    name: "Error Handling",
    description: "Test error handling in Python execution",
    run: testErrorHandling,
  },
  {
    name: "Comprehensive Integration",
    description: "All features combined",
    run: testComprehensiveIntegration,
  },
];

async function runAllTests() {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                    AGENT SYSTEM TEST SUITE                                 ║");
  console.log("║                                                                            ║");
  console.log(`║  Total Tests: ${scenarios.length.toString().padEnd(63)}║`);
  console.log("╚════════════════════════════════════════════════════════════════════════════╝");

  const results: Array<{ name: string; success: boolean; error?: string }> = [];

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];

    console.log(`\n\n[${ i + 1 }/${scenarios.length}] ${scenario.name}`);
    console.log(`Description: ${scenario.description}`);

    try {
      await scenario.run();
      results.push({ name: scenario.name, success: true });
      console.log(`\n✅ ${scenario.name} PASSED`);
    } catch (error: any) {
      results.push({
        name: scenario.name,
        success: false,
        error: error.message,
      });
      console.error(`\n❌ ${scenario.name} FAILED:`, error.message);
    }

    // Clean up between tests
    await delay(1000);
  }

  // Print summary
  logSection("TEST SUMMARY");

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`Total Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log("\nFailed Tests:");
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
  }

  console.log("\n" + "=".repeat(80) + "\n");
}

async function runSingleTest(testNumber: number) {
  if (testNumber < 1 || testNumber > scenarios.length) {
    console.error(`Test number must be between 1 and ${scenarios.length}`);
    process.exit(1);
  }

  const scenario = scenarios[testNumber - 1];
  console.log(`\nRunning: ${scenario.name}`);
  console.log(`Description: ${scenario.description}\n`);

  try {
    await scenario.run();
    console.log(`\n✅ ${scenario.name} PASSED`);
  } catch (error: any) {
    console.error(`\n❌ ${scenario.name} FAILED:`, error.message);
    process.exit(1);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Run all tests
    await runAllTests();
  } else if (args[0] === "--list") {
    // List all tests
    console.log("\nAvailable Tests:");
    scenarios.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.name} - ${s.description}`);
    });
    console.log("\nUsage:");
    console.log("  npm test              # Run all tests");
    console.log("  npm test -- N         # Run test N");
    console.log("  npm test -- --list    # List all tests");
  } else {
    // Run specific test
    const testNum = parseInt(args[0], 10);
    await runSingleTest(testNum);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { scenarios, runAllTests, runSingleTest };
