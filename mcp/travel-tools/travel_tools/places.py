from travel_tools.cache import cached
from travel_tools.http import post_json
from travel_tools.walking import api_key

URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = ",".join([
    "places.id", "places.displayName", "places.formattedAddress", "places.location",
    "places.rating", "places.userRatingCount", "places.priceLevel", "places.types",
    "places.googleMapsUri",
])
PRICE = {
    "PRICE_LEVEL_FREE": "free",
    "PRICE_LEVEL_INEXPENSIVE": "inexpensive",
    "PRICE_LEVEL_MODERATE": "moderate",
    "PRICE_LEVEL_EXPENSIVE": "expensive",
    "PRICE_LEVEL_VERY_EXPENSIVE": "very_expensive",
}


def _area(address: str) -> str:
    # "30 Shishigatani..., Sakyo Ward, Kyoto, 606-8426, Japan" -> "Sakyo Ward"
    parts = [p.strip() for p in address.split(",")]
    if len(parts) >= 4:
        return parts[-4]
    if len(parts) >= 2:
        return parts[-2]
    return parts[0] if parts else ""


def _map(p: dict) -> dict:
    loc = p.get("location", {})
    return {
        "name": p.get("displayName", {}).get("text", ""),
        "area": _area(p.get("formattedAddress", "")),
        "lat": loc.get("latitude"),
        "lon": loc.get("longitude"),
        "rating": p.get("rating"),
        "user_ratings_total": p.get("userRatingCount"),
        "price_level": PRICE.get(p.get("priceLevel")),
        "types": p.get("types", []),
        "maps_url": p.get("googleMapsUri"),
    }


def search_places(query: str, city: str, place_type: str | None = None, max_results: int = 8) -> dict:
    key = api_key()
    if not key:
        return {"error": "GOOGLE_MAPS_API_KEY not set"}
    n = max(1, min(int(max_results), 20))
    body: dict = {"textQuery": f"{query} in {city}", "pageSize": n}
    if place_type:
        body["includedType"] = place_type

    def fetch() -> dict:
        data = post_json(URL, body, headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": FIELD_MASK,
        })
        if "error" in data:
            return data
        return {"places": [_map(p) for p in data.get("places", [])]}

    return cached(["places", body], 24 * 3600, fetch)
