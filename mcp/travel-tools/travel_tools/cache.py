import hashlib
import json
import time
from pathlib import Path
from typing import Callable

CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache"


def _key(parts: list) -> str:
    raw = json.dumps(parts, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def cached(key_parts: list, ttl_s: int, fn: Callable[[], dict]) -> dict:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{_key(key_parts)}.json"
    if path.exists() and time.time() - path.stat().st_mtime < ttl_s:
        return json.loads(path.read_text())
    result = fn()
    if "error" not in result:
        path.write_text(json.dumps(result))
    return result
