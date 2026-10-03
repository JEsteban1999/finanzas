"""Importa todos los modelos para que Alembic los descubra."""

from app.accounts.models import Account
from app.auth.models import Invitation, User, UserSession
from app.budgets.models import Budget
from app.categories.models import Category
from app.recurring.models import RecurringTemplate
from app.savings.models import SavingsRule
from app.transactions.models import Transaction

__all__ = [
    "Account",
    "Budget",
    "Category",
    "Invitation",
    "RecurringTemplate",
    "SavingsRule",
    "Transaction",
    "User",
    "UserSession",
]
