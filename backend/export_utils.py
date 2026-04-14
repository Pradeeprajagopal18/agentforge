import json
from datetime import datetime


def export_as_markdown(conv_title: str, messages: list[dict]) -> str:
    """Convert a conversation to clean markdown."""
    lines = [
        f"# {conv_title}",
        f"*Exported {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}*",
        "",
        "---",
        "",
    ]

    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "").strip()
        tool_calls = msg.get("tool_calls") or []
        cost = msg.get("cost_usd")
        ts = msg.get("created_at", "")

        if role == "user":
            lines.append(f"## 🧑 You")
            if ts:
                lines.append(f"*{ts[:19].replace('T', ' ')}*")
            lines.append("")
            lines.append(content)
            attachments = msg.get("attachments") or []
            for att in attachments:
                lines.append(f"\n> 📎 Attachment: `{att.get('name', '')}`")
            lines.append("")

        elif role == "assistant":
            lines.append(f"## 🤖 Claude")
            meta_parts = []
            if ts:
                meta_parts.append(ts[:19].replace('T', ' '))
            if cost:
                meta_parts.append(f"${cost:.4f}")
            if meta_parts:
                lines.append(f"*{' · '.join(meta_parts)}*")
            lines.append("")

            # Tool calls
            if tool_calls:
                for tc in tool_calls:
                    name = tc.get("name", "unknown")
                    inp = tc.get("input", {})
                    lines.append(f"> 🔧 **{name}**")
                    if inp:
                        # Show key args inline
                        preview = ", ".join(f"`{k}={str(v)[:40]}`" for k, v in list(inp.items())[:2])
                        lines.append(f"> {preview}")
                lines.append("")

            lines.append(content)
            lines.append("")

        lines.append("---")
        lines.append("")

    return "\n".join(lines)


def export_as_json(conv_id: str, conv_title: str, messages: list[dict]) -> dict:
    """Export full conversation as structured JSON."""
    total_cost = sum(m.get("cost_usd") or 0 for m in messages if m.get("role") == "assistant")
    return {
        "export_version": "1.0",
        "exported_at": datetime.utcnow().isoformat(),
        "conversation": {
            "id": conv_id,
            "title": conv_title,
            "message_count": len(messages),
            "total_cost_usd": round(total_cost, 6),
        },
        "messages": [
            {
                "role":        m.get("role"),
                "content":     m.get("content", ""),
                "tool_calls":  m.get("tool_calls") or [],
                "attachments": [{"name": a.get("name"), "type": a.get("type")} for a in (m.get("attachments") or [])],
                "cost_usd":    m.get("cost_usd"),
                "created_at":  m.get("created_at"),
            }
            for m in messages
        ],
    }
