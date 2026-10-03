from datetime import date

from app.recurring.schedule import due_dates, first_run_date, next_run_after


def test_first_run_date_same_month_or_next():
    assert first_run_date(date(2026, 10, 3), 5) == date(2026, 10, 5)
    assert first_run_date(date(2026, 10, 3), 3) == date(2026, 10, 3)
    assert first_run_date(date(2026, 10, 3), 1) == date(2026, 11, 1)


def test_day_31_does_not_drift():
    d = date(2026, 1, 31)
    d = next_run_after(d, 31)
    assert d == date(2026, 2, 28)
    d = next_run_after(d, 31)
    assert d == date(2026, 3, 31)
    assert next_run_after(date(2028, 1, 31), 31) == date(2028, 2, 29)


def test_due_dates_catches_up_and_respects_end_date():
    assert due_dates(date(2026, 7, 15), 15, date(2026, 10, 20), None) == [
        date(2026, 7, 15),
        date(2026, 8, 15),
        date(2026, 9, 15),
        date(2026, 10, 15),
    ]
    assert due_dates(date(2026, 7, 15), 15, date(2026, 10, 20), date(2026, 8, 31)) == [
        date(2026, 7, 15),
        date(2026, 8, 15),
    ]
    assert due_dates(date(2026, 10, 21), 21, date(2026, 10, 20), None) == []
