"""Every pack with local tests: the reference solution must pass them all and the
starter code must not. Runs the same Python the in-app judge runs.

    python3 scripts/verify-judge.py
"""
import sys
from judge_harness import load_seed, run

packs = load_seed()["packs"]
bad, tested = [], 0
for pid, p in packs.items():
    if not p.get("tests"):
        continue
    tested += 1
    ref = run(p, p["reference_solution"])
    if ref["status"] != "ok":
        bad.append(f"{pid} {p['title']}: reference {ref['status']}: {ref['message'][:160]}")
    starter = run(p, p["starter_code"])
    if starter["status"] == "ok":
        bad.append(f"{pid} {p['title']}: starter code passes its own tests")
print(f"{tested} packs with tests, {len(packs) - tested} without")
for b in bad:
    print("  FAIL", b)
print("judge verification:", "FAILED" if bad else "ok")
sys.exit(1 if bad else 0)
