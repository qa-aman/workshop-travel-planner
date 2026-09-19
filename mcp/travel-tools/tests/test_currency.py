import httpx
import respx
from travel_tools import cache, currency


@respx.mock
def test_convert_currency_returns_converted_amount(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    respx.get("https://api.frankfurter.dev/v1/latest").mock(
        return_value=httpx.Response(200, json={"amount": 1.0, "base": "USD", "date": "2026-09-18", "rates": {"JPY": 157.89}})
    )
    out = currency.convert_currency(100, "USD", "JPY")
    assert out["amount"] == 15789.0
    assert out["rate"] == 157.89
    assert out["date"] == "18-09-2026"


@respx.mock
def test_convert_currency_propagates_error(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    respx.get("https://api.frankfurter.dev/v1/latest").mock(return_value=httpx.Response(500, text="x"))
    assert "error" in currency.convert_currency(1, "USD", "JPY")
