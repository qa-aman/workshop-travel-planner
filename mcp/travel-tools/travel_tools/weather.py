import re

from travel_tools.cache import cached
from travel_tools.http import get_json

URL = "https://api.open-meteo.com/v1/forecast"
DDMMYYYY = re.compile(r"^\d{2}-\d{2}-\d{4}$")


def _to_iso(d: str) -> str:
    dd, mm, yyyy = d.split("-")
    return f"{yyyy}-{mm}-{dd}"


def _to_ddmmyyyy(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}-{m}-{y}"


def get_weather(lat: float, lon: float, start_date: str, end_date: str) -> dict:
    if not (DDMMYYYY.match(start_date) and DDMMYYYY.match(end_date)):
        return {"error": "dates must be DD-MM-YYYY"}

    def fetch() -> dict:
        data = get_json(URL, params={
            "latitude": lat,
            "longitude": lon,
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
            "start_date": _to_iso(start_date),
            "end_date": _to_iso(end_date),
            "timezone": "auto",
        })
        if "error" in data:
            return data
        d = data.get("daily", {})
        days = [
            {"date": _to_ddmmyyyy(t), "max_c": mx, "min_c": mn, "rain_mm": rain}
            for t, mx, mn, rain in zip(
                d.get("time", []), d.get("temperature_2m_max", []),
                d.get("temperature_2m_min", []), d.get("precipitation_sum", []),
            )
        ]
        return {"days": days}

    return cached(["wx", round(lat, 2), round(lon, 2), start_date, end_date], 6 * 3600, fetch)
