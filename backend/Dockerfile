FROM python:3.12-slim

# Install Node.js 20 (required for the claude CLI) + curl (for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app/backend

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source (data files are bind-mounted at runtime)
COPY backend/*.py ./

# Ensure data files exist so Docker bind mounts don't create directories
# instead of files when the host files are missing on first run.
RUN touch conversations.db settings.json

ENV PYTHONUNBUFFERED=1

EXPOSE 9000
CMD ["python", "main.py"]
