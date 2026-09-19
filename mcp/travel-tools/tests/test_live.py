import os

import pytest
from travel_tools import currency, places, walking

live = pytest.mark.skipif(os.environ.get("LIVE_API_TESTS") != "1", reason="set LIVE_API_TESTS=1")


@live
def test_live_places_kyoto_temples():
    out = places.search_places("quiet temples", "Kyoto", place_type="buddhist_temple", max_results=3)
    assert "places" in out and len(out["places"]) >= 1, out


@live
def test_live_walk_asakusa_ueno():
    out = walking.get_walking_route("Senso-ji, Tokyo, Japan", "Ueno Park, Tokyo, Japan")
    assert 15 <= out.get("duration_min", 0) <= 45, out


@live
def test_live_fx():
    out = currency.convert_currency(1, "USD", "JPY")
    assert out["rate"] > 100, out
