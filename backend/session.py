import asyncio
import json
import os
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from claude_bridge import ClaudeBridge

DB_PATH = os.path.join(os.path.dirname(__file__), "conversations.db")


def init_db():
    """Initialize SQLite schema."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT,
            parent_id TEXT,
            branch_at TEXT,
            created_at TEXT,
            updated_at TEXT
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT,
            role TEXT,
            content TEXT,
            tool_calls TEXT,
            attachments TEXT,
            cost_usd REAL,
            created_at TEXT,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        )
    """)
    conn.commit()
    conn.close()


def save_conversation(conv_id: str, title: str):
    conn = sqlite3.connect(DB_PATH)
    now = datetime.utcnow().isoformat()
    conn.execute("""
        INSERT OR IGNORE INTO conversations (id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?)
    """, (conv_id, title, now, now))
    conn.execute("UPDATE conversations SET updated_at=? WHERE id=?", (now, conv_id))
    conn.commit()
    conn.close()


def save_message(conv_id: str, role: str, content: str,
                 tool_calls: list = None, attachments: list = None, cost_usd: float = None):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        INSERT INTO messages (id, conversation_id, role, content, tool_calls, attachments, cost_usd, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        str(uuid.uuid4()), conv_id, role, content,
        json.dumps(tool_calls or []),
        json.dumps(attachments or []),
        cost_usd,
        datetime.utcnow().isoformat()
    ))
    conn.commit()
    conn.close()


def load_conversations() -> list[dict]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM conversations ORDER BY updated_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def load_messages(conv_id: str) -> list[dict]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC",
        (conv_id,)
    ).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["tool_calls"] = json.loads(d["tool_calls"] or "[]")
        d["attachments"] = json.loads(d["attachments"] or "[]")
        result.append(d)
    return result




def branch_conversation(source_id: str, branch_at_msg_id: str) -> dict:
    """Fork a conversation at a specific message, copying history up to that point."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    source = conn.execute("SELECT * FROM conversations WHERE id=?", (source_id,)).fetchone()
    if not source:
        conn.close()
        raise ValueError(f"Conversation {source_id} not found")
    all_msgs = conn.execute(
        "SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC", (source_id,)
    ).fetchall()
    branch_msgs = []
    for m in all_msgs:
        branch_msgs.append(dict(m))
        if m["id"] == branch_at_msg_id:
            break
    new_id    = str(uuid.uuid4())
    now       = datetime.utcnow().isoformat()
    new_title = f"{source['title'] or 'Conversation'} (branch)"
    conn.execute("""
        INSERT INTO conversations (id, title, parent_id, branch_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (new_id, new_title, source_id, branch_at_msg_id, now, now))
    for m in branch_msgs:
        conn.execute("""
            INSERT INTO messages (id, conversation_id, role, content, tool_calls, attachments, cost_usd, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (str(uuid.uuid4()), new_id, m["role"], m["content"],
              m["tool_calls"], m["attachments"], m["cost_usd"], m["created_at"]))
    conn.commit()
    conn.close()
    return {"id": new_id, "title": new_title, "parent_id": source_id,
            "branch_at": branch_at_msg_id, "created_at": now, "updated_at": now,
            "message_count": len(branch_msgs)}

def rename_conversation(conv_id: str, title: str):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("UPDATE conversations SET title=? WHERE id=?", (title, conv_id))
    conn.commit()
    conn.close()


def delete_conversation(conv_id: str):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM messages WHERE conversation_id=?", (conv_id,))
    conn.execute("DELETE FROM conversations WHERE id=?", (conv_id,))
    conn.commit()
    conn.close()


def get_conversation_stats(conv_id: str) -> dict:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT role, cost_usd FROM messages WHERE conversation_id=?",
        (conv_id,)
    ).fetchall()
    conn.close()

    assistant_msgs = [r for r in rows if r["role"] == "assistant"]
    costs = [r["cost_usd"] for r in assistant_msgs if r["cost_usd"]]
    total_cost = sum(costs)

    return {
        "total_cost":  total_cost,
        "turn_count":  len(assistant_msgs),
        "avg_cost":    total_cost / len(costs) if costs else 0,
        "message_count": len(rows),
    }


@dataclass
class Session:
    id: str
    bridge: ClaudeBridge = field(default_factory=ClaudeBridge)
    streaming: bool = False

    async def start(self):
        await self.bridge.start()

    def interrupt(self):
        self.bridge.interrupt()
        self.streaming = False

    async def stop(self):
        await self.bridge.stop()
