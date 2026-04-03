from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=LoginResponse)
def login(data: LoginRequest) -> LoginResponse:
    if data.email == "admin@test.com" and data.password == "123456":
        return LoginResponse(access_token="mock-access-token")
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
