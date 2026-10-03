from typing import Annotated

from pydantic import Field, StringConstraints

MAX_AMOUNT = 1_000_000_000_000

Money = Annotated[int, Field(gt=0, le=MAX_AMOUNT)]
SignedMoney = Annotated[int, Field(ge=-MAX_AMOUNT, le=MAX_AMOUNT)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
MonthStr = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}$")]
