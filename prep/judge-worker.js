/* Judge worker: runs user Python against a problem's tests via Pyodide.
 * Classic worker (importScripts) so no bundling is needed; Pyodide comes
 * from the official CDN and the judge harness is fetched alongside this
 * file. The main thread enforces timeouts by terminating this worker. */
/* global loadPyodide */
importScripts('https://cdn.jsdelivr.net/pyodide/v314.0.6/full/pyodide.js')

const pyodideReady = (async () => {
  const py = await loadPyodide()
  const harness = await fetch('judge_harness.py').then((r) => {
    if (!r.ok) throw new Error('failed to fetch judge harness: ' + r.status)
    return r.text()
  })
  py.runPython(harness)
  py.runPython('import json as _judge_json')
  return py
})()

pyodideReady
  .then(() => postMessage({ type: 'ready' }))
  .catch((e) => postMessage({ type: 'boot_error', message: String(e) }))

onmessage = async (e) => {
  const msg = e.data
  if (!msg || msg.type !== 'run') return
  try {
    const py = await pyodideReady
    py.globals.set('USER_CODE', msg.code)
    py.globals.set('PROBLEM_JSON', JSON.stringify(msg.problem))
    const out = py.runPython(
      '_judge_json.dumps(run_problem(USER_CODE, _judge_json.loads(PROBLEM_JSON)))',
    )
    postMessage({ type: 'result', id: msg.id, results: JSON.parse(out) })
  } catch (err) {
    postMessage({ type: 'error', id: msg.id, message: String(err) })
  }
}
