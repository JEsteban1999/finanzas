from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.models import User
from app.core.clock import get_now, local_today
from app.core.db import get_db
from app.core.months import month_start, parse_month
from app.dashboard.schemas import CompareOut, MonthlySummary
from app.dashboard.service import compare_months, monthly_summary

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _month_or_current(value: str | None, user: User, now: datetime) -> date:
    return parse_month(value) if value else month_start(local_today(now, user.timezone))


@router.get("/monthly", response_model=MonthlySummary)
def monthly(
    month: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> MonthlySummary:
    return monthly_summary(db, user, _month_or_current(month, user, now))


@router.get("/compare", response_model=CompareOut)
def compare(
    months: int = Query(6, ge=1, le=24),
    until: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> CompareOut:
    return compare_months(db, user.id, _month_or_current(until, user, now), months)
