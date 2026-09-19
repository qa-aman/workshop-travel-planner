import json
from pathlib import Path

import httpx
import respx
from travel_tools import cache, places

FIX = Path(__file__).parent / "fixtures" / "places_kyoto_temples.json"


@respx.mock
def test_search_places_maps_fields(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "k")
    route = respx.post("https://places.googleapis.com/v1/places:searchText").mock(
        return_value=httpx.Response(200, json=json.loads(FIX.read_text()))
    )
    out = places.search_places("quiet temples", "Kyoto", place_type="buddhist_temple", max_results=5)
    body = json.loads(route.calls[0].request.content)
    assert body == {"textQuery": "quiet temples in Kyoto", "includedType": "buddhist_temple", "pageSize": 5}
    assert route.calls[0].request.headers["X-Goog-Api-Key"] == "k"
    assert "places.displayName" in route.calls[0].request.headers["X-Goog-FieldMask"]
    p = out["places"][1]
    assert p["name"] == "Shisen-do"
    assert p["area"] == "Sakyo Ward"
    assert p["price_level"] == "inexpensive"
    assert p["lat"] == 35.0424
    assert out["places"][0]["price_level"] is None


def test_search_places_requires_key(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_MAPS_API", raising=False)

    def must_not_call(*args, **kwargs):
        raise AssertionError("post_json must not be called without a key")

    monkeypatch.setattr(places, "post_json", must_not_call)
    out = places.search_places("x", "Tokyo")
    assert out == {"error": "GOOGLE_MAPS_API_KEY not set"}


def test_area_falls_back_to_city_segment_for_short_addresses():
    assert places._area("Eiffel Tower, Paris, France") == "Paris"
    assert places._area("Kyoto") == "Kyoto"
