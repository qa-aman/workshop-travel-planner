import os

from travel_tools.cache import cached
from travel_tools.http import post_json

URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
FIELD_MASK = "routes.duration,routes.distanceMeters"


def api_key() -> str | None:
    return os.environ.get("GOOGLE_MAPS_API_KEY") or os.environ.get("GOOGLE_MAPS_API")


def _seconds(s: str | None) -> int:
    return int(str(s or "0s").rstrip("s"))


def get_walking_route(origin: str, destination: str) -> dict:
    key = api_key()
    if not key:
        return {"error": "GOOGLE_MAPS_API_KEY not set"}
    body = {"origin": {"address": origin}, "destination": {"address": destination}, "travelMode": "WALK"}

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
            return {"error": f"no walking route from {origin} to {destination}"}
        r = routes_[0]
        return {
            "duration_min": round(_seconds(r.get("duration")) / 60),
            "distance_m": int(r.get("distanceMeters", 0)),
            "source": "tool",
        }

    return cached(["walk", body], 24 * 3600, fetch)
