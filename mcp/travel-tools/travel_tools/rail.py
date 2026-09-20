import json
import os
from pathlib import Path

from travel_tools.cache import cached
from travel_tools.http import post_json

DATA = Path(__file__).resolve().parent.parent / "data" / "japan_rail.json"
URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
FIELD_MASK = (
    "routes.duration,routes.distanceMeters,routes.travelAdvisory.transitFare,"
    "routes.legs.steps.transitDetails.transitLine.name,"
    "routes.legs.steps.transitDetails.transitLine.nameShort"
)


def api_key() -> str | None:
    return os.environ.get("GOOGLE_MAPS_API_KEY") or os.environ.get("GOOGLE_MAPS_API")


def _load_seed() -> dict:
    return json.loads(DATA.read_text())


def _seconds(s: str | None) -> int:
    return int(str(s or "0s").rstrip("s"))


def _seed_lookup(origin_city: str, destination_city: str) -> dict | None:
    data = _load_seed()
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
    return None


def _line_name(route: dict) -> str | None:
    for leg in route.get("legs") or []:
        for step in leg.get("steps") or []:
            td = step.get("transitDetails")
            if td:
                line = td.get("transitLine") or {}
                name = line.get("name") or line.get("nameShort")
                if name:
                    return name
    return None


def _live_transit(origin_city: str, destination_city: str) -> dict:
    key = api_key()
    if not key:
        return {"error": "GOOGLE_MAPS_API_KEY not set"}
    body = {"origin": {"address": origin_city}, "destination": {"address": destination_city}, "travelMode": "TRANSIT"}

    def fetch() -> dict:
        data = post_json(URL, body, headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": FIELD_MASK,
        })
        if "error" in data:
            return data
        routes_ = data.get("routes") or []
        if not routes_:
            return {
                "error": (
                    f"could not verify rail route {origin_city} to {destination_city}: "
                    "not in seed data and Google Routes returned no transit itinerary"
                )
            }
        r = routes_[0]
        fare = (r.get("travelAdvisory") or {}).get("transitFare")
        return {
            "line": _line_name(r),
            "duration_min": round(_seconds(r.get("duration")) / 60),
            "distance_m": int(r.get("distanceMeters", 0)),
            "fare_amount": float(fare["units"]) if fare else None,
            "fare_currency": fare["currencyCode"] if fare else None,
            "source": "tool",
        }

    return cached(["transit", body], 24 * 3600, fetch)


def get_rail_route(origin_city: str, destination_city: str) -> dict:
    """Seed data first (fast, official-source-cited, and the only path that works for Japan,
    where Google Routes TRANSIT reliably returns no itinerary). Any other city pair falls
    through to a live Google Routes TRANSIT call, which does return real data outside Japan."""
    seeded = _seed_lookup(origin_city, destination_city)
    if seeded:
        return seeded
    return _live_transit(origin_city, destination_city)
