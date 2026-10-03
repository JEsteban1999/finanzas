from collections import deque
from threading import Lock


class RateLimiter:
    """Ventana deslizante en memoria (una sola instancia del backend)."""

    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = {}
        self._last_sweep = 0.0
        self._lock = Lock()

    def _prune(self, key: str, now: float) -> deque[float] | None:
        hits = self._hits.get(key)
        if hits is None:
            return None
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        if not hits:
            del self._hits[key]
            return None
        return hits

    def hit(self, key: str, now: float) -> bool:
        with self._lock:
            if now - self._last_sweep >= self.window:
                for stale in list(self._hits):
                    self._prune(stale, now)
                self._last_sweep = now
            hits = self._prune(key, now)
            if hits is not None and len(hits) >= self.limit:
                return False
            if hits is None:
                hits = self._hits[key] = deque()
            hits.append(now)
            return True
