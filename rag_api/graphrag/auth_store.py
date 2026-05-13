"""SQLite-backed user store for local authentication."""

from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _default_db_path() -> Path:
    raw = (os.getenv("AUTH_DB_PATH") or "").strip()
    if raw:
        return Path(raw)
    return _project_root() / "artifacts" / "auth.db"


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class UserRecord:
    id: int
    name: str
    email: str
    password_hash: str
    birth_date: str
    created_at: str
    parent_whatsapp: str = ""
    parent_contact_consent: bool = False

    def age_years(self, *, today: Optional[date] = None) -> int:
        d = datetime.strptime(self.birth_date, "%Y-%m-%d").date()
        now = today or date.today()
        years = now.year - d.year
        if (now.month, now.day) < (d.month, d.day):
            years -= 1
        return years

    def is_under_16(self) -> bool:
        return self.age_years() < 16


class AuthStore:
    def __init__(self, db_path: Optional[Path] = None) -> None:
        self.db_path = db_path or _default_db_path()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL DEFAULT '',
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    birth_date TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    parent_whatsapp TEXT NOT NULL DEFAULT '',
                    parent_contact_consent INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            # Lightweight migration for pre-existing tables created before `name` field.
            cols = conn.execute("PRAGMA table_info(users)").fetchall()
            names = {str(c["name"]) for c in cols}
            if "name" not in names:
                conn.execute("ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT ''")
            if "parent_whatsapp" not in names:
                conn.execute("ALTER TABLE users ADD COLUMN parent_whatsapp TEXT NOT NULL DEFAULT ''")
            if "parent_contact_consent" not in names:
                conn.execute(
                    "ALTER TABLE users ADD COLUMN parent_contact_consent INTEGER NOT NULL DEFAULT 0"
                )
            conn.commit()

    def create_user(
        self,
        *,
        name: str,
        email: str,
        password_hash: str,
        birth_date: str,
        parent_whatsapp: str = "",
        parent_contact_consent: bool = False,
    ) -> UserRecord:
        consent_i = 1 if parent_contact_consent else 0
        with self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO users (
                    name, email, password_hash, birth_date, created_at,
                    parent_whatsapp, parent_contact_consent
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    name.strip(),
                    email.strip().lower(),
                    password_hash,
                    birth_date,
                    _utc_iso(),
                    (parent_whatsapp or "").strip(),
                    consent_i,
                ),
            )
            conn.commit()
            uid = int(cur.lastrowid)
            row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
        if row is None:
            raise RuntimeError("Failed to create user")
        return self._row_to_user(row)

    def get_user_by_email(self, email: str) -> Optional[UserRecord]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE email = ?",
                (email.strip().lower(),),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_user(row)

    def get_user_by_id(self, user_id: int) -> Optional[UserRecord]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (int(user_id),)).fetchone()
        if row is None:
            return None
        return self._row_to_user(row)

    def update_parent_contact(
        self,
        user_id: int,
        *,
        parent_whatsapp: str,
        parent_contact_consent: bool,
    ) -> Optional[UserRecord]:
        consent_i = 1 if parent_contact_consent else 0
        wa = (parent_whatsapp or "").strip()
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE users SET parent_whatsapp = ?, parent_contact_consent = ? WHERE id = ?",
                (wa, consent_i, int(user_id)),
            )
            conn.commit()
            if cur.rowcount == 0:
                return None
        return self.get_user_by_id(user_id)

    @staticmethod
    def _row_to_user(row: sqlite3.Row) -> UserRecord:
        try:
            parent_wa = str(row["parent_whatsapp"] or "")
        except (KeyError, IndexError):
            parent_wa = ""
        try:
            consent_raw = int(row["parent_contact_consent"] or 0)
        except (KeyError, IndexError, TypeError, ValueError):
            consent_raw = 0
        return UserRecord(
            id=int(row["id"]),
            name=str(row["name"]),
            email=str(row["email"]),
            password_hash=str(row["password_hash"]),
            birth_date=str(row["birth_date"]),
            created_at=str(row["created_at"]),
            parent_whatsapp=parent_wa,
            parent_contact_consent=bool(consent_raw),
        )
