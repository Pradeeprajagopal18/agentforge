"""
auth.py — JWT authentication utilities and FastAPI dependencies.

Enterprise security layer for AgentForge. Handles:
  - Password hashing (bcrypt)
  - JWT access token creation / validation (HS256)
  - Refresh token creation (UUID, stored as SHA-256 hash server-side)
  - FastAPI dependency functions: get_current_user, get_current_admin
  - WebSocket token validator (sync version for handshake)
"""
import hashlib
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext

# ── Configuration ─────────────────────────────────────────────────
SECRET_KEY = os.getenv("JWT_SECRET", "")
if not SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET is not set.\n"
        "Add a strong random secret to backend/.env:\n"
        "  JWT_SECRET=$(python -c \"import secrets; print(secrets.token_hex(32))\")"
    )

ALGORITHM                   = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS   = int(os.getenv("JWT_REFRESH_EXPIRE_DAYS", "7"))

pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()


# ── Password helpers ──────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Return a bcrypt hash of the plaintext password."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time bcrypt comparison."""
    return pwd_context.verify(plain, hashed)


# ── JWT helpers ───────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Encode a short-lived JWT access token.
    Payload must include 'sub' (user_id), 'email', 'username', 'is_admin'.
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(user_id: str) -> tuple[str, str, datetime]:
    """
    Generate a refresh token.
    Returns (raw_token, sha256_hash, expires_at).
    Only the hash is stored server-side; the raw token is returned to the client.
    """
    raw        = str(uuid.uuid4())
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    expires_at = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    return raw, token_hash, expires_at


def _decode_token(token: str) -> dict:
    """Decode and validate a JWT, raising 401 on any failure."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _extract_user(payload: dict) -> dict:
    """Pull the user dict out of a decoded JWT payload."""
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Malformed token payload")
    return {
        "id":       user_id,
        "email":    payload.get("email"),
        "username": payload.get("username"),
        "is_admin": payload.get("is_admin", False),
    }


# ── FastAPI dependencies ──────────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    """
    FastAPI dependency — validates Bearer JWT and returns user dict.
    Usage: current_user: dict = Depends(get_current_user)
    """
    payload = _decode_token(credentials.credentials)
    return _extract_user(payload)


async def get_current_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """
    FastAPI dependency — like get_current_user but requires is_admin=True.
    Usage: admin: dict = Depends(get_current_admin)
    """
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def verify_ws_token(token: str) -> dict:
    """
    Synchronous JWT check for WebSocket handshake.
    Called with the ?token= query parameter before accepting the socket.
    """
    payload = _decode_token(token)
    return _extract_user(payload)
