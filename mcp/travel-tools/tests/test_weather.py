import httpx
import respx
from travel_tools import cache, weather


@respx.mock
def test_get_weather_maps_days(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    respx.get("https://api.open-meteo.com/v1/forecast").mock(
        return_value=httpx.Response(200, json={
            "daily": {
                "time": ["2026-10-01", "2026-10-02"],
                "temperature_2m_max": [24.1, 22.0],
                "temperature_2m_min": [15.0, 14.2],
                "precipitation_sum": [0.0, 3.5],
            }
        })
    )
    out = weather.get_weather(35.01, 135.77, "01-10-2026", "02-10-2026")
    assert out["days"][1] == {"date": "02-10-2026", "max_c": 22.0, "min_c": 14.2, "rain_mm": 3.5}


def test_get_weather_rejects_bad_date_format(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    assert "error" in weather.get_weather(35.0, 135.0, "2026-10-01", "2026-10-02")
