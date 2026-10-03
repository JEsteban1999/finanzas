from app.core.ratelimit import RateLimiter


def test_rate_limiter_blocks_after_limit_and_recovers():
    limiter = RateLimiter(limit=2, window_seconds=60)
    assert limiter.hit("k", 0.0)
    assert limiter.hit("k", 1.0)
    assert not limiter.hit("k", 2.0)
    assert limiter.hit("otra", 2.0)
    assert limiter.hit("k", 61.0)


def test_rate_limiter_removes_expired_keys_and_does_not_leak_on_rejection():
    limiter = RateLimiter(limit=1, window_seconds=60)
    assert limiter.hit("a", 0.0)
    for t in (1.0, 2.0, 3.0):
        assert not limiter.hit("a", t)
    assert len(limiter._hits) == 1
    assert limiter.hit("a", 61.0)
    assert len(limiter._hits) == 1
    assert limiter.hit("b", 62.0)
    assert limiter.hit("b", 123.0)
    assert set(limiter._hits) == {"b"}
    limiter._hits.clear()
    limiter = RateLimiter(limit=1, window_seconds=60)
    limiter.hit("x", 0.0)
    limiter.hit("x", 61.0)
    assert list(limiter._hits["x"]) == [61.0]


def test_rate_limiter_sweeps_stale_keys_of_other_users():
    limiter = RateLimiter(limit=1, window_seconds=60)
    assert limiter.hit("a", 0.0)
    assert limiter.hit("b", 61.0)
    assert "a" not in limiter._hits
