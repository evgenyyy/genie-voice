# genie-voice

Bridge **Home Assistant Voice/Assist** to **Genie** using the **Webhook Conversation** integration.

Status: working end-to-end on Jay’s LAN (2026-01-28). STT/TTS remain in HA.

Repo: https://github.com/evgenyyy/genie-voice

## What this does

When you speak to Home Assistant:

- Genie treats the request **as if you messaged on Telegram** (same capabilities/tools).
- Outputs split automatically:
  1) **Telegram (full)** — long-form answer with links, code, bullets, etc.
  2) **Home Assistant (voice)** — short, TTS-friendly summary.

## Architecture

- HA STT (existing pipeline)
- **Webhook Conversation** Conversation Agent → `genie-voice-server` (`POST /ha/conversation`)
- `genie-voice-server` calls **Clawdbot Gateway** `/v1/responses`
- Returns `{"output":"..."}` (or streamed chunks) back to HA
- Sends full answer to Jay on Telegram in parallel

## Streaming (important)

If you enable **Response Streaming** in Webhook Conversation, HA expects **NDJSON**, not SSE.

See: `docs/STREAMING.md`.

## HA setup (Jay LAN)

- Genie box IP: `192.168.1.183`
- Webhook URL: `http://192.168.1.183:3210/ha/conversation`
- Output field: `output`
- Timeout: start with `60s` (reduce later)
- Response Streaming:
  - OFF works (simple JSON)
  - ON works (NDJSON streaming)

## Sessioning

- One continuous session across devices + Telegram.
- Device context (satellite/device) is included in the prompt so room-aware intents can be inferred.

## Server

`server/server.js` implements:
- `GET /health`
- `POST /ha/conversation`

Behavior:
- If `body.stream === true` → streams voice response as NDJSON `{"type":"item"...}` chunks then `{"type":"end"}`.
- In parallel, it generates and sends a full Telegram response.
- If `body.stream !== true` → returns a normal JSON `{output: <voice_summary>}` and sends Telegram in background.

## Gateway requirements

This uses the Gateway OpenResponses HTTP endpoint:
- `POST /v1/responses`

This endpoint is disabled by default; enable in Clawdbot config:

```json5
{
  gateway: {
    http: {
      endpoints: {
        responses: { enabled: true }
      }
    }
  }
}
```

## Run as a service

See: `systemd/INSTALL.md`
