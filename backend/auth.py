from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/auth/login")
def login(data: LoginRequest):
    if data.email == "admin@gordo.com" and data.password == "admin":
        return {
            "token": "fake-jwt-token",
            "user": {
                "email": data.email,
                "role": "admin",
            },
        }
    raise HTTPException(status_code=401, detail="Invalid credentials")
