from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bootstrap_admin import bootstrap_admin_if_needed
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/debug", tags=["debug"])


@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    users = db.scalars(select(User)).all()
    return [{"email": u.email, "role": u.role} for u in users]


@router.post("/sync-bootstrap-admin")
def sync_bootstrap_admin():
    """Та же логика, что при старте: _bootstrap_admin_if_needed() → bootstrap_admin_if_needed()."""
    bootstrap_admin_if_needed()
    return {"ok": True, "message": "bootstrap_admin_if_needed() executed"}
