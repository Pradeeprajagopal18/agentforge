import json
import os

SETTINGS_PATH = os.path.join(os.path.dirname(__file__), "settings.json")

DEFAULT_SETTINGS = {
    "model": "",
    "system_prompt": "",
    "working_dir": os.path.expanduser("~"),
    "allowed_tools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    "mcp_servers": {},
    "team_prompts_path": "",
    "github_token": "",
    "anthropic_api_key": "",
}


def load_settings() -> dict:
    if os.path.exists(SETTINGS_PATH):
        try:
            with open(SETTINGS_PATH) as f:
                saved = json.load(f)
            # Merge with defaults to handle new keys
            return {**DEFAULT_SETTINGS, **saved}
        except Exception:
            pass
    return DEFAULT_SETTINGS.copy()


def save_settings(settings: dict):
    merged = {**DEFAULT_SETTINGS, **settings}
    with open(SETTINGS_PATH, "w") as f:
        json.dump(merged, f, indent=2)
    # Write MCP config to ~/.claude/mcp.json as well
    write_mcp_config(merged.get("mcp_servers", {}))
    return merged


def write_mcp_config(mcp_servers: dict):
    """Sync MCP servers to ~/.claude/mcp.json for Claude Code to pick up."""
    claude_dir = os.path.expanduser("~/.claude")
    os.makedirs(claude_dir, exist_ok=True)
    mcp_path = os.path.join(claude_dir, "mcp.json")
    config = {"mcpServers": mcp_servers}
    with open(mcp_path, "w") as f:
        json.dump(config, f, indent=2)
