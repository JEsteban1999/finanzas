from app.core.ratelimit import RateLimiter


def test_rate_limiter_blocks_after_limit_and_recovers():
    limiter = RateLimiter(limit=2, window_seconds=60)
    assert limiter.hit("k", 0.0)
    assert limiter.hit("k", 1.0)
    assert not limiter.hit("k", 2.0)
    assert limiter.hit("otra", 2.0)
    assert limiter.hit("k", 61.0)
