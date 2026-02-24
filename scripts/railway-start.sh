#!/bin/bash

# TinyClaw Railway Startup Script
# Supports: Anthropic Claude, OpenAI Codex, OpenCode, Discord, Telegram, WhatsApp, TinyOffice

set -e

echo "==========================================="
echo "Starting TinyClaw on Railway..."
echo "==========================================="

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

# Check for API keys based on provider
if [ "$AI_PROVIDER" = "anthropic" ] && [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "ERROR: ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic"
    # Don't exit - continue and let it be configured via TinyOffice
fi

if [ "$AI_PROVIDER" = "openai" ] && [ -z "$OPENAI_API_KEY" ]; then
    echo "WARNING: OPENAI_API_KEY not set, will be configured via TinyOffice"
fi

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
      "model": "${AI_MODEL:-gpt-5.3-codex}"
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

# Function to start a service
start_service() {
    local service=$1
    local required_env=$2

    if [[ "$CHANNELS" == *"$service"* ]]; then
        echo "Starting $service..."
        # Always try to start - it will handle missing tokens internally
        npm run $service > /.tinyclaw/logs/$service.log 2>&1 &
        echo "  $service started (PID: $!)"
    fi
}

# Start message queue processor (always runs)
echo "Starting queue processor..."
npm run queue > /.tinyclaw/logs/queue.log 2>&1 &
echo "  Queue processor started (PID: $!)"
echo ""

# Start enabled channel services
echo "Starting channel services..."
start_service "discord" "DISCORD_TOKEN"
start_service "telegram" "TELEGRAM_TOKEN"
start_service "whatsapp" "WHATSAPP_SESSION"

echo ""

# Start TinyOffice if enabled
if [ "$TINYOFFICE_ENABLED" = "true" ]; then
    echo "Starting TinyOffice web portal..."

    # Build TinyOffice
    cd tinyoffice
    npm install --silent 2>/dev/null || true
    npm run build 2>/dev/null || true

    # Start TinyOffice in background
    cd ..

    # TinyOffice runs on port 3000 by default
    (cd tinyoffice && PORT=$TINYOFFICE_PORT npm run start > /.tinyclaw/logs/tinyoffice.log 2>&1) &
    echo "  TinyOffice started on port $TINYOFFICE_PORT (PID: $!)"
fi

echo ""
echo "==========================================="
echo "TinyClaw is running!"
echo "==========================================="
echo ""
echo "Service Endpoints:"
echo "  - AI Provider: $AI_PROVIDER"
if [ "$TINYOFFICE_ENABLED" = "true" ]; then
    echo "  - TinyOffice: http://localhost:$TINYOFFICE_PORT"
fi
echo ""
echo "Configure everything via TinyOffice web portal!"
echo "View logs: railway logs"

# Keep the process running
wait
