"""
users.py — User management: registration, authentication, token lifecycle,
password changes, and admin CRUD.

All routes are mounted under /auth in main.py via:
    app.include_router(auth_router)
"""
import hashlib
import re
import sqlite3
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, validator

from auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_current_admin,
)
from session import DB_PATH

router = APIRouter(prefix="/auth", tags=["auth"])


# ── DB schema init ────────────────────────────────────────────────

def init_users_db():
    """Create users and refresh_tokens tables if they don't exist."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id              TEXT PRIMARY KEY,
            email           TEXT UNIQUE NOT NULL,
            username        TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            is_active       INTEGER DEFAULT 1,
            is_admin        INTEGER DEFAULT 0,
            created_at      TEXT,
            updated_at      TEXT,
            last_login      TEXT
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id          TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL,
            token_hash  TEXT UNIQUE NOT NULL,
            expires_at  TEXT NOT NULL,
            created_at  TEXT,
            revoked     INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()


# ── Internal DB helpers ───────────────────────────────────────────

def get_user_by_email(email: str) -> Optional[dict]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT * FROM users WHERE email=? AND is_active=1", (email.lower(),)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_id(user_id: str) -> Optional[dict]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT * FROM users WHERE id=? AND is_active=1", (user_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def create_user_db(
    email: str, username: str, password: str, is_admin: bool = False
) -> dict:
    conn = sqlite3.connect(DB_PATH)
    user_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    try:
        conn.execute(
            """
            INSERT INTO users
                (id, email, username, hashed_password, is_active, is_admin, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?)
            """,
            (user_id, email.lower(), username, hash_password(password), int(is_admin), now, now),
        )
        conn.commit()
    except sqlite3.IntegrityError as exc:
        conn.close()
        if "email" in str(exc).lower():
            raise HTTPException(status_code=400, detail="Email already registered")
        raise HTTPException(status_code=400, detail="Username already taken")
    conn.close()
    return {"id": user_id, "email": email.lower(), "username": username, "is_admin": is_admin}


def _store_refresh_token(user_id: str, token_hash: str, expires_at: datetime):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            str(uuid.uuid4()), user_id, token_hash,
            expires_at.isoformat(), datetime.utcnow().isoformat(),
        ),
    )
    conn.commit()
    conn.close()


def _revoke_refresh_token(token_hash: str):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("UPDATE refresh_tokens SET revoked=1 WHERE token_hash=?", (token_hash,))
    conn.commit()
    conn.close()


def _revoke_all_user_tokens(user_id: str):
    """Invalidate every refresh token for a user (password change, deactivation)."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("UPDATE refresh_tokens SET revoked=1 WHERE user_id=?", (user_id,))
    conn.commit()
    conn.close()


def _get_valid_refresh_token(token_hash: str) -> Optional[dict]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        """
        SELECT * FROM refresh_tokens
        WHERE token_hash=? AND revoked=0 AND expires_at > ?
        """,
        (token_hash, datetime.utcnow().isoformat()),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def _update_last_login(user_id: str):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "UPDATE users SET last_login=? WHERE id=?",
        (datetime.utcnow().isoformat(), user_id),
    )
    conn.commit()
    conn.close()


def _issue_tokens(user: dict) -> dict:
    """Create, store, and return access + refresh token pair for a user."""
    access_token = create_access_token({
        "sub":      user["id"],
        "email":    user["email"],
        "username": user["username"],
        "is_admin": bool(user["is_admin"]),
    })
    raw_refresh, token_hash, expires_at = create_refresh_token(user["id"])
    _store_refresh_token(user["id"], token_hash, expires_at)
    return {
        "access_token":  access_token,
        "refresh_token": raw_refresh,
        "token_type":    "bearer",
    }


# ── Request/Response schemas ──────────────────────────────────────

class RegisterRequest(BaseModel):
    email:    str
    username: str
    password: str

    @validator("email")
    def validate_email(cls, v):
        if not re.match(r"[^@]+@[^@]+\.[^@]+", v):
            raise ValueError("Invalid email address")
        return v.lower()

    @validator("username")
    def validate_username(cls, v):
        if not re.match(r"^[a-zA-Z0-9_-]{3,30}$", v):
            raise ValueError("Username must be 3-30 chars: letters, numbers, _ or -")
        return v

    @validator("password")
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit")
        return v


class LoginRequest(BaseModel):
    email:    str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password:     str

    @validator("new_password")
    def validate_new_password(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit")
        return v


# ── Auth routes ───────────────────────────────────────────────────

@router.post("/register", status_code=201)
async def register(req: RegisterRequest):
    """
    Register a new user account.
    Returns access token (15 min) + refresh token (7 days) on success.
    """
    user   = create_user_db(req.email, req.username, req.password)
    tokens = _issue_tokens(user)
    return {
        **tokens,
        "user": {"id": user["id"], "email": user["email"], "username": user["username"]},
    }


@router.post("/login")
async def login(req: LoginRequest):
    """
    Authenticate with email + password.
    Returns access token + refresh token on success.
    Uses constant-time comparison to prevent timing attacks.
    """
    user = get_user_by_email(req.email)
    # Always run verify_password even on None to prevent timing oracle
    dummy_hash = "$2b$12$notarealhashjustpreventingtimingattacks000000000000000"
    valid = verify_password(req.password, user["hashed_password"] if user else dummy_hash)
    if not user or not valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    _update_last_login(user["id"])
    tokens = _issue_tokens(user)
    return {
        **tokens,
        "user": {
            "id":       user["id"],
            "email":    user["email"],
            "username": user["username"],
            "is_admin": bool(user["is_admin"]),
        },
    }


@router.post("/refresh")
async def refresh_token_endpoint(req: RefreshRequest):
    """
    Exchange a valid refresh token for a new access token.
    Implements token rotation: old refresh token is revoked, new one issued.
    """
    token_hash = hashlib.sha256(req.refresh_token.encode()).hexdigest()
    record     = _get_valid_refresh_token(token_hash)
    if not record:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    user = get_user_by_id(record["user_id"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found or deactivated")
    _revoke_refresh_token(token_hash)   # rotate: revoke old
    return _issue_tokens(user)          # issue new pair


@router.post("/logout")
async def logout(req: RefreshRequest):
    """Revoke the provided refresh token, ending this device's session."""
    token_hash = hashlib.sha256(req.refresh_token.encode()).hexdigest()
    _revoke_refresh_token(token_hash)
    return {"message": "Logged out successfully"}


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    user = get_user_by_id(current_user["id"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id":         user["id"],
        "email":      user["email"],
        "username":   user["username"],
        "is_admin":   bool(user["is_admin"]),
        "created_at": user["created_at"],
        "last_login": user["last_login"],
    }


@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Change the authenticated user's password.
    Invalidates all existing refresh tokens (forces re-login on all devices).
    """
    user = get_user_by_id(current_user["id"])
    if not user or not verify_password(req.current_password, user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "UPDATE users SET hashed_password=?, updated_at=? WHERE id=?",
        (hash_password(req.new_password), datetime.utcnow().isoformat(), current_user["id"]),
    )
    conn.commit()
    conn.close()
    _revoke_all_user_tokens(current_user["id"])  # force re-login on all devices
    return {"message": "Password changed. Please log in again on all devices."}


# ── Admin routes ──────────────────────────────────────────────────

@router.get("/admin/users")
async def list_users(admin: dict = Depends(get_current_admin)):
    """List all user accounts. Admin only."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, email, username, is_active, is_admin, created_at, last_login "
        "FROM users ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.patch("/admin/users/{user_id}/deactivate")
async def deactivate_user(user_id: str, admin: dict = Depends(get_current_admin)):
    """Deactivate a user account and revoke all their tokens. Admin only."""
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "UPDATE users SET is_active=0, updated_at=? WHERE id=?",
        (datetime.utcnow().isoformat(), user_id),
    )
    conn.commit()
    conn.close()
    _revoke_all_user_tokens(user_id)
    return {"message": f"User {user_id} deactivated and sessions revoked"}


@router.patch("/admin/users/{user_id}/activate")
async def activate_user(user_id: str, admin: dict = Depends(get_current_admin)):
    """Re-activate a previously deactivated user account. Admin only."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "UPDATE users SET is_active=1, updated_at=? WHERE id=?",
        (datetime.utcnow().isoformat(), user_id),
    )
    conn.commit()
    conn.close()
    return {"message": f"User {user_id} activated"}


@router.patch("/admin/users/{user_id}/make-admin")
async def make_admin(user_id: str, admin: dict = Depends(get_current_admin)):
    """Grant admin privileges to a user. Admin only."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "UPDATE users SET is_admin=1, updated_at=? WHERE id=?",
        (datetime.utcnow().isoformat(), user_id),
    )
    conn.commit()
    conn.close()
    return {"message": f"User {user_id} is now an admin"}


@router.patch("/admin/users/{user_id}/revoke-admin")
async def revoke_admin(user_id: str, admin: dict = Depends(get_current_admin)):
    """Revoke admin privileges from a user. Admin only."""
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot revoke your own admin role")
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "UPDATE users SET is_admin=0, updated_at=? WHERE id=?",
        (datetime.utcnow().isoformat(), user_id),
    )
    conn.commit()
    conn.close()
    return {"message": f"Admin role revoked for user {user_id}"}
