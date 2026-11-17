"""Local test cases for DSA packs whose values are not plain JSON: linked lists,
trees, graphs, in-place edits, design classes, and answers with several valid forms.

    python3 scripts/author-structured.py

Statement examples are written out by hand from the problem statements. A pack is
changed only if its reference solution reproduces every example under the judge the
app ships (src/renderer/public/validate-worker.mjs). Edge-case expectations are the
reference solution's own output. Re-running replaces the tests of these packs.
"""
import json
import sys
from judge_harness import J, ROOT, expected_for, load_seed

INF = 2147483647
N = None
LIST_KIND = "listnode"

TOPO_CHECKER = '''def check(args, actual, expected):
    n, prerequisites = args
    if expected == []:
        return actual == []
    if not isinstance(actual, list) or sorted(actual) != list(range(n)):
        return False
    position = {course: i for i, course in enumerate(actual)}
    return all(position[before] < position[course] for course, before in prerequisites)
'''

# id -> dict(examples=[(args, expected)], edges=[args], plus pack fields to set)
CASES = {
    # ---- linked lists: a chain is its list of values; hasCycle takes {"values", "pos"}
    "dsa-039": dict(examples=[([[1, 2, 3, 4, 5]], [5, 4, 3, 2, 1]), ([[1, 2]], [2, 1]), ([[]], [])],
                    edges=[[[1]], [[1, 1, 2]], [[-1, 0, 1]]]),
    "dsa-040": dict(examples=[([[1, 2, 4], [1, 3, 4]], [1, 1, 2, 3, 4, 4]), ([[], []], []), ([[], [0]], [0])],
                    edges=[[[1], [2]], [[5], [1, 2, 3]], [[1, 1], [1, 1]]]),
    "dsa-041": dict(mode="inplace", inplace_arg=0,
                    examples=[([[1, 2, 3, 4]], [1, 4, 2, 3]), ([[1, 2, 3, 4, 5]], [1, 5, 2, 4, 3])],
                    edges=[[[1]], [[1, 2]], [[1, 2, 3]], [[1, 2, 3, 4, 5, 6]]]),
    "dsa-042": dict(examples=[([[1, 2, 3, 4, 5], 2], [1, 2, 3, 5]), ([[1], 1], []), ([[1, 2], 1], [1])],
                    edges=[[[1, 2], 2], [[1, 2, 3], 3], [[5, 6, 7, 8], 4]]),
    "dsa-043": dict(mode="random_list",
                    examples=[([[[7, N], [13, 0], [11, 4], [10, 2], [1, 0]]], [[7, N], [13, 0], [11, 4], [10, 2], [1, 0]]),
                              ([[[1, 1], [2, 1]]], [[1, 1], [2, 1]]),
                              ([[[3, N], [3, 0], [3, N]]], [[3, N], [3, 0], [3, N]])],
                    edges=[[[]], [[[1, N]]], [[[1, 0]]], [[[1, N], [2, 0]]]]),
    "dsa-044": dict(examples=[([[2, 4, 3], [5, 6, 4]], [7, 0, 8]), ([[0], [0]], [0]),
                              ([[9, 9, 9, 9, 9, 9, 9], [9, 9, 9, 9]], [8, 9, 9, 9, 0, 0, 0, 1])],
                    edges=[[[5], [5]], [[1], [9, 9]], [[1, 8], [0]]]),
    "dsa-045": dict(examples=[([{"values": [3, 2, 0, -4], "pos": 1}], True), ([{"values": [1, 2], "pos": 0}], True),
                              ([{"values": [1], "pos": -1}], False)],
                    edges=[[{"values": [], "pos": -1}], [{"values": [1], "pos": 0}],
                           [{"values": [1, 2, 3, 4], "pos": -1}], [{"values": [1, 2, 3, 4, 5], "pos": 4}]]),
    "dsa-048": dict(kinds=["listnodes"],
                    examples=[([[[1, 4, 5], [1, 3, 4], [2, 6]]], [1, 1, 2, 3, 4, 4, 5, 6]), ([[]], []), ([[[]]], [])],
                    edges=[[[[], [1]]], [[[5], [1], [3]]], [[[1, 2, 3], [1, 2, 3]]]]),
    "dsa-049": dict(examples=[([[1, 2, 3, 4, 5], 2, 4], [1, 4, 3, 2, 5]), ([[5], 1, 1], [5])],
                    edges=[[[1, 2], 1, 2], [[1, 2, 3], 1, 3], [[1, 2, 3, 4], 2, 3], [[1, 2, 3, 4, 5], 3, 5]]),
    # ---- trees: level-order arrays with null
    "dsa-050": dict(examples=[([[4, 2, 7, 1, 3, 6, 9]], [4, 7, 2, 9, 6, 3, 1]), ([[2, 1, 3]], [2, 3, 1]), ([[]], [])],
                    edges=[[[1]], [[1, 2]], [[1, N, 2]], [[1, 2, 3, 4, 5]]]),
    "dsa-051": dict(examples=[([[3, 9, 20, N, N, 15, 7]], 3), ([[1, N, 2]], 2)],
                    edges=[[[]], [[1]], [[1, 2, N, 3]], [[1, 2, 3, 4, 5, 6, 7]]]),
    "dsa-052": dict(examples=[([[1, 2, 3, 4, 5]], 3), ([[1, 2]], 1)],
                    edges=[[[1]], [[1, 2, 3]], [[1, 2, N, 3, N, 4]]]),
    "dsa-053": dict(examples=[([[3, 9, 20, N, N, 15, 7]], True), ([[1, 2, 2, 3, 3, N, N, 4, 4]], False), ([[]], True)],
                    edges=[[[1]], [[1, 2, N, 3]], [[1, 2, 3]]]),
    "dsa-054": dict(examples=[([[1, 2, 3], [1, 2, 3]], True), ([[1, 2], [1, N, 2]], False), ([[1, 2, 1], [1, 1, 2]], False)],
                    edges=[[[], []], [[], [1]], [[1], [1]], [[1, 2, 3], [1, 2]]]),
    "dsa-055": dict(examples=[([[3, 4, 5, 1, 2], [4, 1, 2]], True),
                              ([[3, 4, 5, 1, 2, N, N, N, N, 0], [4, 1, 2]], False)],
                    edges=[[[1], [1]], [[1, 1], [1]], [[1, 2, 3], [3]], [[1, N, 1, N, 1], [1, N, 1]]]),
    "dsa-056": dict(mode="node_ref",
                    examples=[([[6, 2, 8, 0, 4, 7, 9, N, N, 3, 5], 2, 8], 6), ([[6, 2, 8, 0, 4, 7, 9, N, N, 3, 5], 2, 4], 2),
                              ([[2, 1], 2, 1], 2)],
                    edges=[[[6, 2, 8, 0, 4, 7, 9, N, N, 3, 5], 3, 5], [[6, 2, 8, 0, 4, 7, 9, N, N, 3, 5], 0, 5],
                           [[6, 2, 8, 0, 4, 7, 9, N, N, 3, 5], 7, 9], [[2, 1, 3], 1, 3]]),
    "dsa-057": dict(examples=[([[3, 9, 20, N, N, 15, 7]], [[3], [9, 20], [15, 7]]), ([[1]], [[1]]), ([[]], [])],
                    edges=[[[1, 2]], [[1, N, 2]], [[1, 2, 3, 4, N, N, 5]]]),
    "dsa-058": dict(examples=[([[1, 2, 3, N, 5, N, 4]], [1, 3, 4]), ([[1, 2, 3, 4, N, N, N, 5]], [1, 3, 4, 5]),
                              ([[1, N, 3]], [1, 3]), ([[]], [])],
                    edges=[[[1]], [[1, 2]], [[1, 2, 3, 4]]]),
    "dsa-059": dict(examples=[([[3, 1, 4, 3, N, 1, 5]], 4), ([[3, 3, N, 4, 2]], 3), ([[1]], 1)],
                    edges=[[[2, N, 4, 10, 8, N, N, 4]], [[-1, -2, -3]], [[5, 4, 6]]]),
    "dsa-060": dict(examples=[([[2, 1, 3]], True), ([[5, 1, 4, N, N, 3, 6]], False)],
                    edges=[[[]], [[1]], [[2, 2, 2]], [[5, 4, 6, N, N, 3, 7]], [[3, 1, 5, 0, 2, 4, 6]], [[-2147483648]]]),
    "dsa-061": dict(examples=[([[3, 1, 4, N, 2], 1], 1), ([[5, 3, 6, 2, 4, N, N, 1], 3], 3)],
                    edges=[[[1], 1], [[2, 1], 2], [[2, 1, 3], 3], [[5, 3, 6, 2, 4, N, N, 1], 6]]),
    "dsa-062": dict(examples=[([[3, 9, 20, 15, 7], [9, 3, 15, 20, 7]], [3, 9, 20, N, N, 15, 7]), ([[-1], [-1]], [-1])],
                    edges=[[[1, 2], [2, 1]], [[1, 2], [1, 2]], [[1, 2, 3], [2, 1, 3]], [[1, 2, 4, 5, 3], [4, 2, 5, 1, 3]]]),
    "dsa-063": dict(examples=[([[1, 2, 3]], 6), ([[-10, 9, 20, N, N, 15, 7]], 42)],
                    edges=[[[-3]], [[2, -1]], [[-1, -2, -3]], [[1, -2, 3]]]),
    "dsa-064": dict(mode="roundtrip",
                    examples=[([[1, 2, 3, N, N, 4, 5]], [1, 2, 3, N, N, 4, 5]), ([[]], []), ([[1]], [1]), ([[1, 2]], [1, 2])],
                    edges=[[[1, N, 2]], [[-1000, 1000, -1, N, N, 5]], [[1, 2, 3, 4, 5, 6, 7]]]),
    "dsa-065": dict(examples=[([[3, 2, 3, N, 3, N, 1]], 7), ([[3, 4, 5, 1, 3, N, 1]], 9)],
                    edges=[[[1]], [[2, 1, 3]], [[4, 1, N, 2, N, 3]]]),
    # ---- design classes: [operations, arguments] -> list of outputs
    "dsa-008": dict(mode="roundtrip",
                    examples=[([["code", "love", "you"]], ["code", "love", "you"]), ([["we", "say", ":", "yes"]], ["we", "say", ":", "yes"]),
                              ([[]], []), ([[""]], [""])],
                    edges=[[["", ""]], [["#", "1#a", "12#"]], [["4#code", "3"]], [["a" * 200, "b"]]]),
    "dsa-037": dict(examples=[([["TimeMap", "set", "get", "get", "set", "get", "get"],
                                [[], ["foo", "bar", 1], ["foo", 1], ["foo", 3], ["foo", "bar2", 4], ["foo", 4], ["foo", 5]]],
                               [N, N, "bar", "bar", N, "bar2", "bar2"])],
                    edges=[[["TimeMap", "get", "set", "get"], [[], ["a", 1], ["a", "x", 5], ["a", 4]]],
                           [["TimeMap", "set", "set", "get", "get", "get"], [[], ["a", "x", 1], ["b", "y", 2], ["a", 2], ["b", 1], ["b", 9]]],
                           [["TimeMap", "set", "set", "set", "get"], [[], ["k", "v1", 1], ["k", "v2", 10], ["k", "v3", 20], ["k", 15]]]]),
    "dsa-047": dict(examples=[([["LRUCache", "put", "put", "get", "put", "get", "put", "get", "get", "get"],
                                [[2], [1, 1], [2, 2], [1], [3, 3], [2], [4, 4], [1], [3], [4]]],
                               [N, N, N, 1, N, -1, N, -1, 3, 4])],
                    edges=[[["LRUCache", "put", "put", "get", "get"], [[1], [1, 1], [2, 2], [1], [2]]],
                           [["LRUCache", "put", "put", "put", "get", "get"], [[2], [1, 1], [2, 2], [1, 10], [1], [2]]],
                           [["LRUCache", "put", "put", "get", "put", "get", "get"], [[2], [1, 1], [2, 2], [1], [3, 3], [1], [2]]],
                           [["LRUCache", "get"], [[3], [7]]]]),
    "dsa-066": dict(examples=[([["Trie", "insert", "search", "search", "startsWith", "insert", "search"],
                                [[], ["apple"], ["apple"], ["app"], ["app"], ["app"], ["app"]]],
                               [N, N, True, False, True, N, True])],
                    edges=[[["Trie", "search", "startsWith"], [[], ["a"], ["a"]]],
                           [["Trie", "insert", "insert", "search", "startsWith", "search"], [[], ["a"], ["ab"], ["a"], ["abc"], ["abc"]]],
                           [["Trie", "insert", "startsWith", "startsWith"], [[], ["hello"], ["hello"], ["hellos"]]]]),
    "dsa-067": dict(examples=[([["WordDictionary", "addWord", "addWord", "addWord", "search", "search", "search", "search"],
                                [[], ["bad"], ["dad"], ["mad"], ["pad"], ["bad"], [".ad"], ["b.."]]],
                               [N, N, N, N, False, True, True, True])],
                    edges=[[["WordDictionary", "search", "addWord", "search"], [[], ["a"], ["a"], ["."]]],
                           [["WordDictionary", "addWord", "search", "search", "search"], [[], ["at"], ["a"], ["att"], ["a."]]],
                           [["WordDictionary", "addWord", "addWord", "search", "search"], [[], ["ab"], ["abc"], ["..."], ["ab."]]]]),
    "dsa-069": dict(examples=[([["KthLargest", "add", "add", "add", "add", "add"], [[3, [4, 5, 8, 2]], [3], [5], [10], [9], [4]]],
                               [N, 4, 5, 5, 8, 8])],
                    edges=[[["KthLargest", "add", "add"], [[1, []], [-3], [-2]]],
                           [["KthLargest", "add", "add", "add"], [[2, [0]], [-1], [1], [-2]]],
                           [["KthLargest", "add", "add", "add"], [[3, [1, 1]], [1], [1], [2]]]]),
    "dsa-074": dict(examples=[([["Twitter", "postTweet", "getNewsFeed", "follow", "postTweet", "getNewsFeed", "unfollow", "getNewsFeed"],
                                [[], [1, 5], [1], [1, 2], [2, 6], [1], [1, 2], [1]]],
                               [N, N, [5], N, N, [6, 5], N, [5]])],
                    edges=[[["Twitter", "getNewsFeed"], [[], [1]]],
                           [["Twitter"] + ["postTweet"] * 12 + ["getNewsFeed"], [[]] + [[1, t] for t in range(1, 13)] + [[1]]],
                           [["Twitter", "postTweet", "postTweet", "follow", "getNewsFeed", "follow", "getNewsFeed"],
                            [[], [1, 1], [2, 2], [1, 2], [1], [1, 1], [1]]]]),
    "dsa-075": dict(examples=[([["MedianFinder", "addNum", "addNum", "findMedian", "addNum", "findMedian"], [[], [1], [2], [], [3], []]],
                               [N, N, N, 1.5, N, 2.0])],
                    edges=[[["MedianFinder", "addNum", "findMedian"], [[], [-1], []]],
                           [["MedianFinder", "addNum", "addNum", "addNum", "addNum", "findMedian"], [[], [5], [3], [8], [1], []]],
                           [["MedianFinder", "addNum", "addNum", "findMedian", "addNum", "findMedian"], [[], [-1], [-2], [], [-3], []]]]),
    # ---- graphs, grids, arrays edited in place
    "dsa-085": dict(mode="graph",
                    examples=[([[[2, 4], [1, 3], [2, 4], [1, 3]]], [[2, 4], [1, 3], [2, 4], [1, 3]]), ([[[]]], [[]]), ([[]], [])],
                    edges=[[[[2], [1]]], [[[2, 3], [1, 3], [1, 2]]], [[[2], [1, 3], [2]]]]),
    "dsa-088": dict(mode="inplace", inplace_arg=0,
                    examples=[([[["X", "X", "X", "X"], ["X", "O", "O", "X"], ["X", "X", "O", "X"], ["X", "O", "X", "X"]]],
                               [["X", "X", "X", "X"], ["X", "X", "X", "X"], ["X", "X", "X", "X"], ["X", "O", "X", "X"]]),
                              ([[["X"]]], [["X"]])],
                    edges=[[[["O"]]], [[["O", "O"], ["O", "O"]]], [[["X", "O", "X"], ["O", "X", "O"], ["X", "O", "X"]]],
                           [[["X", "X", "X"], ["X", "O", "X"], ["X", "X", "X"]]]]),
    "dsa-090": dict(mode="inplace", inplace_arg=0,
                    examples=[([[[INF, -1, 0, INF], [INF, INF, INF, -1], [INF, -1, INF, -1], [0, -1, INF, INF]]],
                               [[3, -1, 0, 1], [2, 2, 1, -1], [1, -1, 2, -1], [0, -1, 3, 4]]),
                              ([[[-1]]], [[-1]])],
                    edges=[[[[0]]], [[[INF]]], [[[0, INF, INF]]], [[[INF, -1], [-1, 0]]]]),
    "dsa-092": dict(compare="custom", checker_code=TOPO_CHECKER,
                    examples=[([4, [[1, 0], [2, 0], [3, 1], [3, 2]]], "any valid order"), ([2, [[1, 0]]], "any valid order"),
                              ([1, []], "any valid order"), ([2, [[1, 0], [0, 1]]], [])],
                    edges=[[3, []], [3, [[1, 0], [2, 1]]], [3, [[0, 1], [1, 2], [2, 0]]], [5, [[1, 0], [2, 0], [3, 1], [4, 3]]]],
                    edge_expected=lambda out: [] if out == [] else "any valid order"),
    "dsa-145": dict(mode="inplace", inplace_arg=0,
                    examples=[([[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], [[7, 4, 1], [8, 5, 2], [9, 6, 3]]),
                              ([[[5, 1, 9, 11], [2, 4, 8, 10], [13, 3, 6, 7], [15, 14, 12, 16]]],
                               [[15, 13, 2, 5], [14, 3, 4, 1], [12, 6, 8, 9], [16, 7, 10, 11]])],
                    edges=[[[[1]]], [[[1, 2], [3, 4]]], [[[-1, -2], [-3, -4]]]]),
    "dsa-147": dict(mode="inplace", inplace_arg=0,
                    examples=[([[[1, 1, 1], [1, 0, 1], [1, 1, 1]]], [[1, 0, 1], [0, 0, 0], [1, 0, 1]]),
                              ([[[0, 1, 2, 0], [3, 4, 5, 2], [1, 3, 1, 5]]], [[0, 0, 0, 0], [0, 4, 5, 0], [0, 3, 1, 0]])],
                    edges=[[[[1]]], [[[0]]], [[[1, 0]]], [[[1], [0]]], [[[0, 0], [0, 1]]]]),
    "dsa-148": dict(mode="inplace", inplace_arg=0,
                    examples=[([[2, 0, 2, 1, 1, 0]], [0, 0, 1, 1, 2, 2]), ([[2, 0, 1]], [0, 1, 2])],
                    edges=[[[0]], [[1, 1]], [[2, 1, 0]], [[0, 2, 0, 2]], [[1, 0, 1, 2, 2, 0]]]),
}

seed = load_seed()
rejected, changed = [], 0
for pid, case in CASES.items():
    pack = dict(seed["packs"][pid])
    for field in ("mode", "inplace_arg", "compare", "checker_code"):
        if field in case:
            pack[field] = case[field]
    if "kinds" in case:
        pack["signature"] = {**pack["signature"],
                             "params": [{**prm, "kind": k} for prm, k in zip(pack["signature"]["params"], case["kinds"])]}
    pack.setdefault("compare", "exact")
    tests, why = [], None
    link = pack["link"]
    for args, expected in case["examples"]:
        try:
            actual = expected_for(pack, args)
            ok = J["_judge"](actual, expected, pack["compare"], pack.get("checker_code", ""), args)
        except Exception as e:  # reference could not run the example
            ok, actual = False, f"{type(e).__name__}: {e}"
        if not ok:
            why = f"reference gives {actual!r} for example {args!r}, statement says {expected!r}"
            break
        tests.append({"input": args, "expected": expected, "kind": "example", "source": f"{link} (problem statement example)"})
    if why:
        rejected.append(f"{pid} {pack['title']}: {why}")
        continue
    seen = {json.dumps(t["input"]) for t in tests}
    for args in case["edges"]:
        key = json.dumps(args)
        if key in seen:
            continue
        seen.add(key)
        try:
            out = expected_for(pack, args)
        except Exception as e:
            rejected.append(f"{pid} {pack['title']}: reference raised on edge {args!r}: {type(e).__name__}: {e}")
            tests = None
            break
        out = case["edge_expected"](out) if "edge_expected" in case else out
        tests.append({"input": args, "expected": out, "kind": "edge", "source": "expected value computed by the reference solution"})
    if tests is None:
        continue
    pack["tests"] = tests
    seed["packs"][pid] = pack
    changed += 1

(ROOT / "seed/content.json").write_text(json.dumps(seed, separators=(",", ":"), ensure_ascii=False))
print(f"updated {changed}/{len(CASES)} packs")
for r in rejected:
    print("  rejected", r)
sys.exit(1 if rejected else 0)
