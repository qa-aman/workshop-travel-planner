import json
from pathlib import Path

import httpx
import respx
from travel_tools import cache, walking

FIX = Path(__file__).parent / "fixtures" / "routes_walk_asakusa_ueno.json"


@respx.mock
def test_get_walking_route_maps_duration_and_distance(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "k")
    route = respx.post("https://routes.googleapis.com/directions/v2:computeRoutes").mock(
        return_value=httpx.Response(200, json=json.loads(FIX.read_text()))
    )
    out = walking.get_walking_route("Senso-ji, Tokyo, Japan", "Ueno Park, Tokyo, Japan")
    body = json.loads(route.calls[0].request.content)
    assert body == {"origin": {"address": "Senso-ji, Tokyo, Japan"}, "destination": {"address": "Ueno Park, Tokyo, Japan"}, "travelMode": "WALK"}
    assert out == {"duration_min": 29, "distance_m": 1911, "source": "tool"}


@respx.mock
def test_get_walking_route_empty_is_error(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "k")
    respx.post("https://routes.googleapis.com/directions/v2:computeRoutes").mock(return_value=httpx.Response(200, json={}))
    assert "error" in walking.get_walking_route("A", "B")


def test_get_walking_route_accepts_legacy_env_name(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    monkeypatch.setenv("GOOGLE_MAPS_API", "k")
    assert walking.api_key() == "k"
