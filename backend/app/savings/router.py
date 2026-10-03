from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.models import User
from app.core.db import get_db
from app.savings.models import SavingsRule
from app.savings.schemas import SavingsRuleIn, SavingsRuleOut
from app.savings.service import delete_rule, get_rule, upsert_rule

router = APIRouter(prefix="/api/savings-rule", tags=["savings"])


@router.get("", response_model=SavingsRuleOut | None)
def get(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> SavingsRule | None:
    return get_rule(db, user.id)


@router.put("", response_model=SavingsRuleOut)
def put(
    body: SavingsRuleIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> SavingsRule:
    return upsert_rule(db, user.id, body)


@router.delete("", status_code=204)
def delete(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    delete_rule(db, user.id)
