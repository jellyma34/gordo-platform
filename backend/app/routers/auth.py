from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import ALL_SECTIONS_ORDERED, normalize_allowed_sections
from app.models import User
from app.schemas import LoginRequest, LoginResponse
from app.security import create_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    try:
        print("LOGIN HIT", flush=True)
        email = body.email.strip().lower()
        password = body.password.strip()
        print("LOGIN INPUT:", email, password, flush=True)

        if db is None:
            raise RuntimeError("DB session is not available")

        user = db.scalars(select(User).where(User.email == email)).first()
        print("USER FOUND", user.email if user else None, flush=True)

        if user is None:
            print("LOGIN FAILED: user not found", flush=True)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )

        if not verify_password(password, user.password_hash):
            print("LOGIN FAILED: invalid password", flush=True)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )

        print("PASSWORD OK", flush=True)

        if settings.login_debug:
            print("[login_debug]", email, flush=True)
            print("[login_debug] hash prefix:", (user.password_hash or "")[:20], flush=True)

        if user.role not in ("admin", "manager", "employee"):
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Некорректная роль")

        token = create_access_token(subject=str(user.id))
        if user.role in ("admin", "manager"):
            sections = list(ALL_SECTIONS_ORDERED)
        else:
            sections = normalize_allowed_sections(user.allowed_sections)

        print("LOGIN RESPONSE OK", email, flush=True)
        return LoginResponse(
            token=token,
            role=user.role,  # type: ignore[arg-type]
            allowed_sections=sections,
        )
    except HTTPException:
        raise
    except Exception as e:
        print("LOGIN ERROR:", str(e), flush=True)
        raise HTTPException(status_code=500, detail=str(e))
