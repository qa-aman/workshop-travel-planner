from travel_tools import rail


def test_get_rail_route_tokyo_kyoto():
    out = rail.get_rail_route("Tokyo", "Kyoto")
    assert out["train"] == "Nozomi"
    assert out["duration_min"] == 135
    assert out["fare_jpy_reserved"] == 13970
    assert out["source"] == "seed"
    assert out["source_url"].startswith("https://smart-ex.jp")


def test_get_rail_route_is_symmetric():
    assert rail.get_rail_route("kyoto", "TOKYO")["fare_jpy_reserved"] == 13970


def test_get_rail_route_unknown_pair():
    out = rail.get_rail_route("Tokyo", "Sapporo")
    assert "error" in out and "could not verify" in out["error"]
