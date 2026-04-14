"""
Prompt Library — manages personal and team prompt collections.

Storage:
  personal : {app_dir}/prompts.yaml
  team     : path configured in settings["team_prompts_path"]
             (can be a shared network path, git repo, or local dir)

Schema (prompts.yaml):
  prompts:
    - id: unique-slug
      title: "Short name"
      description: "What it does"
      category: "code" | "review" | "docs" | "general" | "custom"
      prompt: |
        Full prompt text here.
        Can be multi-line.
      tags: [python, review, security]
      shortcut: "/rp"   # optional, starts with /
"""

import os
import yaml
import uuid
from datetime import datetime
from typing import Optional

APP_DIR = os.path.dirname(__file__)
PERSONAL_PROMPTS_PATH = os.path.join(APP_DIR, "prompts.yaml")

BUILTIN_PROMPTS = [
    {
        "id": "pr-review-full",
        "title": "Full PR Review",
        "description": "Multi-persona review: Architect, Security, QA, Performance",
        "category": "review",
        "shortcut": "/pr",
        "tags": ["review", "code", "security"],
        "prompt": """You are a senior engineering team conducting a thorough PR review. Analyze the provided code changes through 5 expert lenses:

**🏗️ Application Architect**
- Design patterns and architectural decisions
- Component coupling and cohesion
- Scalability and maintainability concerns
- API contract implications

**🔒 Security Engineer**
- Input validation and sanitization
- Authentication / authorization gaps
- Injection risks (SQL, XSS, command)
- Secrets or credentials in code
- Dependency vulnerabilities

**🧪 QA Engineer**
- Test coverage gaps
- Edge cases not handled
- Error handling completeness
- Regression risk

**⚡ Performance Engineer**
- Algorithmic complexity (O-notation)
- Database query efficiency (N+1, missing indexes)
- Memory allocation patterns
- Caching opportunities

**📖 Code Quality**
- Naming clarity and consistency
- Dead code or over-engineering
- Documentation gaps
- Style and convention violations

For each finding provide: **severity** (critical/major/minor/nit), **location**, and **recommendation**.
End with an overall **APPROVE / REQUEST CHANGES / NEEDS DISCUSSION** verdict.""",
    },
    {
        "id": "explain-code",
        "title": "Explain This Code",
        "description": "Clear explanation for any audience level",
        "category": "code",
        "shortcut": "/explain",
        "tags": ["explain", "docs"],
        "prompt": "Explain this code clearly. Cover: what it does, how it works, any gotchas or non-obvious behavior, and what a developer would need to know to safely modify it.",
    },
    {
        "id": "write-tests",
        "title": "Write Tests",
        "description": "Generate comprehensive test suite",
        "category": "code",
        "shortcut": "/test",
        "tags": ["testing", "code"],
        "prompt": """Write a comprehensive test suite for this code. Include:
- Happy path tests
- Edge cases and boundary conditions
- Error/exception scenarios  
- Input validation tests
- Any async behavior if applicable

Use the same language and testing framework already in the codebase. Add clear test descriptions.""",
    },
    {
        "id": "refactor",
        "title": "Refactor & Improve",
        "description": "Suggest and apply refactoring improvements",
        "category": "code",
        "shortcut": "/refactor",
        "tags": ["refactor", "code", "quality"],
        "prompt": "Refactor this code for clarity, maintainability, and performance. Explain each change you make and why. Preserve all existing behavior and interfaces.",
    },
    {
        "id": "write-docs",
        "title": "Write Documentation",
        "description": "Generate README, docstrings, or API docs",
        "category": "docs",
        "shortcut": "/docs",
        "tags": ["docs", "readme"],
        "prompt": "Write comprehensive documentation for this code. Include: overview, installation/setup, usage examples, API reference (if applicable), and any important caveats.",
    },
    {
        "id": "debug",
        "title": "Debug This",
        "description": "Systematic debugging and root cause analysis",
        "category": "code",
        "shortcut": "/debug",
        "tags": ["debug", "fix"],
        "prompt": "Debug this issue systematically. Identify the root cause, explain why it's happening, list what you tried, and provide a fix with explanation.",
    },
    {
        "id": "security-audit",
        "title": "Security Audit",
        "description": "Deep security review of code or config",
        "category": "review",
        "shortcut": "/sec",
        "tags": ["security", "audit"],
        "prompt": """Perform a thorough security audit. Check for:
- OWASP Top 10 vulnerabilities
- Hardcoded secrets or credentials
- Insecure defaults or configurations
- Privilege escalation paths
- Data exposure risks
- Dependency vulnerabilities

Rate each finding by CVSS severity. Provide concrete remediation steps.""",
    },
    {
        "id": "architecture-review",
        "title": "Architecture Review",
        "description": "System design and architecture analysis",
        "category": "review",
        "shortcut": "/arch",
        "tags": ["architecture", "design"],
        "prompt": "Review this system/component architecture. Assess: scalability, reliability, maintainability, cost efficiency, and alignment with best practices. Identify single points of failure and suggest improvements.",
    },
    {
        "id": "commit-message",
        "title": "Write Commit Message",
        "description": "Conventional commits format",
        "category": "general",
        "shortcut": "/commit",
        "tags": ["git", "commit"],
        "prompt": "Write a conventional commit message for these changes. Use format: type(scope): description. Add a body explaining the why if needed. Types: feat, fix, docs, style, refactor, test, chore.",
    },
    {
        "id": "release-notes",
        "title": "Release Notes",
        "description": "User-facing release notes from changes",
        "category": "docs",
        "shortcut": "/release",
        "tags": ["release", "docs", "changelog"],
        "prompt": "Write clear, user-facing release notes for these changes. Group by: New Features, Improvements, Bug Fixes, Breaking Changes. Use plain language, not technical jargon.",
    },
]


def _load_yaml(path: str) -> list[dict]:
    if not os.path.exists(path):
        return []
    try:
        with open(path) as f:
            data = yaml.safe_load(f) or {}
        return data.get("prompts", [])
    except Exception as e:
        print(f"[prompts] Failed to load {path}: {e}")
        return []


def _save_yaml(path: str, prompts: list[dict]):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        yaml.dump({"prompts": prompts}, f, default_flow_style=False, allow_unicode=True, sort_keys=False)


def get_all_prompts(team_path: Optional[str] = None) -> dict:
    personal = _load_yaml(PERSONAL_PROMPTS_PATH)
    team     = _load_yaml(team_path) if team_path else []

    # Mark sources
    for p in personal: p["source"] = "personal"
    for p in team:     p["source"] = "team"
    builtin = [{**p, "source": "builtin"} for p in BUILTIN_PROMPTS]

    return {
        "builtin":  builtin,
        "personal": personal,
        "team":     team,
        "all":      builtin + team + personal,
    }


def save_personal_prompt(prompt: dict) -> dict:
    prompts = _load_yaml(PERSONAL_PROMPTS_PATH)
    prompt["id"]         = prompt.get("id") or str(uuid.uuid4())[:8]
    prompt["updated_at"] = datetime.utcnow().isoformat()

    # Update if exists, else append
    idx = next((i for i, p in enumerate(prompts) if p["id"] == prompt["id"]), None)
    if idx is not None:
        prompts[idx] = prompt
    else:
        prompts.append(prompt)

    _save_yaml(PERSONAL_PROMPTS_PATH, prompts)
    return prompt


def delete_personal_prompt(prompt_id: str) -> bool:
    prompts = _load_yaml(PERSONAL_PROMPTS_PATH)
    new     = [p for p in prompts if p["id"] != prompt_id]
    if len(new) == len(prompts):
        return False
    _save_yaml(PERSONAL_PROMPTS_PATH, new)
    return True


def sync_team_prompts(team_path: str) -> dict:
    """
    Pull latest team prompts from a git repo path or shared folder.
    Returns status and count.
    """
    if not team_path or not os.path.exists(team_path):
        return {"ok": False, "error": f"Path not found: {team_path}"}

    prompts = _load_yaml(team_path)
    return {"ok": True, "count": len(prompts), "path": team_path}
