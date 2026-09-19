import httpx
import respx
from travel_tools import http


@respx.mock
def test_get_json_returns_body():
    respx.get("https://x.test/a").mock(return_value=httpx.Response(200, json={"ok": 1}))
    assert http.get_json("https://x.test/a") == {"ok": 1}


@respx.mock
def test_get_json_returns_error_on_http_error():
    respx.get("https://x.test/a").mock(return_value=httpx.Response(403, text="denied"))
    out = http.get_json("https://x.test/a")
    assert out["error"].startswith("HTTP 403")


@respx.mock
def test_post_json_returns_error_on_network_failure():
    respx.post("https://x.test/p").mock(side_effect=httpx.ConnectError("down"))
    out = http.post_json("https://x.test/p", {"q": 1})
    assert "down" in out["error"]
