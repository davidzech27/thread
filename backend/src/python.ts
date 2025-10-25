export default function python(
  userCode: string,
  api: Record<string, (...args: any[]) => any> = {}
) {
  const names = Object.keys(api);

  const bootstrap =
    `
import sys, json, threading, queue, itertools, ast

_ids = itertools.count(1)
_waiters = {}           # id -> Queue
_waiters_lock = threading.Lock()

def _stdin_worker():
    for line in sys.stdin:
        try:
            msg = json.loads(line)
        except Exception:
            continue
        if not isinstance(msg, dict) or "id" not in msg:
            continue
        rid = msg["id"]
        with _waiters_lock:
            q = _waiters.get(rid)
        if q:
            q.put(msg)

threading.Thread(target=_stdin_worker, daemon=True).start()

def __send_request(rid, fn_name, args):
    sys.stdout.write(json.dumps({"id": rid, "call": fn_name, "args": args}) + "\\n")
    sys.stdout.flush()

def __js_call(_fn_name, *args):
    rid = next(_ids)
    q = queue.Queue()
    with _waiters_lock:
        _waiters[rid] = q
    __send_request(rid, _fn_name, args)
    resp = q.get()  # BLOCKS until JS replies
    with _waiters_lock:
        _waiters.pop(rid, None)
    if resp.get("ok"):
        return resp.get("result")
    raise RuntimeError(resp.get("error", "JS error"))

__js_funcs = ` + JSON.stringify(names) + `
for __n in __js_funcs:
    exec(f"def {__n}(*a):\\n    return __js_call('{__n}', *a)\\n")

# REPL-style evaluation
__user_code = ` + JSON.stringify(userCode) + `
try:
    __tree = ast.parse(__user_code, mode='exec')
    __result = None

    if __tree.body:
        # Check if last node is an expression
        __last = __tree.body[-1]
        if isinstance(__last, ast.Expr):
            # Split: execute all but last, eval last
            __stmts = __tree.body[:-1]
            __expr = __last.value

            # Execute statements
            if __stmts:
                exec(compile(ast.Module(body=__stmts, type_ignores=[]), '<user>', 'exec'))

            # Evaluate last expression
            __result = eval(compile(ast.Expression(body=__expr), '<user>', 'eval'))
        else:
            # All statements, no expression to return
            exec(compile(__tree, '<user>', 'exec'))

    # Send result back to JS
    sys.stdout.write(json.dumps({"type": "result", "value": __result}) + "\\n")
    sys.stdout.flush()
except Exception as __e:
    sys.stdout.write(json.dumps({"type": "error", "error": str(__e)}) + "\\n")
    sys.stdout.flush()
    raise
`;

  const proc = Bun.spawn(["python3", "-u", "-c", bootstrap], {
    stdin: "pipe",
    stdout: "pipe",  // Python -> JS requests
    stderr: "pipe",  // Python logs
  });

  const enc = new TextEncoder();
  const toText = (s: ReadableStream<Uint8Array>) => s.pipeThrough(new TextDecoderStream());
  const toLines = (s: ReadableStream<string>) =>
    s.pipeThrough(new TransformStream<string, string>({
      transform(chunk, ctrl) { for (const l of chunk.split("\n")) if (l) ctrl.enqueue(l); }
    }));

  const stdin = proc.stdin;
  const write = (s: string) => stdin.write(enc.encode(s));
  const writeln = (s: string) => write(s.endsWith("\n") ? s : s + "\n");
  const close = (code = 0) => { try { stdin.end(); } catch { } try { proc.kill(code); } catch { } };

  // Promise that resolves when Python code finishes executing
  let resolveResult: (value: any) => void;
  let rejectResult: (error: Error) => void;
  const resultPromise = new Promise<any>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  // Handle RPC calls and result messages from Python
  (async () => {
    for await (const line of toLines(toText(proc.stdout))) {
      let msg: any;
      try { msg = JSON.parse(line); } catch { continue; }

      // Check if it's a result/error message
      if (msg.type === "result") {
        resolveResult!(msg.value);
        continue;
      }
      if (msg.type === "error") {
        rejectResult!(new Error(msg.error));
        continue;
      }

      // Otherwise, handle as RPC call
      const { id, call, args = [] } = msg || {};
      if (!id || typeof call !== "string") continue;

      const fn = api[call];
      try {
        if (!fn) throw new Error(`No such JS function: ${call}`);
        const result = await fn(...args);   // async JS OK; Python waits
        writeln(JSON.stringify({ id, ok: true, result }));
      } catch (err: any) {
        writeln(JSON.stringify({ id, ok: false, error: String(err?.message ?? err) }));
      }
    }
  })();

  return {
    proc,
    stdin,
    stderr: toLines(toText(proc.stderr)), // for logs
    result: resultPromise, // Promise that resolves with the final result
    write, writeln, close,
  };
}
