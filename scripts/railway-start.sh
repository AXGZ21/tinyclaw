#!/bin/bash

# TinyClaw Railway Startup Script
# NOTE: no "set -e" — services without tokens fail gracefully, TinyOffice always starts

echo "================================================="
echo "Starting TinyClaw on Railway..."
echo "================================================="

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
TINYCLAW_API_PORT="${TINYCLAW_API_PORT:-3777}"

# Create necessary directories
mkdir -p /.tinyclaw/queue
mkdir -p /.tinyclaw/logs
mkdir -p /.tinyclaw/workspaces

echo "Configuration:"
echo "  AI Provider: $AI_PROVIDER"
echo "  AI Model: $AI_MODEL"
echo "  Channels: $CHANNELS"
echo "  TinyOffice: $TINYOFFICE_ENABLED (port $TINYOFFICE_PORT)"
echo "  API Server: port $TINYCLAW_API_PORT"
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
      "model": "${AI_MODEL:-gpt4o}"
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

# Start API server in background (provides backend for TinyOffice)
echo "Starting API server on port $TINYCLAW_API_PORT..."
TINYCLAW_API_PORT=$TINYCLAW_API_PORT npm run server > /.tinyclaw/logs/api.log 2>&1 &
API_PID=$!
sleep 2
if kill -0 $API_PID 2>/dev/null; then
    echo "  API server running (PID: $API_PID)"
else
    echo "  WARNING: API server exited early — check /.tinyclaw/logs/api.log"
fi
echo ""

# Start queue processor in background (best-effort)
echo "Starting queue processor..."
npm run queue > /.tinyclaw/logs/queue.log 2>&1 &
QUEUE_PID=$!
sleep 1
if kill -0 $QUEUE_PID 2>/dev/null; then
    echo "  Queue processor running (PID: $QUEUE_PID)"
else
    echo "  WARNING: Queue processor exited early — check /.tinyclaw/logs/queue.log"
fi
echo ""

# Start channel services in background (best-effort — missing tokens just log warning)
start_service() {
    local service=$1
    if [[ "$CHANNELS" == *"$service"* ]]; then
        npm run $service > /.tinyclaw/logs/$service.log 2>&1 &
        echo "  $service started (PID: $!)"
    fi
}

echo "Starting channel services..."
start_service "discord"
start_service "telegram"
start_service "whatsapp"
echo ""

# Start TinyOffice as foreground process (keeps container alive)
if [ "$TINYOFFICE_ENABLED" = "true" ]; then
    echo "Starting TinyOffice on port $TINYOFFICE_PORT..."
    cd /app/tinyoffice && PORT=$TINYOFFICE_PORT npm start
else
    echo "TinyOffice disabled. Waiting for background services..."
    wait $QUEUE_PID
fi