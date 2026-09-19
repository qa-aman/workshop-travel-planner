"""Structural eval over one trips/<slug>/ folder. Hygiene gate, not a quality judgement.

--run-log must come from `claude -p ... --output-format stream-json`, which carries the
full assistant message list. A `--output-format json` result object (a single summary
object with no message list) has no Agent tool_use blocks to count, so orch.parallel will
always report 0 against it. Do not pass a `json`-format log to --run-log.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import jsonschema
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "docs" / "contracts"
DDMMYYYY = re.compile(r"\b\d{2}-\d{2}-\d{4}\b")
ISO = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")

results: list[tuple[str, str, str]] = []


def check(cid: str, ok: bool, detail: str) -> None:
    results.append(("PASS" if ok else "FAIL", cid, detail))


def table_rows(md: str, heading: str) -> list[list[str]]:
    """Rows of the first markdown table under a heading that starts with `heading` (any level)."""
    m = re.search(rf"^#+\s*{re.escape(heading)}.*?$", md, re.M)
    if not m:
        return []
    body = md[m.end():]
    nxt = re.search(r"^#+\s", body, re.M)
    if nxt:
        body = body[: nxt.start()]
    rows = []
    for line in body.splitlines():
        if line.startswith("|") and not re.match(r"^\|\s*-", line):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            rows.append(cells)
    return rows[1:] if rows else []  # drop header


def col(rows: list[list[str]], header_rows: list[list[str]], name: str) -> list[str]:
    """Values of column `name` (case-insensitive prefix match on the header row)."""
    if not header_rows:
        return []
    hdr = [h.lower() for h in header_rows[0]]
    idx = next((i for i, h in enumerate(hdr) if h.startswith(name.lower())), None)
    if idx is None:
        return []
    return [r[idx] if idx < len(r) else "" for r in rows]


def section_tables(md: str, heading: str) -> tuple[list[list[str]], list[list[str]]]:
    m = re.search(rf"^#+\s*{re.escape(heading)}.*?$", md, re.M)
    if not m:
        return [], []
    body = md[m.end():]
    nxt = re.search(r"^#+\s", body, re.M)
    if nxt:
        body = body[: nxt.start()]
    header = []
    rows = []
    for line in body.splitlines():
        if line.startswith("|") and not re.match(r"^\|\s*-", line):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if not header:
                header = [cells]
            else:
                rows.append(cells)
    return rows, header


def eval_brief(folder: Path) -> dict:
    brief = json.loads((folder / "00-brief.json").read_text())
    schema = json.loads((CONTRACTS / "brief.schema.json").read_text())
    try:
        jsonschema.validate(brief, schema)
        check("brief.schema", True, "00-brief.json validates")
    except jsonschema.ValidationError as e:
        check("brief.schema", False, f"00-brief.json: {e.message}")
    return brief


def eval_destinations(folder: Path, brief: dict) -> None:
    md = (folder / "01-destinations.md").read_text()
    total_bad_tactic = 0
    total_bad_source = 0
    for city in brief["cities"]:
        city_md = md.split(f"## {city}", 1)[1] if f"## {city}" in md else ""
        nxt = re.search(r"^## ", city_md, re.M)
        if nxt:
            city_md = city_md[: nxt.start()]
        must, must_h = section_tables(city_md, "Must-do")
        nice, nice_h = section_tables(city_md, "Nice-to-have")
        n = len(must) + len(nice)
        check(f"dest.count.{city}", 6 <= n <= 10, f"{city}: {n} candidates (need 6 to 10)")
        check(f"dest.mustdo.{city}", 3 <= len(must) <= 4, f"{city}: {len(must)} must-do (need 3 to 4)")
        for rows, hdr in ((must, must_h), (nice, nice_h)):
            for tactic in col(rows, hdr, "Crowd"):
                if len(tactic.strip()) < 8:
                    total_bad_tactic += 1
            for src in col(rows, hdr, "Source"):
                if src.strip().lower() not in ("tool", "could not verify"):
                    total_bad_source += 1
    check("dest.crowd_tactic", total_bad_tactic == 0, f"{total_bad_tactic} rows with an empty or vague crowd tactic")
    check("dest.source", total_bad_source == 0, f"{total_bad_source} rows with Source not in (tool, could not verify)")


def eval_logistics(folder: Path, brief: dict) -> None:
    md = (folder / "02-logistics.md").read_text()
    rows, hdr = section_tables(md, "Night split")
    nights = [int(x) for x in col(rows, hdr, "Nights") if x.strip().isdigit()]
    check("logi.nights", sum(nights) == brief["days"] - 1, f"nights sum {sum(nights)} vs days-1 = {brief['days'] - 1}")
    rows, hdr = section_tables(md, "Inter-city")
    srcs = [s.lower() for s in col(rows, hdr, "Source")]
    # Ruling (task 11b): the seeded rail table's source cell is the JR Central fare-table
    # URL (smart-ex.jp), not the word "seed". Accept "seed", "could not verify", or the
    # seeded data's own source domain "smart-ex.jp" as valid sources for this row.
    check(
        "logi.intercity",
        len(rows) >= 1 and all(("seed" in s or "could not verify" in s or "smart-ex.jp" in s) for s in srcs),
        f"{len(rows)} inter-city rows, sources {srcs}",
    )
    for city in brief["cities"]:
        rows, hdr = section_tables(md, city)
        check(f"logi.hotels.{city}", len(rows) >= 4, f"{city}: {len(rows)} hotel rows (need 4: 2 areas x 2 hotels)")


def eval_budget(folder: Path) -> None:
    md = (folder / "03-budget.md").read_text()
    fx = re.search(r"1 USD = (.+?) JPY on (\S+)", md)
    ok = bool(fx) and (DDMMYYYY.fullmatch(fx.group(2).rstrip(".,)")) is not None or "could not verify" in fx.group(1))
    check("budget.fx", ok, f"FX line: {fx.group(0) if fx else 'missing'}")
    rows, hdr = section_tables(md, "Category split")
    shares = [int(s.rstrip("%")) for s in col(rows, hdr, "Share") if s.rstrip("%").isdigit()]
    check("budget.shares", sum(shares) == 100, f"category shares sum {sum(shares)}")
    # The FX line's own date is already checked by budget.fx; exclude it here so a bad
    # FX date trips exactly one check, not two for the same defect.
    md_for_iso = md.replace(fx.group(0), "") if fx else md
    check("budget.no_iso", not ISO.search(md_for_iso), "no ISO dates in 03-budget.md (outside the FX line)")


def eval_no_semicolon(folder: Path) -> None:
    bad = []
    for path in sorted(folder.glob("*.md")):
        if ";" in path.read_text():
            bad.append(path.name)
    check("itin.no_semicolon", not bad, f"semicolons found in: {bad}" if bad else "no semicolons in any *.md file")


def day_slot_sources(md: str) -> dict[tuple[int, str], str]:
    """(day, when) -> Source cell, read from every '## Day N' table in itinerary.md."""
    out: dict[tuple[int, str], str] = {}
    for m in re.finditer(r"^## Day (\d+)", md, re.M):
        day = int(m.group(1))
        start = m.end()
        nxt = re.search(r"^## ", md[start:], re.M)
        body = md[start:][: nxt.start()] if nxt else md[start:]
        header: list[str] = []
        rows: list[list[str]] = []
        for line in body.splitlines():
            if line.startswith("|") and not re.match(r"^\|\s*-", line):
                cells = [c.strip() for c in line.strip().strip("|").split("|")]
                if not header:
                    header = cells
                else:
                    rows.append(cells)
        when_col = col(rows, [header], "When")
        source_col = col(rows, [header], "Source")
        for when, src in zip(when_col, source_col):
            out[(day, when.strip().lower())] = src.strip().lower()
    return out


def eval_itinerary(folder: Path, brief: dict) -> None:
    md = (folder / "itinerary.md").read_text()
    days = re.findall(r"^## Day (\d+)", md, re.M)
    check("itin.days", [int(d) for d in days] == list(range(1, brief["days"] + 1)), f"day headings {days} vs 1..{brief['days']}")
    check("itin.no_iso", not ISO.search(md), "no ISO dates in itinerary.md")
    data = json.loads((folder / "itinerary.json").read_text())
    md_sources = day_slot_sources(md)
    mismatches = []
    for day in data.get("days", []):
        for slot in day.get("slots", []):
            key = (day.get("day"), str(slot.get("when", "")).strip().lower())
            md_src = md_sources.get(key)
            json_src = str(slot.get("source", "")).strip().lower()
            if md_src is not None and md_src != json_src:
                mismatches.append(f"day {key[0]} {key[1]}: json={json_src!r} md={md_src!r}")
    check("itin.source_match", not mismatches, f"{len(mismatches)} slot source mismatches: {mismatches}" if mismatches else "itinerary.json source matches itinerary.md for every slot")
    schema = json.loads((CONTRACTS / "itinerary.schema.json").read_text())
    registry = Registry().with_resources(
        (
            (CONTRACTS / name).as_uri(),
            Resource.from_contents(json.loads((CONTRACTS / name).read_text())),
        )
        for name in ("brief.schema.json", "review.schema.json")
    )
    validator_cls = jsonschema.validators.validator_for(schema)
    validator = validator_cls({**schema, "$id": (CONTRACTS / "itinerary.schema.json").as_uri()}, registry=registry)
    try:
        validator.validate(data)
        check("itin.schema", True, "itinerary.json validates")
    except jsonschema.ValidationError as e:
        check("itin.schema", False, f"itinerary.json: {e.message} at {list(e.absolute_path)}")
    review = json.loads((folder / "05-review.json").read_text())
    check("review.six", len(review.get("checks", [])) == 6, f"{len(review.get('checks', []))} review checks")


def eval_run_log(path: Path) -> None:
    """Orchestrator check: at least one assistant message carried three Agent tool_use blocks."""
    raw = json.loads(path.read_text())
    msgs = raw if isinstance(raw, list) else raw.get("messages", [raw])
    best = 0
    for m in msgs:
        content = (m.get("message") or {}).get("content") or m.get("content") or []
        if isinstance(content, list):
            n = sum(1 for b in content if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == "Agent")
            best = max(best, n)
    check("orch.parallel", best >= 3, f"max Agent calls in one assistant message: {best} (need 3)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--run-log")
    a = ap.parse_args()
    folder = Path(a.folder)
    if not folder.is_dir():
        print(f"run folder not found: {folder}", file=sys.stderr)
        return 2
    brief = eval_brief(folder)
    eval_destinations(folder, brief)
    eval_logistics(folder, brief)
    eval_budget(folder)
    eval_itinerary(folder, brief)
    eval_no_semicolon(folder)
    if a.run_log:
        eval_run_log(Path(a.run_log))
    for status, cid, detail in results:
        # A space before the colon keeps `cid` its own whitespace token (line.split()[1]),
        # rather than gluing a trailing ":" onto it.
        print(f"{status} {cid} : {detail}")
    return 1 if any(s == "FAIL" for s, _, _ in results) else 0


if __name__ == "__main__":
    sys.exit(main())
