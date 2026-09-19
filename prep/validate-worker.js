/* Validation worker: compile-check Python + confirm an expected symbol is
 * defined. No test data, no correctness judging — that's what LeetCode is for.
 * Classic worker + Pyodide from CDN; main thread enforces the timeout. */
/* global loadPyodide */
importScripts('https://cdn.jsdelivr.net/pyodide/v314.0.6/full/pyodide.js')

const ready = (async () => {
  const py = await loadPyodide()
  py.runPython('import ast, io, contextlib, json')
  return py
})()

ready
  .then(() => postMessage({ type: 'ready' }))
  .catch((e) => postMessage({ type: 'boot_error', message: String(e) }))

const CHECK = `
def _validate(code, expect):
    # 1) parse — catches syntax/indentation errors
    try:
        ast.parse(code)
    except SyntaxError as e:
        return {"status": "invalid", "message": "SyntaxError: " + str(e)}
    # 2) execute the definitions — catches import/NameError at load time
    ns = {}
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            exec(code, ns)
    except Exception as e:
        return {"status": "invalid",
                "message": type(e).__name__ + " while loading: " + str(e)}
    # 3) if a symbol was named, confirm it exists and is callable
    if expect:
        obj = ns.get(expect)
        if obj is None:
            return {"status": "invalid",
                    "message": "expected '" + expect + "' to be defined, but it isn't"}
        if not callable(obj):
            return {"status": "invalid",
                    "message": "'" + expect + "' is defined but not callable"}
    return {"status": "ok",
            "message": "Looks valid — compiles"
                       + ((" and '" + expect + "' is defined") if expect else "")
                       + ". Paste into LeetCode to check correctness.",
            "stdout": buf.getvalue()[:2000]}
`

onmessage = async (e) => {
  const msg = e.data
  if (!msg || msg.type !== 'validate') return
  try {
    const py = await ready
    py.runPython(CHECK)
    py.globals.set('_C', msg.code)
    py.globals.set('_E', msg.expectSymbol || '')
    const out = py.runPython('json.dumps(_validate(_C, _E))')
    postMessage({ type: 'result', id: msg.id, outcome: JSON.parse(out) })
  } catch (err) {
    postMessage({ type: 'result', id: msg.id, outcome: { status: 'error', message: String(err) } })
  }
}
