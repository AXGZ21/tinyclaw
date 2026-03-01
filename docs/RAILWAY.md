# Deploying TinyClaw on Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/tinyclaw)

This guide covers deploying TinyClaw's two services on [Railway](https://railway.com):

| Service | Description | Port |
|---|---|---|
| `tinyclaw` | Queue processor + REST/SSE API + channel bots | `3777` |
| `tinyoffice` | Next.js web dashboard | `3000` |

---

## Prerequisites

- A [Railway](https://railway.com) account
- At least one of:
  - **Anthropic API key** (`ANTHROPIC_API_KEY`) — for Claude
  - **OpenAI API key** (`OPENAI_API_KEY`) — for Codex CLI
- At least one bot token (Discord or Telegram)

> **Note:** WhatsApp is **not** supported on Railway. It requires an interactive QR-code scan and a persistent browser session, which are incompatible with Railway's ephemeral container environment. Use Discord or Telegram instead.

---

## Quick Deploy

### Option 1: One-click template

Click the **Deploy on Railway** button above. Fill in the required environment variables in the Railway UI.

### Option 2: Deploy from your fork

1. Fork [TinyAGI/tinyclaw](https://github.com/TinyAGI/tinyclaw) on GitHub
2. Go to [Railway Dashboard](https://railway.com/dashboard) → **New Project** → **Deploy from GitHub repo**
3. Select your fork
4. Railway will detect both `Dockerfile` and `tinyoffice/Dockerfile` automatically

---

## Environment Variables

### `tinyclaw` (backend)

| Variable | Required | Default | Description |
|---|---|---|---|
| `AI_PROVIDER` | ✅ | `anthropic` | `anthropic` or `openai` |
| `AI_MODEL` | | `sonnet` | Model name (e.g. `sonnet`, `opus`, `gpt-5.3-codex`) |
| `ANTHROPIC_API_KEY` | If anthropic | — | Anthropic API key |
| `OPENAI_API_KEY` | If openai | — | OpenAI API key |
| `TINYCLAW_CHANNELS` | | _(none)_ | Comma-separated: `discord,telegram` |
| `DISCORD_BOT_TOKEN` | If discord | — | Discord bot token |
| `TELEGRAM_BOT_TOKEN` | If telegram | — | Telegram bot token |
| `TINYCLAW_API_PORT` | | `3777` | API server port |
| `TINYCLAW_HOME` | | `/data` | Data dir (set to Volume mount path) |
| `AGENT_NAME` | | `Assistant` | Default agent display name |
| `HEARTBEAT_INTERVAL` | | `3600` | Heartbeat interval in seconds |

### `tinyoffice` (frontend)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | — | Public URL of the `tinyclaw` backend (e.g. `https://tinyclaw-xyz.up.railway.app`) |
| `PORT` | | `3000` | Injected automatically by Railway |

---

## Persistent Storage (Volume)

TinyClaw stores its SQLite queue database, settings, and logs in `TINYCLAW_HOME` (`/data` by default).

**Without a Volume**, this data is lost every time the container restarts.

To add persistence:

1. In the Railway dashboard, open the `tinyclaw` service
2. Go to **Settings** → **Volumes**
3. Add a Volume mounted at `/data`

---

## Connecting TinyOffice to the Backend

After deploying both services:

1. Open the `tinyclaw` service in Railway → **Settings** → copy the **Public URL**
2. Open the `tinyoffice` service → **Variables**
3. Set `NEXT_PUBLIC_API_URL` to the tinyclaw public URL (e.g. `https://tinyclaw-production.up.railway.app`)
4. Redeploy TinyOffice

---

## Architecture on Railway

```
Internet
   │
   ├─► tinyoffice (Next.js, port 3000)
   │        │  NEXT_PUBLIC_API_URL
   │        ▼
   └─► tinyclaw  (Hono API, port 3777)
              │  node dist/queue-processor.js
              │  node dist/channels/discord-client.js
              │  node dist/channels/telegram-client.js
              │
              ▼
         /data/tinyclaw.db  (Railway Volume)
```

---

## Troubleshooting

**Agents not responding:**
- Check that `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set and valid
- View logs: Railway dashboard → `tinyclaw` service → **Logs**

**Channel bots not working:**
- Verify `TINYCLAW_CHANNELS` includes the channel (e.g. `discord,telegram`)
- Ensure the bot token env var is set and correct

**TinyOffice can't connect to backend:**
- Check `NEXT_PUBLIC_API_URL` points to the correct Railway public URL (with `https://`)
- Make sure the tinyclaw service is healthy (green in Railway dashboard)

**Data lost after restart:**
- Add a Railway Volume mounted at `/data`
