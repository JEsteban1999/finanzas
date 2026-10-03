from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo


def utcnow() -> datetime:
    return datetime.now(UTC)


def get_now() -> datetime:
    """Dependencia FastAPI; los tests la sobreescriben para fijar el reloj."""
    return utcnow()


def local_today(now: datetime, tz: str) -> date:
    return now.astimezone(ZoneInfo(tz)).date()
