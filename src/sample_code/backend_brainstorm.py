"""
Proof-of-concept async recursive agent skeleton.

Run with Python 3.8+.

This implements:
- Agent class with agent_id, user_comment, user_content
- Steps 1-6 control flow as async methods
- Async spawning of subagents for subquestions
- Live-updated tree of running agents
- user_intervention(agent_id, **overrides) to override agent state/values
- Placeholders for query_user and query_ai (replace with real implementations)
"""

import asyncio
import uuid
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field

# Global in-memory agent registry (live tree)
AGENT_TREE: Dict[str, "Agent"] = {}
AGENT_TREE_LOCK = asyncio.Lock()


@dataclass
class AgentResult:
    agent_id: str
    response: Optional[str] = None
    status: str = "running"  # running / completed / deleted / modified
    metadata: Dict[str, Any] = field(default_factory=dict)


class Agent:
    """
    Agent object that follows the rules you specified.

    Variables:
    - agent_id: unique id
    - user_comment: "unchanged" | "delete" | "modify" | custom text
    - user_content: the actual question/content from user
    """

    def __init__(self, user_content: str, user_comment: str = "unchanged"):
        self.agent_id = str(uuid.uuid4())
        self.user_content = user_content
        self.user_comment = user_comment
        self.status = "running"
        self.subagents: List[str] = []  # list of agent_ids
        self.result: Optional[AgentResult] = None
        self.lock = asyncio.Lock()
        # register in global tree
        asyncio.get_event_loop().create_task(self._register())

    async def _register(self):
        """Add self to the global AGENT_TREE in a concurrency-safe way."""
        async with AGENT_TREE_LOCK:
            AGENT_TREE[self.agent_id] = self

    async def _unregister(self):
        """Remove self from AGENT_TREE."""
        async with AGENT_TREE_LOCK:
            AGENT_TREE.pop(self.agent_id, None)

    async def run(self):
        """
        Core run loop implementing steps 1-6.
        This is intentionally linear and conservative.
        """
        try:
            # STEP 1: Decide if user clarification needed
            needs_clarification = await decide_needs_clarification(self.user_content)
            if needs_clarification:
                resp = await query_user(self.agent_id, "Clarify: " + self.user_content)
                if resp is None:
                    # user did not respond -> stop here
                    self.result = AgentResult(self.agent_id, response=None, status="completed")
                    self.status = "completed"
                    return self.result
                # use user's clarification to update content
                self.user_content = resp

            # STEP 2: Decide if a synced (blocking) question needed before proceeding
            while True:
                synced_q = await decide_synced_question(self.user_content)
                if synced_q is None:
                    break
                sync_resp = await query_user(self.agent_id, synced_q)
                if sync_resp is None:
                    # user didn't answer; treat as stop for demo
                    self.result = AgentResult(self.agent_id, response=None, status="completed")
                    self.status = "completed"
                    return self.result
                # incorporate sync response into context and continue loop
                self.user_content += f"\n[synced_answer:{sync_resp}]"

            # STEP 3: generate async subquestions
            subqs = await generate_async_subquestions(self.user_content)

            # STEP 4: spawn subagents (async) and query ai for current question
            sub_tasks = []
            for q in subqs:
                subagent = Agent(user_content=q)
                self.subagents.append(subagent.agent_id)
                # spawn subagent run task
                t = asyncio.create_task(run_agent_and_capture(subagent))
                sub_tasks.append(t)

            # query AI for this agent's primary answer (non-blocking)
            my_ai_task = asyncio.create_task(query_ai(self.agent_id, self.user_content))

            # STEP 5: Examine user_comment and handle delete/modify/unchanged
            # we check current user_comment before awaiting subagents resolution
            if self.user_comment == "delete":
                # ask AI why deletion would happen
                why = await query_ai(self.agent_id, f"Why would user delete agent {self.agent_id}?")
                self.result = AgentResult(self.agent_id, response=why, status="deleted")
                self.status = "deleted"
                # cancel subagents
                for t in sub_tasks:
                    t.cancel()
                await self._unregister()
                return self.result

            if self.user_comment == "modify":
                # For demo return modified content
                modified = await query_ai(self.agent_id, f"Modify content for: {self.user_content}")
                self.result = AgentResult(self.agent_id, response=modified, status="modified")
                self.status = "modified"
                await asyncio.gather(*sub_tasks, return_exceptions=True)
                await self._unregister()
                return self.result

            # default: unchanged -> wait for own AI answer and subagents
            my_answer = await my_ai_task
            # collect subagent results
            sub_results = []
            for t in asyncio.as_completed(sub_tasks):
                try:
                    r = await t
                    sub_results.append(r)
                except asyncio.CancelledError:
                    sub_results.append(AgentResult("cancelled", response=None, status="cancelled"))
                except Exception as e:
                    sub_results.append(AgentResult("error", response=str(e), status="error"))

            # STEP 6: Summary
            summary, new_uncertainty = await summarize_with_ai(my_answer, sub_results)
            if new_uncertainty:
                # add to context and loop back to STEP 2 (synced questions)
                self.user_content += "\n[uncertainty_summary] " + summary
                # simple loop to ask synced question again. limit loop depth in production.
                synced_q = await decide_synced_question(self.user_content)
                if synced_q:
                    sync_resp = await query_user(self.agent_id, synced_q)
                    if sync_resp:
                        self.user_content += f"\n[synced_answer:{sync_resp}]"
                        # naive: resolve again by calling AI once
                        final_answer = await query_ai(self.agent_id, self.user_content)
                        self.result = AgentResult(self.agent_id, response=final_answer, status="completed")
                    else:
                        self.result = AgentResult(self.agent_id, response=None, status="completed")
                else:
                    # fallback
                    self.result = AgentResult(self.agent_id, response=summary, status="completed")
            else:
                self.result = AgentResult(self.agent_id, response=summary, status="completed")

            self.status = "completed"
            # optional: attach sub-results metadata
            self.result.metadata["subagents"] = [{ "id": r.agent_id, "status": r.status, "response": r.response } for r in sub_results]
            await self._unregister()
            return self.result

        except Exception as exc:
            self.status = "error"
            self.result = AgentResult(self.agent_id, response=str(exc), status="error")
            await self._unregister()
            return self.result


# ---------------------
# Helper orchestration
# ---------------------

async def run_agent_and_capture(agent: Agent) -> AgentResult:
    """Run an agent instance and return its AgentResult object."""
    res = await agent.run()
    return res


# ---------------------
# Decision / generation / IO stubs
# ---------------------

async def decide_needs_clarification(user_content: str) -> bool:
    """
    Decide whether clarification is needed.
    Placeholder: simple heuristic based on punctuation or keywords.
    Replace with ML/NLP classifier as needed.
    """
    await asyncio.sleep(0)  # yield control
    return "?" in user_content or "clarify" in user_content.lower()


async def decide_synced_question(user_content: str) -> Optional[str]:
    """
    Decide whether a blocking (synced) question must be asked before proceeding.
    Return the question string or None.
    Placeholder: if 'confirm:' token present, ask a simple confirm question.
    """
    await asyncio.sleep(0)
    if "confirm:" in user_content.lower():
        return "Please confirm the item marked 'confirm' in your request."
    return None


async def generate_async_subquestions(user_content: str) -> List[str]:
    """
    Create a list of async subquestions to ask.
    Placeholder splits content into short sub-requests heuristically.
    """
    await asyncio.sleep(0)
    # naive split: each sentence -> subquestion
    parts = [p.strip() for p in user_content.split('.') if p.strip()]
    # limit to small number for demo
    return parts[:4]


# I/O stubs - to be replaced with real implementations

async def query_user(agent_id: str, prompt: str) -> Optional[str]:
    """
    Send prompt to user and wait for their reply (sync). Return None if user declines to answer.
    For demo this function simulates an interactive user:
    - returns a canned string after delay
    - or None if prompt contains 'noanswer' token
    """
    print(f"[query_user] agent={agent_id} prompt={prompt}")
    await asyncio.sleep(0.1)
    if "noanswer" in prompt:
        return None
    # demo auto-responses: in real system hook UI or messaging system
    return "demo_user_response"


async def query_ai(agent_id: str, prompt: str) -> str:
    """
    Query AI for prompt asynchronously and return textual response.
    Replace with real API call. Must be non-blocking.
    """
    print(f"[query_ai] agent={agent_id} prompt={prompt[:80]}")
    await asyncio.sleep(0.2)  # simulate latency
    return f"ai_response_for[{agent_id}]: summary of '{prompt[:40]}'"


async def summarize_with_ai(main_answer: str, subagent_results: List[AgentResult]) -> (str, bool):
    """
    Query AI to summarize combined answers and determine if user's opinion introduces new uncertainty.
    Returns (summary_text, new_uncertainty_bool).
    Placeholder uses simple heuristic.
    """
    await asyncio.sleep(0.1)
    # simple concatenation for demo
    parts = [main_answer] + [r.response or "" for r in subagent_results]
    summary = " | ".join(parts)[:1000]
    # naive uncertainty detection
    new_uncertainty = "contradict" in summary or "uncertain" in summary
    return summary, new_uncertainty


# ---------------------
# User intervention
# ---------------------

async def user_intervention(agent_id: str, **overrides) -> bool:
    """
    User intervention hook.
    Allows overriding agent fields like user_comment, user_content, status.
    Returns True if intervention applied, False if agent not found.
    """
    async with AGENT_TREE_LOCK:
        agent = AGENT_TREE.get(agent_id)
        if not agent:
            return False
    async with agent.lock:
        # apply supported overrides conservatively
        if "user_comment" in overrides:
            agent.user_comment = overrides["user_comment"]
        if "user_content" in overrides:
            agent.user_content = overrides["user_content"]
        if "status" in overrides:
            agent.status = overrides["status"]
        return True


# ---------------------
# Tree view utilities
# ---------------------

async def get_agent_tree_snapshot() -> Dict[str, Dict[str, Any]]:
    """
    Return a snapshot of the current agent tree with minimal info.
    Useful for a live UI.
    """
    async with AGENT_TREE_LOCK:
        snapshot = {
            aid: {
                "user_content": a.user_content,
                "user_comment": a.user_comment,
                "status": a.status,
                "subagents": list(a.subagents)
            } for aid, a in AGENT_TREE.items()
        }
    return snapshot


# ---------------------
# Demo main
# ---------------------

async def main_demo():
    """
    Demonstration:
    - create a root agent, run it
    - show the live tree snapshot while running
    - demonstrate user_intervention by modifying a subagent after spawn
    """
    root = Agent(user_content="Please analyze X. confirm: true. Also split into subtasks. clarify this?")
    run_task = asyncio.create_task(run_agent_and_capture(root))

    # poll tree while things run
    for _ in range(6):
        snap = await get_agent_tree_snapshot()
        print("AGENT TREE SNAPSHOT:", snap)
        await asyncio.sleep(0.15)

    # intervene: if any subagent exists, set its user_comment to 'delete'
    async with AGENT_TREE_LOCK:
        sub_ids = [aid for aid in AGENT_TREE if aid != root.agent_id]
    if sub_ids:
        await user_intervention(sub_ids[0], user_comment="delete")
        print(f"Intervened: set {sub_ids[0]} comment=delete")

    res = await run_task
    print("ROOT RESULT:", res)
    final_snap = await get_agent_tree_snapshot()
    print("FINAL AGENT TREE:", final_snap)


if __name__ == "__main__":
    asyncio.run(main_demo())
