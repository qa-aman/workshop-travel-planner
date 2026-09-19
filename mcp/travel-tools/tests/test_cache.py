import time
from travel_tools import cache


def test_cached_calls_fn_once_within_ttl(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    calls = []

    def fn():
        calls.append(1)
        return {"v": 1}

    assert cache.cached(["a", 1], 60, fn) == {"v": 1}
    assert cache.cached(["a", 1], 60, fn) == {"v": 1}
    assert len(calls) == 1


def test_cached_refetches_after_ttl(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    calls = []

    def fn():
        calls.append(1)
        return {"v": len(calls)}

    cache.cached(["b"], 60, fn)
    old = time.time() - 120
    for p in tmp_path.iterdir():
        import os
        os.utime(p, (old, old))
    assert cache.cached(["b"], 60, fn) == {"v": 2}


def test_cached_does_not_store_errors(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    cache.cached(["c"], 60, lambda: {"error": "boom"})
    assert list(tmp_path.iterdir()) == []
