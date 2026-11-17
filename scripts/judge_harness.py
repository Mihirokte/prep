"""Loads the Python judge that ships inside the validation worker, so scripts can
run the exact code the app runs (src/renderer/public/validate-worker.mjs)."""
import ast, collections, contextlib, copy, io, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_src = (ROOT / "src/renderer/public/validate-worker.mjs").read_text()
_m = re.search(r"const CHECK = `(.*?)`\n\nonmessage", _src, re.S)
assert _m, "could not find the CHECK template in validate-worker.mjs"
J = {"ast": ast, "collections": collections, "contextlib": contextlib, "copy": copy, "io": io, "json": json}
exec(_m.group(1), J)


def load_seed():
    return json.loads((ROOT / "seed/content.json").read_text())


def kinds_of(pack):
    sig = pack["signature"]
    return json.dumps({
        "params": [p.get("kind") or "value" for p in sig.get("params", [])],
        "returns": (sig.get("returns") or {}).get("kind") or "value",
    })


def run(pack, code, tests=None):
    """What the app does when the learner presses the test button."""
    sig = pack["signature"]
    return J["_validate"](
        code, sig["name"], sig.get("type", "function"),
        json.dumps(pack.get("tests", []) if tests is None else tests),
        pack.get("compare", "exact"), pack.get("mode", ""), pack.get("inplace_arg", 0),
        kinds_of(pack), pack.get("checker_code", ""),
    )


def expected_for(pack, raw):
    """Output of the reference solution for one raw input, as the judge sees it."""
    sig = pack["signature"]
    ns = J["_prepare"](pack["reference_solution"])
    obj = J["_resolve"](ns, sig["name"], pack.get("mode", ""))
    return J["_execute"](ns, obj, sig.get("type", "function"), json.loads(kinds_of(pack)),
                         pack.get("mode", ""), pack.get("inplace_arg", 0), raw)
