/* Validation worker: compile-check Python, confirm the expected symbol, and
 * execute authored local tests when a problem pack provides them.
 *
 * A MODULE worker: Pyodide 314 refuses to boot in a classic worker ("Classic
 * web workers are not supported"). The runtime ships inside the app
 * (./pyodide/), so this works offline; the main thread enforces the timeout. */
import { loadPyodide } from './pyodide/pyodide.mjs'

const ready = (async () => {
  const py = await loadPyodide({ indexURL: new URL('./pyodide/', import.meta.url).href })
  py.runPython('import ast, io, contextlib, json, copy, collections')
  return py
})()

ready
  .then(() => postMessage({ type: 'ready' }))
  .catch((e) => postMessage({ type: 'boot_error', message: String(e) }))

const CHECK = `
_PRELUDE = """
from typing import *
import collections, heapq, math, bisect, itertools, functools, string, re
from collections import *
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
"""

def _norm(x):
    if isinstance(x, (list, tuple)):
        return [_norm(i) for i in x]
    return x

def _same(actual, expected, mode):
    actual, expected = _norm(actual), _norm(expected)
    if mode == "unordered" and isinstance(actual, list) and isinstance(expected, list):
        return sorted(actual, key=repr) == sorted(expected, key=repr)
    if mode == "unordered_deep" and isinstance(actual, list) and isinstance(expected, list):
        norm = lambda xs: sorted([sorted(x, key=repr) if isinstance(x, list) else x for x in xs], key=repr)
        return norm(actual) == norm(expected)
    if mode == "float" and isinstance(actual, (int, float)) and isinstance(expected, (int, float)):
        return abs(actual - expected) <= 1e-6 * max(1, abs(expected))
    return actual == expected

# Structured values travel as JSON: a list node chain is a list of values (a dict
# {"values": [...], "pos": i} closes a cycle at index i), a binary tree is the
# level-order array LeetCode uses, with null for a missing child.
def _mk_list(ns, v):
    pos = -1
    if isinstance(v, dict):
        pos = v.get("pos", -1)
        v = v.get("values", [])
    if not v:
        return None
    nodes = [ns["ListNode"](x) for x in v]
    for a, b in zip(nodes, nodes[1:]):
        a.next = b
    if pos is not None and pos >= 0:
        nodes[-1].next = nodes[pos]
    return nodes[0]

def _list_out(head):
    out, seen = [], set()
    while head is not None:
        if id(head) in seen:
            raise ValueError("the returned list loops back on itself")
        seen.add(id(head))
        out.append(head.val)
        head = head.next
    return out

def _mk_tree(ns, arr):
    if not arr:
        return None
    root = ns["TreeNode"](arr[0])
    queue, i = collections.deque([root]), 1
    while queue and i < len(arr):
        node = queue.popleft()
        if i < len(arr) and arr[i] is not None:
            node.left = ns["TreeNode"](arr[i])
            queue.append(node.left)
        i += 1
        if i < len(arr) and arr[i] is not None:
            node.right = ns["TreeNode"](arr[i])
            queue.append(node.right)
        i += 1
    return root

def _tree_out(root):
    out, queue, seen = [], collections.deque([root]), set()
    while queue:
        node = queue.popleft()
        if node is None:
            out.append(None)
            continue
        if id(node) in seen:
            raise ValueError("the returned tree reuses a node")
        seen.add(id(node))
        out.append(node.val)
        queue.append(node.left)
        queue.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out

def _find_node(root, value):
    stack = [root]
    while stack:
        n = stack.pop()
        if n is None:
            continue
        if n.val == value:
            return n
        stack.append(n.left)
        stack.append(n.right)
    raise ValueError("test input names a value that is not in the tree")

def _need(ns, name):
    if name not in ns:
        raise NameError("class " + name + " is missing; keep the class from the starter code")
    return ns[name]

def _random_list(ns, v):
    nodes = [_need(ns, "Node")(x[0]) for x in v]
    for i, n in enumerate(nodes):
        if i + 1 < len(nodes):
            n.next = nodes[i + 1]
        n.random = None if v[i][1] is None else nodes[v[i][1]]
    return nodes[0] if nodes else None

def _random_out(head, originals):
    order, seen = [], set()
    while head is not None:
        if id(head) in seen:
            raise ValueError("the copied list loops back on itself")
        seen.add(id(head))
        order.append(head)
        head = head.next
    index = {id(n): i for i, n in enumerate(order)}
    out = []
    for n in order:
        if id(n) in originals:
            raise ValueError("the copy reuses a node of the original list")
        r = n.random
        if r is not None and id(r) not in index:
            raise ValueError("a random pointer of the copy leaves the copied list")
        out.append([n.val, None if r is None else index[id(r)]])
    return out

def _graph(ns, adj):
    if not adj:
        return None
    nodes = [_need(ns, "Node")(i + 1) for i in range(len(adj))]
    for n, edges in zip(nodes, adj):
        n.neighbors = [nodes[j - 1] for j in edges]
    return nodes[0]

def _graph_ids(node):
    seen, stack = {}, [node] if node is not None else []
    while stack:
        n = stack.pop()
        if id(n) in seen:
            continue
        seen[id(n)] = n
        stack.extend(n.neighbors)
    return seen

def _graph_out(node, originals):
    seen = _graph_ids(node)
    for k in seen:
        if k in originals:
            raise ValueError("the copy reuses a node of the original graph")
    by_val = {n.val: n for n in seen.values()}
    return [[m.val for m in by_val[v].neighbors] for v in sorted(by_val)]

def _decode_args(ns, args, kinds, mode):
    out = []
    for i, v in enumerate(args):
        k = kinds[i] if i < len(kinds) else "value"
        if mode == "random_list" and i == 0:
            out.append(_random_list(ns, v))
        elif mode == "graph" and i == 0:
            out.append(_graph(ns, v))
        elif mode == "node_ref" and k == "tree" and i > 0:
            out.append(_find_node(out[0], v))
        elif k == "listnode":
            out.append(_mk_list(ns, v))
        elif k == "listnodes":
            out.append([_mk_list(ns, x) for x in v])
        elif k == "tree":
            out.append(_mk_tree(ns, v))
        else:
            out.append(v)
    return out

def _encode_out(v, kind, mode, originals):
    if mode == "random_list":
        return _random_out(v, originals)
    if mode == "graph":
        return _graph_out(v, originals)
    if mode == "node_ref":
        return None if v is None else v.val
    if kind == "listnode":
        return _list_out(v)
    if kind == "tree":
        return _tree_out(v)
    return v

def _originals(args, mode):
    if mode == "random_list":
        ids, n = set(), args[0]
        while n is not None:
            ids.add(id(n))
            n = n.next
        return ids
    if mode == "graph":
        return set(_graph_ids(args[0]))
    return set()

def _prepare(code):
    ns = {}
    exec(_PRELUDE, ns)
    exec(code, ns)
    return ns

def _resolve(ns, expect, mode):
    if mode == "roundtrip":
        return ns.get("Codec")
    sol = ns.get("Solution")
    if isinstance(sol, type) and hasattr(sol, expect):
        return getattr(sol(), expect)
    return ns.get(expect)

def _execute(ns, obj, signature_type, kinds, mode, inplace_arg, raw):
    """Run one case and return the JSON-comparable result."""
    raw = copy.deepcopy(raw)
    params, returns = kinds.get("params", []), kinds.get("returns", "value")
    if mode == "roundtrip":
        tree = hasattr(obj(), "serialize")
        encode = obj().serialize if tree else obj().encode
        decode = obj().deserialize if tree else obj().decode
        wire = encode(_mk_tree(ns, raw[0]) if tree else raw[0])
        if not isinstance(wire, str):
            raise TypeError("the encoder must return a str, not " + type(wire).__name__)
        back = decode(wire)
        return _tree_out(back) if tree else back
    if signature_type == "class":
        operations, call_args = raw
        instance = obj(*call_args[0])
        actual = [None]
        for name, values in zip(operations[1:], call_args[1:]):
            actual.append(_norm(getattr(instance, name)(*values)))
        return actual
    args = _decode_args(ns, raw, params, mode)
    originals = _originals(args, mode)
    result = obj(*args)
    if mode == "inplace":
        return _encode_out(args[inplace_arg], params[inplace_arg] if inplace_arg < len(params) else "value", "", originals)
    return _encode_out(result, returns, mode, originals)

def _judge(actual, expected, compare, checker, raw):
    if compare == "custom":
        cns = {}
        exec(checker, cns)
        return bool(cns["check"](copy.deepcopy(raw), actual, expected))
    return _same(actual, expected, compare)

def _validate(code, expect, signature_type, tests_json, compare, mode, inplace_arg, kinds_json="{}", checker=""):
    # 1) parse: catches syntax/indentation errors
    try:
        ast.parse(code)
    except SyntaxError as e:
        return {"status": "invalid", "message": "SyntaxError: " + str(e)}
    # 2) execute the definitions: catches import/NameError at load time
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            ns = _prepare(code)
    except Exception as e:
        return {"status": "invalid",
                "message": type(e).__name__ + " while loading: " + str(e)}
    # 3) if a symbol was named, confirm it exists and is callable
    obj = None
    if expect:
        obj = _resolve(ns, expect, mode)
        label = "Codec" if mode == "roundtrip" else expect
        if obj is None:
            return {"status": "invalid",
                    "message": "expected '" + label + "' to be defined, but it isn't"}
        if not callable(obj):
            return {"status": "invalid",
                    "message": "'" + label + "' is defined but not callable"}
    tests = json.loads(tests_json) if tests_json else []
    if not tests:
        return {"status": "ok",
                "message": "Looks valid - compiles"
                           + ((" and '" + expect + "' is defined") if expect else "")
                           + ". This pack has no local correctness cases; verify on LeetCode.",
                "stdout": buf.getvalue()[:2000]}
    kinds = json.loads(kinds_json) if kinds_json else {}
    for index, test in enumerate(tests):
        raw = test.get("input", [])
        expected = test.get("expected")
        try:
            with contextlib.redirect_stdout(buf):
                actual = _execute(ns, obj, signature_type, kinds, mode, inplace_arg, raw)
        except Exception as e:
            return {"status": "invalid",
                    "message": "Test " + str(index + 1) + " raised " + type(e).__name__ + ": " + str(e)}
        try:
            good = _judge(actual, expected, compare, checker, raw)
        except Exception as e:
            return {"status": "error", "message": "Checker for test " + str(index + 1) + " failed: " + str(e)}
        if not good:
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
    py.globals.set('_K', JSON.stringify(msg.kinds || {}))
    py.globals.set('_CK', msg.checker || '')
    const out = py.runPython('json.dumps(_validate(_C, _E, _ST, _T, _CMP, _M, _IA, _K, _CK))')
    postMessage({ type: 'result', id: msg.id, outcome: JSON.parse(out) })
  } catch (err) {
    postMessage({ type: 'result', id: msg.id, outcome: { status: 'error', message: String(err) } })
  }
}
