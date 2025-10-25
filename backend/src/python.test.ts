import { test, expect, describe } from "bun:test";
import python from "./python";

describe("Python REPL", () => {
  test("returns last expression", async () => {
    const py = python(`2 + 2`, {});
    const result = await py.result;
    expect(result).toBe(4);
    py.close();
  });

  test("returns last expression with multiple statements", async () => {
    const py = python(
      `
x = 10
y = 20
x + y
`,
      {}
    );
    const result = await py.result;
    expect(result).toBe(30);
    py.close();
  });

  test("returns None when no expression at end", async () => {
    const py = python(
      `
x = 10
y = 20
`,
      {}
    );
    const result = await py.result;
    expect(result).toBe(null);
    py.close();
  });

  test("returns string value", async () => {
    const py = python(`"hello world"`, {});
    const result = await py.result;
    expect(result).toBe("hello world");
    py.close();
  });

  test("returns list", async () => {
    const py = python(`[1, 2, 3, 4, 5]`, {});
    const result = await py.result;
    expect(result).toEqual([1, 2, 3, 4, 5]);
    py.close();
  });

  test("returns dict", async () => {
    const py = python(`{"name": "Alice", "age": 30}`, {});
    const result = await py.result;
    expect(result).toEqual({ name: "Alice", age: 30 });
    py.close();
  });

  test("handles empty code", async () => {
    const py = python(``, {});
    const result = await py.result;
    expect(result).toBe(null);
    py.close();
  });
});

describe("JS function calls from Python", () => {
  test("calls sync JS function", async () => {
    const py = python(`reverse("hello")`, {
      reverse(s: string) {
        return s.split("").reverse().join("");
      },
    });
    const result = await py.result;
    expect(result).toBe("olleh");
    py.close();
  });

  test("calls async JS function", async () => {
    const py = python(`asyncDouble(21)`, {
      async asyncDouble(n: number) {
        await new Promise((r) => setTimeout(r, 10));
        return n * 2;
      },
    });
    const result = await py.result;
    expect(result).toBe(42);
    py.close();
  });

  test("calls multiple JS functions", async () => {
    const py = python(
      `
a = add(10, 5)
b = multiply(3, 4)
a + b
`,
      {
        add(x: number, y: number) {
          return x + y;
        },
        multiply(x: number, y: number) {
          return x * y;
        },
      }
    );
    const result = await py.result;
    expect(result).toBe(27); // 15 + 12
    py.close();
  });

  test("handles JS function returning object", async () => {
    const py = python(`getUser()`, {
      getUser() {
        return { id: 1, name: "Bob", active: true };
      },
    });
    const result = await py.result;
    expect(result).toEqual({ id: 1, name: "Bob", active: true });
    py.close();
  });
});

describe("fetch function", () => {
  test("can call fetch from Python", async () => {
    const py = python(
      `fetch("https://httpbin.org/get")`,
      {
        async fetch(url: string) {
          const response = await globalThis.fetch(url);
          const text = await response.text();
          return text;
        },
      }
    );
    const result = await py.result;
    expect(typeof result).toBe("string");
    expect(result).toContain("httpbin");
    py.close();
  });

  test("fetch can parse JSON", async () => {
    const py = python(
      `
import json
response = fetch("https://httpbin.org/json")
data = json.loads(response)
data
`,
      {
        async fetch(url: string) {
          const response = await globalThis.fetch(url);
          const text = await response.text();
          return text;
        },
      }
    );
    const result = await py.result;
    expect(typeof result).toBe("object");
    py.close();
  });
});

describe("Error handling", () => {
  test("throws error for invalid Python code", async () => {
    const py = python(`invalid syntax here`, {});
    await expect(py.result).rejects.toThrow();
    py.close();
  });

  test("throws error when calling non-existent JS function", async () => {
    const py = python(`nonExistent()`, {});
    await expect(py.result).rejects.toThrow(/not defined/);
    py.close();
  });

  test("handles Python runtime errors", async () => {
    const py = python(`1 / 0`, {});
    await expect(py.result).rejects.toThrow();
    py.close();
  });

  test("handles errors in JS functions", async () => {
    const py = python(`willThrow()`, {
      willThrow() {
        throw new Error("JS error!");
      },
    });
    await expect(py.result).rejects.toThrow();
    py.close();
  });
});

describe("stderr output", () => {
  test("print() output goes to stderr", async () => {
    const logs: string[] = [];
    const py = python(
      `
import sys
print("debug message", file=sys.stderr)
42
`,
      {}
    );

    // Collect stderr
    (async () => {
      for await (const line of py.stderr) {
        logs.push(line);
      }
    })();

    const result = await py.result;
    expect(result).toBe(42);

    // Give stderr time to flush
    await new Promise((r) => setTimeout(r, 100));
    expect(logs).toContain("debug message");
    py.close();
  });
});

describe("Complex scenarios", () => {
  test("Python can call fetch and process result", async () => {
    const py = python(
      `
import json

# Fetch data
response = fetch("https://httpbin.org/json")
data = json.loads(response)

# Process it
data.get("slideshow", {}).get("title", "No title")
`,
      {
        async fetch(url: string) {
          const response = await globalThis.fetch(url);
          const text = await response.text();
          return text;
        },
      }
    );

    const result = await py.result;
    expect(typeof result).toBe("string");
    py.close();
  });

  test("Multiple JS calls with different types", async () => {
    const py = python(
      `
# Get some data
user = getUser(123)

# Transform it
name_upper = upper(user["name"])

# Return processed result
{
  "id": user["id"],
  "name": name_upper,
  "doubled_id": double(user["id"])
}
`,
      {
        getUser(id: number) {
          return { id, name: "alice", email: "alice@example.com" };
        },
        upper(s: string) {
          return s.toUpperCase();
        },
        double(n: number) {
          return n * 2;
        },
      }
    );

    const result = await py.result;
    expect(result).toEqual({
      id: 123,
      name: "ALICE",
      doubled_id: 246,
    });
    py.close();
  });

  test("Python list comprehension with JS function", async () => {
    const py = python(
      `[double(x) for x in [1, 2, 3, 4, 5]]`,
      {
        double(n: number) {
          return n * 2;
        },
      }
    );

    const result = await py.result;
    expect(result).toEqual([2, 4, 6, 8, 10]);
    py.close();
  });
});
