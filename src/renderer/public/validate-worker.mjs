/* Validation worker: compile-check Python, confirm the expected symbol, and
 * execute authored local tests when a problem pack provides them.
 *
 * A MODULE worker: Pyodide 314 refuses to boot in a classic worker ("Classic
 * web workers are not supported"). The runtime ships inside the app
 * (./pyodide/), so this works offline; the main thread enforces the timeout. */
import { loadPyodide } from './pyodide/pyodide.mjs'

const ready = (async () => {
  const py = await loadPyodide({ indexURL: new URL('./pyodide/', import.meta.url).href })
  py.runPython('import ast, io, contextlib, json, copy')
  return py
})()

ready
  .then(() => postMessage({ type: 'ready' }))
  .catch((e) => postMessage({ type: 'boot_error', message: String(e) }))

const CHECK = `
def _same(actual, expected, mode):
    if mode == "unordered" and isinstance(actual, list) and isinstance(expected, list):
        return sorted(actual, key=repr) == sorted(expected, key=repr)
    if mode == "unordered_deep" and isinstance(actual, list) and isinstance(expected, list):
        norm = lambda xs: sorted([sorted(x, key=repr) if isinstance(x, list) else x for x in xs], key=repr)
        return norm(actual) == norm(expected)
    if mode == "float" and isinstance(actual, (int, float)) and isinstance(expected, (int, float)):
        return abs(actual - expected) <= 1e-6 * max(1, abs(expected))
    return actual == expected

def _validate(code, expect, signature_type, tests_json, compare, mode, inplace_arg):
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
    tests = json.loads(tests_json) if tests_json else []
    if not tests:
        return {"status": "ok",
                "message": "Looks valid - compiles"
                           + ((" and '" + expect + "' is defined") if expect else "")
                           + ". This pack has no local correctness cases; verify on LeetCode.",
                "stdout": buf.getvalue()[:2000]}

    for index, test in enumerate(tests):
        args = copy.deepcopy(test.get("input", []))
        expected = test.get("expected")
        try:
            if signature_type == "class":
                operations, call_args = args
                instance = obj(*call_args[0])
                actual = [None]
                for name, values in zip(operations[1:], call_args[1:]):
                    actual.append(getattr(instance, name)(*values))
            else:
                result = obj(*args)
                actual = args[inplace_arg] if mode == "inplace" else result
        except Exception as e:
            return {"status": "invalid",
                    "message": "Test " + str(index + 1) + " raised " + type(e).__name__ + ": " + str(e)}
        if not _same(actual, expected, compare):
            return {"status": "invalid",
                    "message": "Test " + str(index + 1) + " failed (" + test.get("kind", "case") + "). Expected "
                               + repr(expected)[:500] + ", got " + repr(actual)[:500]}
    return {"status": "ok",
            "message": "Passed " + str(len(tests)) + "/" + str(len(tests)) + " local tests.",
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
    py.globals.set('_ST', msg.signatureType || 'function')
    py.globals.set('_T', JSON.stringify(msg.tests || []))
    py.globals.set('_CMP', msg.compare || 'exact')
    py.globals.set('_M', msg.mode || '')
    py.globals.set('_IA', Number(msg.inplaceArg || 0))
    const out = py.runPython('json.dumps(_validate(_C, _E, _ST, _T, _CMP, _M, _IA))')
    postMessage({ type: 'result', id: msg.id, outcome: JSON.parse(out) })
  } catch (err) {
    postMessage({ type: 'result', id: msg.id, outcome: { status: 'error', message: String(err) } })
  }
}
