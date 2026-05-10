"""JWT auth utilities for Bloom Labs admin dashboard."""
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

JWT_SECRET = os.environ.get("JWT_SECRET", "insecure-dev-secret")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRES_HOURS = int(os.environ.get("JWT_EXPIRES_HOURS", "72"))

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(subject: str, extra: Optional[Dict[str, Any]] = None) -> str:
    now = datetime.now(timezone.utc)
    payload: Dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=JWT_EXPIRES_HOURS)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Dict[str, Any]:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(creds.credentials)
    role = payload.get("role", "founder")
    # Hard role separation: client tokens MUST NOT reach admin routes.
    if role not in ("founder", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return {
        "email": payload.get("sub"),
        "name": payload.get("name"),
        "role": role,
    }
