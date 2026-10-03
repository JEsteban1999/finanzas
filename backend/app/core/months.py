import calendar
from datetime import date

from app.core.errors import AppError


def parse_month(value: str) -> date:
    try:
        year_s, month_s = value.split("-")
        if len(year_s) != 4 or len(month_s) != 2:
            raise ValueError(value)
        return date(int(year_s), int(month_s), 1)
    except ValueError as exc:
        raise AppError(422, "INVALID_MONTH", "Mes inválido, usa AAAA-MM") from exc


def format_month(month: date) -> str:
    return f"{month.year:04d}-{month.month:02d}"


def month_start(day: date) -> date:
    return day.replace(day=1)


def add_months(month: date, n: int) -> date:
    index = month.year * 12 + (month.month - 1) + n
    return date(index // 12, index % 12 + 1, 1)


def month_bounds(month: date) -> tuple[date, date]:
    return month, add_months(month, 1)


def clamp_day(year: int, month: int, day: int) -> date:
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last))
