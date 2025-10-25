"""
OpenAI API handler module.
Provides a simple interface for calling OpenAI's chat completion API.
"""

import os
import openai

# Initialize OpenAI API key from environment
openai.api_key = os.getenv("OPENAI_API_KEY")
if not openai.api_key:
    raise RuntimeError("Set OPENAI_API_KEY in your environment before running.")


# -------------------------
# Helper: call LLM (sync)
# -------------------------
async def queryai(
    prompt: str,
    model: str = "gpt-3.5-turbo",
    temperature: float = 0.3,
    max_tokens: int = 800,
) -> str:
    """
    Call the chat LLM and return its text output (simple wrapper).

    Args:
        prompt: The user prompt/question to send to the LLM
        model: The OpenAI model to use (default: gpt-3.5-turbo)
        temperature: Controls randomness (0.0 = deterministic, 1.0 = creative)
        max_tokens: Maximum number of tokens in the response

    Returns:
        The LLM's response as a string, or an error message if the call fails
    """
    try:
        resp = openai.ChatCompletion.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "You are an assistant that helps break down tasks and produce clear, concise answers.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return resp.choices[0].message["content"].strip()
    except Exception as e:
        # Basic error handling so sub-agents don't crash the whole run
        return f"[LLM error: {e}]"

# Mock other functions:
async def queryuser(agent_id):
    '''
    get user feedback on this agent node, returns empty if user does not give anything
    '''
    return ""


    