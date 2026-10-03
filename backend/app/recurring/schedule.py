from datetime import date

from app.core.months import add_months, clamp_day


def first_run_date(start: date, day_of_month: int) -> date:
    candidate = clamp_day(start.year, start.month, day_of_month)
    if candidate >= start:
        return candidate
    following = add_months(start.replace(day=1), 1)
    return clamp_day(following.year, following.month, day_of_month)


def next_run_after(current: date, day_of_month: int) -> date:
    following = add_months(current.replace(day=1), 1)
    return clamp_day(following.year, following.month, day_of_month)


def due_dates(next_run: date, day_of_month: int, today: date, end_date: date | None) -> list[date]:
    dates: list[date] = []
    current = next_run
    while current <= today and (end_date is None or current <= end_date):
        dates.append(current)
        current = next_run_after(current, day_of_month)
    return dates
