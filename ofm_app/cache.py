"""
JSON 파일 기반 캐시 (OFM + Makro 지원).
키 형식: "{source}:{product_id}" (예: "ofm:5096335", "makro:929262")
"""

import json
import time
from pathlib import Path
from threading import Lock


CACHE_FILE = Path(__file__).parent / "cache.json"
CACHE_TTL_SECONDS = 24 * 60 * 60
_lock = Lock()


def _make_key(source: str, product_id: str) -> str:
    return f"{source}:{product_id}"


def _load() -> dict:
    if not CACHE_FILE.exists():
        return {}
    try:
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save(data: dict):
    CACHE_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def get(source: str, product_id: str) -> dict | None:
    key = _make_key(source, product_id)
    with _lock:
        data = _load()
    entry = data.get(key)
    if not entry:
        return None
    if time.time() - entry.get("cached_at", 0) > CACHE_TTL_SECONDS:
        return None
    return entry.get("data")


def set(source: str, product_id: str, product_data: dict):
    key = _make_key(source, product_id)
    with _lock:
        data = _load()
        data[key] = {
            "cached_at": time.time(),
            "source": source,
            "data": product_data,
        }
        _save(data)


def clear(source: str = None):
    with _lock:
        if source is None:
            if CACHE_FILE.exists():
                CACHE_FILE.unlink()
        else:
            data = _load()
            data = {k: v for k, v in data.items() if not k.startswith(f"{source}:")}
            _save(data)


def stats() -> dict:
    with _lock:
        data = _load()
    now = time.time()

    by_source = {}
    for key, entry in data.items():
        source = entry.get("source")
        if not source and ":" in key:
            source = key.split(":", 1)[0]
        source = source or "unknown"
        if source not in by_source:
            by_source[source] = {"total": 0, "valid": 0, "expired": 0}
        by_source[source]["total"] += 1
        if now - entry.get("cached_at", 0) <= CACHE_TTL_SECONDS:
            by_source[source]["valid"] += 1
        else:
            by_source[source]["expired"] += 1

    total_valid = sum(s["valid"] for s in by_source.values())
    total_expired = sum(s["expired"] for s in by_source.values())

    return {
        "total": len(data),
        "valid": total_valid,
        "expired": total_expired,
        "by_source": by_source,
    }
