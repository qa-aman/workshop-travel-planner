import json
from pathlib import Path

import httpx
import respx
from travel_tools import cache, rail

FIX = Path(__file__).parent / "fixtures" / "routes_transit_paris_lyon.json"


def test_get_rail_route_tokyo_kyoto():
    out = rail.get_rail_route("Tokyo", "Kyoto")
    assert out["train"] == "Nozomi"
    assert out["duration_min"] == 135
    assert out["fare_jpy_reserved"] == 13970
    assert out["source"] == "seed"
    assert out["source_url"].startswith("https://smart-ex.jp")


def test_get_rail_route_is_symmetric():
    assert rail.get_rail_route("kyoto", "TOKYO")["fare_jpy_reserved"] == 13970


def test_get_rail_route_unknown_pair_with_no_key_is_error(monkeypatch):
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_MAPS_API", raising=False)
    out = rail.get_rail_route("Tokyo", "Sapporo")
    assert "error" in out


@respx.mock
def test_get_rail_route_falls_through_to_live_transit_outside_seed_data(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "k")
    route = respx.post("https://routes.googleapis.com/directions/v2:computeRoutes").mock(
        return_value=httpx.Response(200, json=json.loads(FIX.read_text()))
    )
    out = rail.get_rail_route("Gare de Lyon, Paris, France", "Gare Part-Dieu, Lyon, France")
    body = json.loads(route.calls[0].request.content)
    assert body["travelMode"] == "TRANSIT"
    assert out["source"] == "tool"
    assert out["line"] == "Paris - Lyon TGV"
    assert out["duration_min"] == 120
    assert out["fare_amount"] == 115.0
    assert out["fare_currency"] == "EUR"


@respx.mock
def test_get_rail_route_no_seed_and_no_live_transit_is_could_not_verify(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "k")
    respx.post("https://routes.googleapis.com/directions/v2:computeRoutes").mock(
        return_value=httpx.Response(200, json={})
    )
    out = rail.get_rail_route("Tokyo", "Osaka")
    assert "error" in out and "could not verify" in out["error"]


def test_get_rail_route_accepts_legacy_env_name(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    monkeypatch.setenv("GOOGLE_MAPS_API", "k")
    assert rail.api_key() == "k"
