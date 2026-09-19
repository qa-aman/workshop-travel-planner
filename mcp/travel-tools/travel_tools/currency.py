from travel_tools.cache import cached
from travel_tools.http import get_json

URL = "https://api.frankfurter.dev/v1/latest"


def _to_ddmmyyyy(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}-{m}-{y}"


def convert_currency(amount: float, from_currency: str, to_currency: str) -> dict:
    src, dst = from_currency.upper(), to_currency.upper()

    def fetch() -> dict:
        data = get_json(URL, params={"base": src, "symbols": dst})
        if "error" in data:
            return data
        if dst not in data.get("rates", {}):
            return {"error": f"no rate for {src}->{dst}"}
        return {"rate": data["rates"][dst], "date": _to_ddmmyyyy(data["date"])}

    base = cached(["fx", src, dst], 24 * 3600, fetch)
    if "error" in base:
        return base
    return {
        "amount": round(amount * base["rate"], 2),
        "rate": base["rate"],
        "date": base["date"],
        "from": src,
        "to": dst,
    }
