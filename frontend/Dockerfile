FROM node:20-alpine

WORKDIR /app/frontend

# Install dependencies
COPY frontend/package*.json ./
RUN npm install

# Copy source
COPY frontend/ .

EXPOSE 5173

# --host 0.0.0.0 makes Vite listen on all interfaces so the port is
# reachable from outside the container.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
