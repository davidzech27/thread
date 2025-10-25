"""
Sample usage of the ai_handle module.
Demonstrates how to use the OpenAI API wrapper to interact with the LLM.
"""

from ai_handle import call_llm


def main():
    """
    Example function showing how to use the call_llm function.
    """
    # Example 1: Simple question
    print("=" * 50)
    print("Example 1: Simple Question")
    print("=" * 50)
    prompt1 = "What are the key benefits of using Python for backend development?"
    response1 = call_llm(prompt1)
    print(f"Prompt: {prompt1}")
    print(f"Response: {response1}\n")

    # Example 2: Task breakdown
    print("=" * 50)
    print("Example 2: Task Breakdown")
    print("=" * 50)
    prompt2 = "Break down the task of building a REST API into 5 main steps."
    response2 = call_llm(prompt2, temperature=0.5)
    print(f"Prompt: {prompt2}")
    print(f"Response: {response2}\n")

    # Example 3: Code generation with higher temperature
    print("=" * 50)
    print("Example 3: Creative Response")
    print("=" * 50)
    prompt3 = (
        "Suggest 3 creative names for a productivity app focused on task management."
    )
    response3 = call_llm(prompt3, temperature=0.8, max_tokens=200)
    print(f"Prompt: {prompt3}")
    print(f"Response: {response3}\n")

    # Example 4: Using a different model (if available)
    print("=" * 50)
    print("Example 4: Using GPT-4")
    print("=" * 50)
    prompt4 = "Explain the concept of asynchronous programming in one paragraph."
    response4 = call_llm(prompt4, model="gpt-4", temperature=0.3)
    print(f"Prompt: {prompt4}")
    print(f"Response: {response4}\n")


if __name__ == "__main__":
    # Make sure OPENAI_API_KEY is set before running
    main()
