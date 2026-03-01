# ─── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build:main

# ─── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

# Install Claude Code CLI globally (used by Anthropic provider)
# Codex CLI install is skipped here — supply OPENAI_API_KEY and use the
# anthropic provider on Railway unless you bring your own codex binary.
RUN npm install -g @anthropic-ai/claude-code

# Copy only production artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy lib/ (bash helpers used by tinyclaw.sh — not needed at runtime
# for the queue processor, but kept for completeness)
COPY lib/ ./lib/

# Copy the Docker entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Data directory — mount a Railway Volume here for persistence
ENV TINYCLAW_HOME=/data

# API server port
ENV TINYCLAW_API_PORT=3777
EXPOSE 3777

ENTRYPOINT ["/app/docker-entrypoint.sh"]
