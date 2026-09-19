import httpx

TIMEOUT = 20.0


def get_json(url: str, params: dict | None = None, headers: dict | None = None) -> dict:
    try:
        r = httpx.get(url, params=params, headers=headers, timeout=TIMEOUT)
        if r.status_code >= 400:
            return {"error": f"HTTP {r.status_code}: {r.text[:200]}"}
        return r.json()
    except Exception as e:  # network, timeout, bad json
        return {"error": f"{type(e).__name__}: {e}"}


def post_json(url: str, body: dict, headers: dict | None = None) -> dict:
    try:
        r = httpx.post(url, json=body, headers=headers, timeout=TIMEOUT)
        if r.status_code >= 400:
            return {"error": f"HTTP {r.status_code}: {r.text[:200]}"}
        return r.json()
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}
