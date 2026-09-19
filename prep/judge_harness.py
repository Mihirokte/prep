"""Judge harness — shared between local problem-pack validation and the
in-browser Pyodide judge. Pure stdlib, deterministic, no I/O beyond stdout
capture. Any change here must keep local and browser behavior identical.
"""
import copy
import io
import math
import sys
import time
from collections import deque


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


# ---------- converters: JSON-friendly test data <-> Python structures ------

def build_list(arr):
    head = None
    for v in reversed(arr or []):
        head = ListNode(v, head)
    return head


def list_to_arr(node):
    out, guard = [], 0
    while node is not None and guard < 100_000:
        out.append(node.val)
        node = node.next
        guard += 1
    return out


def build_tree(arr):
    """LeetCode level-order encoding with None gaps."""
    if not arr or arr[0] is None:
        return None
    root = TreeNode(arr[0])
    q, i = deque([root]), 1
    while q and i < len(arr):
        node = q.popleft()
        if i < len(arr):
            v = arr[i]; i += 1
            if v is not None:
                node.left = TreeNode(v)
                q.append(node.left)
        if i < len(arr):
            v = arr[i]; i += 1
            if v is not None:
                node.right = TreeNode(v)
                q.append(node.right)
    return root


def tree_to_arr(root):
    if root is None:
        return []
    out, q = [], deque([root])
    while q:
        n = q.popleft()
        if n is None:
            out.append(None)
            continue
        out.append(n.val)
        q.append(n.left)
        q.append(n.right)
    while out and out[-1] is None:
        out.pop()
    return out


def convert_in(value, kind):
    if kind == 'listnode':
        return build_list(value)
    if kind == 'tree':
        return build_tree(value)
    if kind == 'listnode_list':
        return [build_list(x) for x in value]
    return value


def convert_out(value, kind):
    if kind == 'listnode':
        return list_to_arr(value)
    if kind == 'tree':
        return tree_to_arr(value)
    return value


# ---------- comparison modes -----------------------------------------------

def _norm(x):
    if isinstance(x, tuple):
        x = list(x)
    if isinstance(x, list):
        return [_norm(v) for v in x]
    return x


def _sort_key(v):
    return repr(v)


def compare(actual, expected, mode):
    actual, expected = _norm(actual), _norm(expected)
    if mode == 'float':
        try:
            return math.isclose(float(actual), float(expected),
                                rel_tol=1e-5, abs_tol=1e-5)
        except (TypeError, ValueError):
            return False
    if mode == 'unordered':
        if not isinstance(actual, list) or not isinstance(expected, list):
            return False
        try:
            return sorted(actual) == sorted(expected)
        except TypeError:
            return sorted(actual, key=_sort_key) == sorted(expected, key=_sort_key)
    if mode == 'unordered_deep':
        if not isinstance(actual, list) or not isinstance(expected, list):
            return False

        def canon(lst):
            groups = []
            for g in lst:
                if isinstance(g, list):
                    try:
                        groups.append(sorted(g))
                    except TypeError:
                        groups.append(sorted(g, key=_sort_key))
                else:
                    groups.append(g)
            try:
                return sorted(groups)
            except TypeError:
                return sorted(groups, key=_sort_key)

        return canon(actual) == canon(expected)
    # default: exact
    return actual == expected


# ---------- runner ----------------------------------------------------------

def run_problem(user_code, problem):
    """Execute user_code and run every test of `problem` against it.

    Returns a list of per-test result dicts:
    {passed, error, output, expected, stdout, time_ms}
    """
    ns = {'ListNode': ListNode, 'TreeNode': TreeNode}
    try:
        exec(user_code, ns)
    except Exception as e:
        return [{'passed': False, 'error': f'{type(e).__name__}: {e}',
                 'output': None, 'expected': None, 'stdout': '', 'time_ms': 0}]

    sig = problem['signature']
    if sig.get('type') == 'class':
        return _run_class_problem(ns, sig, problem)
    fn = ns.get(sig['name'])
    if not callable(fn):
        return [{'passed': False,
                 'error': f"function '{sig['name']}' is not defined",
                 'output': None, 'expected': None, 'stdout': '', 'time_ms': 0}]

    param_kinds = [p.get('kind', 'value') for p in sig['params']]
    ret_kind = (sig.get('returns') or {}).get('kind', 'value')

    checker = None
    if problem.get('compare') == 'custom':
        cns = {'ListNode': ListNode, 'TreeNode': TreeNode}
        exec(problem['checker_code'], cns)
        checker = cns['check']

    results = []
    for t in problem['tests']:
        raw = copy.deepcopy(t['input'])
        args = [convert_in(v, k) for v, k in zip(raw, param_kinds)]
        rec = {'passed': False, 'error': None, 'output': None,
               'expected': t.get('expected'), 'stdout': '', 'time_ms': 0}
        buf, old_stdout = io.StringIO(), sys.stdout
        sys.stdout = buf
        t0 = time.time()
        try:
            out = fn(*args)
            if problem.get('mode') == 'inplace':
                out = args[problem.get('inplace_arg', 0)]
            out = convert_out(out, ret_kind)
            rec['output'] = out
            if checker is not None:
                rec['passed'] = bool(checker(copy.deepcopy(t['input']), out))
            else:
                rec['passed'] = compare(out, t.get('expected'),
                                        problem.get('compare', 'exact'))
        except Exception as e:
            rec['error'] = f'{type(e).__name__}: {e}'
        finally:
            sys.stdout = old_stdout
        rec['time_ms'] = round((time.time() - t0) * 1000, 2)
        rec['stdout'] = buf.getvalue()[:2000]
        results.append(rec)
    return results


def _run_class_problem(ns, sig, problem):
    """Design problems, LeetCode convention: each test's input is
    [ops, args] e.g. [["LRUCache","put","get"], [[2],[1,1],[1]]] and
    expected is the per-op output list (None for constructor/void ops).
    """
    cls = ns.get(sig['name'])
    if cls is None:
        return [{'passed': False,
                 'error': f"class '{sig['name']}' is not defined",
                 'output': None, 'expected': None, 'stdout': '', 'time_ms': 0}]
    results = []
    for t in problem['tests']:
        ops, argslist = t['input']
        rec = {'passed': False, 'error': None, 'output': None,
               'expected': t.get('expected'), 'stdout': '', 'time_ms': 0}
        buf, old_stdout = io.StringIO(), sys.stdout
        sys.stdout = buf
        t0 = time.time()
        try:
            obj, outputs = None, []
            for op, args in zip(ops, argslist):
                if op == sig['name']:
                    obj = cls(*args)
                    outputs.append(None)
                else:
                    outputs.append(getattr(obj, op)(*args))
            rec['output'] = _norm(outputs)
            rec['passed'] = compare(outputs, t.get('expected'),
                                    problem.get('compare', 'exact'))
        except Exception as e:
            rec['error'] = f'{type(e).__name__}: {e}'
        finally:
            sys.stdout = old_stdout
        rec['time_ms'] = round((time.time() - t0) * 1000, 2)
        rec['stdout'] = buf.getvalue()[:2000]
        results.append(rec)
    return results
