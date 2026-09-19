import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "japan_rail.json"


def _load() -> dict:
    return json.loads(DATA.read_text())


def get_rail_route(origin_city: str, destination_city: str) -> dict:
    data = _load()
    a, b = origin_city.strip().lower(), destination_city.strip().lower()
    for seg in data["segments"]:
        pair = {seg["from"].lower(), seg["to"].lower()}
        if pair == {a, b}:
            return {
                "line": seg["line"],
                "train": seg["train"],
                "duration_min": seg["duration_min"],
                "fare_jpy_reserved": seg["fare_jpy_reserved"],
                "fare_jpy_hikari": seg["fare_jpy_hikari"],
                "notes": seg["notes"],
                "season_note": data["season_note"],
                "source": "seed",
                "source_url": data["source_url"],
                "read_on": data["read_on"],
            }
    return {"error": f"could not verify rail route {origin_city} to {destination_city}: not in seed data"}
