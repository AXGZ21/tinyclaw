#!/usr/bin/env bash
# docker-entrypoint.sh
# Bootstraps TinyClaw data directories, generates settings.json from env vars,
# starts enabled channel clients (Discord, Telegram), then runs the queue
# processor as the main process.
#
# NOTE: WhatsApp is NOT supported in Docker/Railway (requires interactive QR
# scan and a persistent Puppeteer browser session).

set -euo pipefail

TINYCLAW_HOME="${TINYCLAW_HOME:-/data}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🦞 TinyClaw starting up..."
echo "   Data dir : $TINYCLAW_HOME"
echo "   API port : ${TINYCLAW_API_PORT:-3777}"

# ── 1. Create data directories ─────────────────────────────────────────────────
mkdir -p \
  "$TINYCLAW_HOME/logs" \
  "$TINYCLAW_HOME/queue/incoming" \
  "$TINYCLAW_HOME/queue/processing" \
  "$TINYCLAW_HOME/queue/outgoing" \
  "$TINYCLAW_HOME/events" \
  "$TINYCLAW_HOME/chats" \
  "$TINYCLAW_HOME/files" \
  "$TINYCLAW_HOME/channels"

# ── 2. Generate settings.json from environment variables ───────────────────────
SETTINGS_FILE="$TINYCLAW_HOME/settings.json"

if [ ! -f "$SETTINGS_FILE" ]; then
  echo "📝 Generating settings.json from environment variables..."

  AI_PROVIDER="${AI_PROVIDER:-anthropic}"
  AI_MODEL="${AI_MODEL:-sonnet}"
  CHANNELS_CSV="${TINYCLAW_CHANNELS:-}"        # e.g. "discord,telegram"
  WORKSPACE_PATH="${TINYCLAW_WORKSPACE_PATH:-/data/workspace}"
  HEARTBEAT_INTERVAL="${HEARTBEAT_INTERVAL:-3600}"
  AGENT_NAME="${AGENT_NAME:-Assistant}"

  mkdir -p "$WORKSPACE_PATH/assistant"

  # Build enabled channels JSON array
  ENABLED_JSON="[]"
  DISCORD_JSON="{}"
  TELEGRAM_JSON="{}"

  if echo "$CHANNELS_CSV" | grep -q "discord"; then
    ENABLED_JSON=$(echo "$ENABLED_JSON" | node -e \
      "const a=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));a.push('discord');process.stdout.write(JSON.stringify(a))")
    DISCORD_TOKEN="${DISCORD_BOT_TOKEN:-}"
    DISCORD_JSON="{\"bot_token\":\"$DISCORD_TOKEN\"}"
  fi

  if echo "$CHANNELS_CSV" | grep -q "telegram"; then
    ENABLED_JSON=$(echo "$ENABLED_JSON" | node -e \
      "const a=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));a.push('telegram');process.stdout.write(JSON.stringify(a))")
    TELEGRAM_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
    TELEGRAM_JSON="{\"bot_token\":\"$TELEGRAM_TOKEN\"}"
  fi

  # Write settings.json using node (avoids jq dependency)
  node -e "
const settings = {
  channels: {
    enabled: $ENABLED_JSON,
    discord: $DISCORD_JSON,
    telegram: $TELEGRAM_JSON,
    whatsapp: {}
  },
  workspace: {
    path: '$WORKSPACE_PATH',
    name: 'tinyclaw-workspace'
  },
  agents: {
    assistant: {
      name: '$AGENT_NAME',
      provider: '$AI_PROVIDER',
      model: '$AI_MODEL',
      working_directory: '$WORKSPACE_PATH/assistant'
    }
  },
  teams: {},
  models: {
    provider: '$AI_PROVIDER',
    anthropic: { model: '$AI_MODEL' },
    openai: { model: '$AI_MODEL' }
  },
  monitoring: {
    heartbeat_interval: $HEARTBEAT_INTERVAL
  }
};
require('fs').writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2));
console.log('✅ settings.json written.');
"
else
  echo "✅ Found existing settings.json — skipping generation."
fi

# ── 3. Configure claude CLI authentication ─────────────────────────────────────
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "🔑 Setting up Anthropic authentication..."
  mkdir -p "$HOME/.claude"
  # claude uses ANTHROPIC_API_KEY env var directly — no extra config needed
  echo "   ANTHROPIC_API_KEY is set."
fi

if [ -n "${OPENAI_API_KEY:-}" ]; then
  echo "🔑 OpenAI API key detected."
fi

# ── 4. Start channel clients in background ─────────────────────────────────────
CHANNELS_CSV="${TINYCLAW_CHANNELS:-}"

if echo "$CHANNELS_CSV" | grep -q "discord" && [ -n "${DISCORD_BOT_TOKEN:-}" ]; then
  echo "🤖 Starting Discord channel client..."
  node "$SCRIPT_DIR/dist/channels/discord-client.js" \
    >> "$TINYCLAW_HOME/logs/discord.log" 2>&1 &
  echo "   PID $!"
fi

if echo "$CHANNELS_CSV" | grep -q "telegram" && [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
  echo "🤖 Starting Telegram channel client..."
  node "$SCRIPT_DIR/dist/channels/telegram-client.js" \
    >> "$TINYCLAW_HOME/logs/telegram.log" 2>&1 &
  echo "   PID $!"
fi

# ── 5. Run queue processor (foreground — this is the main process) ─────────────
echo ""
echo "🚀 Launching queue processor + API server..."
exec node "$SCRIPT_DIR/dist/queue-processor.js"
