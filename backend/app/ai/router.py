import time
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.ai.context import build_context
from app.ai.deps import get_parser
from app.ai.parser import AIUnavailableError, TransactionParser
from app.ai.schemas import DraftTransaction, ParseRequest
from app.auth.deps import get_current_user
from app.auth.models import User
from app.core.clock import get_now
from app.core.db import get_db
from app.core.errors import AppError

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/parse-transaction", response_model=DraftTransaction)
def parse_transaction(
    body: ParseRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
    parser: TransactionParser = Depends(get_parser),
) -> DraftTransaction:
    if not request.app.state.ai_limiter.hit(str(user.id), time.monotonic()):
        raise AppError(429, "AI_RATE_LIMITED", "Muchas solicitudes; intenta en un rato")
    context = build_context(db, user, now)
    try:
        return parser.parse(body.text, context)
    except AIUnavailableError as exc:
        raise AppError(503, "AI_UNAVAILABLE", "No pude interpretarlo, complétalo a mano") from exc
