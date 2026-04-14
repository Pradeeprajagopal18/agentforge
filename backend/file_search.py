import os
import fnmatch

# File types we'll index and return
ALLOWED_EXTENSIONS = {
    '.py', '.js', '.ts', '.jsx', '.tsx', '.go', '.rs', '.java',
    '.cpp', '.c', '.h', '.rb', '.php', '.swift', '.kt',
    '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.env',
    '.sh', '.bash', '.zsh', '.sql', '.html', '.css', '.scss',
    '.xml', '.csv', '.log', '.conf', '.ini', '.cfg',
    '.png', '.jpg', '.jpeg', '.gif', '.webp',
}

IGNORE_DIRS = {
    '.git', 'node_modules', '__pycache__', '.venv', 'venv',
    'dist', 'build', '.next', '.nuxt', 'target', '.idea',
    '.vscode', 'coverage', '.pytest_cache', '.mypy_cache',
}

MAX_FILE_SIZE_KB = 512


def search_files(working_dir: str, query: str, limit: int = 8) -> list[dict]:
    """
    Walk working_dir and return files whose names contain `query`.
    Returns list of {name, path, size_kb, ext}.
    """
    query_lower = query.lower()
    results = []

    try:
        for root, dirs, files in os.walk(working_dir):
            # Prune ignored dirs in-place
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith('.')]

            for fname in files:
                ext = os.path.splitext(fname)[1].lower()
                if ext not in ALLOWED_EXTENSIONS:
                    continue
                if query_lower and query_lower not in fname.lower():
                    continue

                full_path = os.path.join(root, fname)
                try:
                    size_bytes = os.path.getsize(full_path)
                    size_kb = round(size_bytes / 1024, 1)
                    if size_kb > MAX_FILE_SIZE_KB:
                        continue
                except OSError:
                    continue

                # Make path relative to working_dir for display
                rel_path = os.path.relpath(full_path, working_dir)
                results.append({
                    "name": fname,
                    "path": rel_path,
                    "full_path": full_path,
                    "size_kb": size_kb,
                    "ext": ext.lstrip('.'),
                })

                if len(results) >= limit * 4:  # collect more, sort, trim
                    break

            if len(results) >= limit * 4:
                break

    except PermissionError:
        pass

    # Sort: exact name matches first, then by path length (shallower = more relevant)
    results.sort(key=lambda f: (
        0 if f['name'].lower().startswith(query_lower) else 1,
        len(f['path'])
    ))

    return results[:limit]


def read_file(full_path: str) -> str | None:
    """Read a text file and return its content. Returns None for binary files."""
    try:
        with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
            return f.read()
    except Exception:
        return None
