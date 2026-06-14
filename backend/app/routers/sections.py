from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.audit_log import log_action
from app.database import get_db
from app.deps import assert_section_access, get_current_user
from app.models import User

router = APIRouter(tags=["sections"])


@router.post("/upload/{section}")
async def upload_section(
    section: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assert_section_access(user, section)
    # Заглушка: слой авторизации без изменения контракта тела запроса (при необходимости добавьте UploadFile).
    log_action(
        db,
        user,
        "update",
        section,
        {"event": "upload"},
    )
    db.commit()
    return {"ok": True, "section": section}


@router.get("/analytics/{section}")
def analytics_section(section: str, user: User = Depends(get_current_user)):
    assert_section_access(user, section)
    return {"ok": True, "section": section}
