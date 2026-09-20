import json
from pathlib import Path

import jsonschema
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = json.loads((ROOT / "docs" / "contracts" / "revision.schema.json").read_text())
REGISTRY = Registry().with_resource("revision.schema.json", Resource.from_contents(SCHEMA))


def _validate(instance, def_name):
    jsonschema.validate(instance, {"$ref": f"revision.schema.json#/$defs/{def_name}"}, registry=REGISTRY)


def test_valid_date_shift_plan_passes():
    _validate(
        {
            "slug": "japan-tokyo-kyoto-a1f3",
            "today": "20-09-2026",
            "changes": [
                {
                    "type": "date-shift",
                    "shift_days": 7,
                    "affected_days": [1, 2, 3, 4, 5],
                    "reverify": {"destination_research": False, "logistics": False, "budget": True},
                    "reason": "one-week shift, same season, only fare/date-dependent budget lines need a recheck",
                }
            ],
            "needs_user_input": [],
        },
        "RevisionPlan",
    )


def test_valid_cutoff_plan_passes():
    _validate(
        {
            "slug": "japan-tokyo-kyoto-a1f3",
            "today": "24-09-2026",
            "changes": [
                {
                    "type": "cutoff",
                    "cutoff_day": 3,
                    "affected_days": [4, 5],
                    "reverify": {"destination_research": False, "logistics": False, "budget": True},
                    "reason": "traveler ending after day 3, days 4 and 5 dropped",
                }
            ],
            "needs_user_input": [],
        },
        "RevisionPlan",
    )


def test_plan_missing_changes_fails():
    try:
        _validate({"slug": "x", "today": "20-09-2026", "needs_user_input": []}, "RevisionPlan")
        assert False, "expected a validation error"
    except jsonschema.ValidationError:
        pass


def test_valid_log_entry_passes():
    _validate(
        {
            "timestamp": "20-09-2026 14:03",
            "request": "push the trip back a week",
            "changes_applied": [
                {
                    "type": "date-shift",
                    "shift_days": 7,
                    "affected_days": [1, 2, 3, 4, 5],
                    "reverify": {"destination_research": False, "logistics": False, "budget": True},
                    "reason": "one-week shift, same season",
                }
            ],
            "days_before": 5,
            "days_after": 5,
            "review_pass": True,
        },
        "RevisionLogEntry",
    )


def test_log_entry_missing_review_pass_fails():
    try:
        _validate(
            {
                "timestamp": "20-09-2026 14:03",
                "request": "push it back",
                "changes_applied": [],
                "days_before": 5,
                "days_after": 5,
            },
            "RevisionLogEntry",
        )
        assert False, "expected a validation error"
    except jsonschema.ValidationError:
        pass
