#!/bin/bash

# TinyClaw Railway Startup Script
# Supports: Anthropic Claude, OpenAI Codex, OpenCode, Discord, Telegram, WhatsApp, TinyOffice

# NOTE: intentionally no "set -e" — individual services may fail without tokens,
# but TinyOffice must always start so the user can configure everything from the UI.

echo "============================================="
echo "Starting TinyClaw on Railway..."
echo "============================================="

# Load environment variables from Railway
if [ -f "/env.sh" ]; then
    source /env.sh
fi

# Set defaults
AI_PROVIDER="${AI_PROVIDER:-anthropic}"
AI_MODEL="${AI_MODEL:-claude-sonnet-4-20250514}"
HEARTBEAT_INTERVAL="${HEARTBEAT_INTERVAL:-30}"
WORKSPACE_NAME="${WORKSPACE_NAME:-default}"
CHANNELS="${CHANNELS:-discord,telegram,whatsapp}"
TINYOFFICE_ENABLED="${TINYOFFICE_ENABLED:-true}"
TINYOFFICE_PORT="${TINYOFFICE_PORT:-3000}"

# Create necessary directories
mkdir -p /.tinyclaw/queue
mkdir -p /.tinyclaw/logs
mkdir -p /.tinyclaw/workspaces

echo "Configuration:"
echo "  AI Provider: $AI_PROVIDER"
echo "  AI Model: $AI_MODEL"
echo "  Channels: $CHANNELS"
echo "  TinyOffice: $TINYOFFICE_ENABLED"
echo ""

# Create settings.json from environment
echo "Creating configuration..."
cat > /.tinyclaw/settings.json << EOF
{
  "workspace": {
    "name": "$WORKSPACE_NAME"
  },
  "channels": {
    "enabled": ["discord", "telegram", "whatsapp"],
    "discord": {
      "bot_token": "${DISCORD_TOKEN:-}"
    },
    "telegram": {
      "bot_token": "${TELEGRAM_TOKEN:-}"
    },
    "whatsapp": {}
  },
  "models": {
    "provider": "$AI_PROVIDER",
    "anthropic": {
      "model": "${AI_MODEL:-claude-sonnet-4-20250514}"
    },
    "openai": {
      "model": "${AI_MODEL:-gpt-4o}"
    },
    "opencode": {
      "model": "${AI_MODEL:-default}"
    }
  },
  "monitoring": {
    "heartbeat_interval": $HEARTBEAT_INTERVAL
  }
}
EOF

echo "Settings created."
echo ""

# Start message queue processor (best-effort — won't block TinyOffice if it fails)
echo "Starting queue processor..."
npm run queue > /.tinyclaw/logs/queue.log 2>&1 &
QUEUE_PID=$!
sleep 2
if kill -0 $QUEUE_PID 2>/dev/null; then
    echo "  Queue processor running (PID: $QUEUE_PID)"
else
    echo "  WARNING: Queue processor exited early — check /.tinyclaw/logs/queue.log"
fi
echo ""

# Start channel services (best-effort — missing tokens just log a warning)
start_service() {
    local service=$1
    if [[ "$CHANNELS" == *"$service"* ]]; then
        echo "Starting $service..."
        npm run $service > /.tinyclaw/logs/$service.log 2>&1 &
        echo "  $service started (PID: $!)"
    fi
}

echo "Starting channel services..."
start_service "discord"
start_service "telegram"
start_service "whatsapp"
echo ""

# Start TinyOffice — this is the foreground process that keeps the container alive
if [ "$TINYOFFICE_ENABLED" = "true" ]; then
    echo "Starting TinyOffice web interface on port $TINYOFFICE_PORT..."
    PORT=$TINYOFFICE_PORT npm run visualize
else
    echo "TinyOffice disabled — tailing queue log to keep container alive..."
    tail -f /.tinyclaw/logs/queue.log
fi