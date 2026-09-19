import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "worker_eval.py"
FIX = Path(__file__).parent / "fixtures"


def run(folder, *extra):
    return subprocess.run(
        ["uv", "run", "--project", "mcp/travel-tools", "--with", "jsonschema", "python", str(SCRIPT), str(folder), *extra],
        cwd=ROOT, capture_output=True, text=True,
    )


def test_ok_run_passes_every_check():
    p = run(FIX / "run-ok")
    assert p.returncode == 0, p.stdout + p.stderr
    assert "FAIL" not in p.stdout
    assert p.stdout.count("PASS") >= 12


def test_bad_run_fails_the_five_seeded_defects():
    p = run(FIX / "run-bad")
    assert p.returncode == 1
    fails = [line for line in p.stdout.splitlines() if line.startswith("FAIL")]
    ids = {line.split()[1] for line in fails}
    assert ids == {"dest.crowd_tactic", "dest.source", "logi.nights", "budget.fx", "itin.days"}, fails


def test_missing_folder_is_a_clean_failure():
    p = run(FIX / "does-not-exist")
    assert p.returncode == 2
    assert "not found" in p.stderr
