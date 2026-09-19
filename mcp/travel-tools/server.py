import os
import sys

from mcp.server import MCPServer

from pathlib import Path


def _load_dotenv() -> None:
    override = os.environ.get("TRAVEL_TOOLS_DOTENV")
    env_file = Path(override) if override else Path(__file__).resolve().parents[2] / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()

from travel_tools.currency import convert_currency as _convert_currency
from travel_tools.places import search_places as _search_places
from travel_tools.rail import get_rail_route as _get_rail_route
from travel_tools.walking import api_key, get_walking_route as _get_walking_route
from travel_tools.weather import get_weather as _get_weather

if not api_key():
    print("travel-tools: GOOGLE_MAPS_API_KEY is not set. Refusing to start.", file=sys.stderr)
    sys.exit(2)

mcp = MCPServer("travel-tools")


@mcp.tool()
def search_places(query: str, city: str, place_type: str | None = None, max_results: int = 8) -> dict:
    """Search real places (temples, food streets, hotels, neighbourhoods) via Google Places.
    place_type examples: buddhist_temple, shinto_shrine, restaurant, lodging, tourist_attraction.
    Returns {"places": [...]} or {"error": "..."}. Report an error as "could not verify"."""
    return _search_places(query, city, place_type, max_results)


@mcp.tool()
def get_walking_route(origin: str, destination: str) -> dict:
    """Walking time and distance between two places or addresses via Google Routes.
    Use for anchor-to-anchor moves inside one city zone. Returns duration_min, distance_m, or {"error"}."""
    return _get_walking_route(origin, destination)


@mcp.tool()
def get_rail_route(origin_city: str, destination_city: str) -> dict:
    """Shinkansen segment between two Japanese cities from seeded, source-cited JR Central fare data.
    Returns train, duration_min, fare_jpy_reserved, fare_jpy_hikari, source_url, or {"error": "could not verify ..."}."""
    return _get_rail_route(origin_city, destination_city)


@mcp.tool()
def convert_currency(amount: float, from_currency: str, to_currency: str) -> dict:
    """Convert an amount between currencies at today's ECB rate (Frankfurter)."""
    return _convert_currency(amount, from_currency, to_currency)


@mcp.tool()
def get_weather(lat: float, lon: float, start_date: str, end_date: str) -> dict:
    """Daily max, min and rain for a lat/lon between two DD-MM-YYYY dates (Open-Meteo)."""
    return _get_weather(lat, lon, start_date, end_date)


if __name__ == "__main__":
    mcp.run()
